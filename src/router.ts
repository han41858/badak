import { RouteFunction, RouteFunctionObj, RouteOption, RouteRule, RouteRuleSeed, TypedObject } from './interfaces.js';
import { METHOD } from './constants.js';
import { isValidBodyLimit, sift } from './util.js';
import { isQuestionPattern, matchQuestionPattern, parseQuestionPattern, questionPatternsIntersect } from './question-pattern.js';
import {
	canonicalRouteKey,
	compileRouteSegment,
	findNormalRouteKey,
	invalidateNormalRouteIndex,
	RouteSegment,
	tokenizeRequestPath
} from './route-segment.js';


// only bodyLimit is validated, other keys are not checked to keep the behavior of 2.0
export const checkRouteFunctionObj = (value: unknown): void => {
	if (typeof value !== 'object' || value === null) {
		// route function, checked by itself
		return;
	}

	const option: unknown = (value as RouteFunctionObj).option;

	if (
		typeof option === 'object'
		&& option !== null
		&& (option as RouteOption).bodyLimit !== undefined
		&& !isValidBodyLimit((option as RouteOption).bodyLimit)
	) {
		throw new Error(`invalid bodyLimit : ${ String((option as RouteOption).bodyLimit) }`);
	}
};

/**
 * rule format, reserved keyword is 4-methods in upper cases
 * example)
 * {
 *     'users' : {
 *         'GET' : getUserList,
 *         'POST' : addUser,
 *
 *         ':id' : {
 *             'GET' : getUser,
 *             'PUT' : updateUser,
 *             'DELETE' : deleteUser
 *         }
 *     }
 * }
 */

const isMethodKey = (key: string): boolean => Object.values(METHOD).includes(key as METHOD);

enum LOOP_CONTROL {
	CONTINUE = 'C'
}

// '**' captures the rest of the path, so it is allowed only as the last uri fragment
// e.g. '/files/**' is ok, '/files/**/edit' throws
const checkDoubleAsteriskPosition = (rule: RouteRule): void => {
	for (const [key, child] of Object.entries(rule)) {
		if (Object.values(METHOD).includes(key as METHOD) || typeof child !== 'object' || child === null) {
			continue;
		}

		if (
			key === '**'
			&& Object.keys(child).some((childKey: string): boolean => !Object.values(METHOD).includes(childKey as METHOD))
		) {
			throw new Error('invalid double asterisk route, \'**\' should be the last uri fragment');
		}

		checkDoubleAsteriskPosition(child as RouteRule);
	}
};

// refine route rule, this function can be called recursively
// defaultMethod : method for a route function assigned without method key
export const refineRouteRule = (rule: RouteRule | RouteRuleSeed, defaultMethod: METHOD | undefined, isRoot: boolean = true): RouteRule => {
	if (rule === undefined) {
		throw new Error('no rule');
	}

	const keys: string[] = Object.keys(rule);

	if (keys.length === 0) {
		throw new Error('no rule in rule object');
	}

	const refinedRuleObj: RouteRule = {};

	// called recursively
	for (const [uri, value] of Object.entries(rule)) {
		if (uri.includes('//')) {
			throw new Error('invalid double slash');
		}

		// make array for uri abbreviation
		const uriArr: string[] = [
			isRoot ? '/' : '', // start from root
			...uri.split('/')
		]
			.filter((uriFrag: string): boolean => uriFrag !== '');

		let targetObj: RouteRule = refinedRuleObj;

		uriArr.forEach((uriFrag: string, i: number, arr: string[]): void => {
			if (uriFrag.trim() === '') {
				throw new Error('empty uri frag');
			}

			if (uriFrag.includes(' ')) {
				throw new Error('uri include space');
			}

			if (uriFrag.includes(':') && !uriFrag.startsWith(':')) {
				throw new Error('invalid colon route');
			}

			if (uriFrag.includes('?')) {
				if (uriFrag === '?') {
					throw new Error('invalid question character');
				}
			}

			if (uriFrag.includes('?') && uriFrag.startsWith('?')) {
				throw new Error('invalid question route');
			}

			if (uriFrag.includes('+') && uriFrag.startsWith('+')) {
				throw new Error('invalid plus route');
			}

			if (!Object.values(METHOD).includes(uriFrag as METHOD)) {
				// throws for malformed percent-encoding, and invalid syntax ('??', '++', ...)
				const segment: RouteSegment = compileRouteSegment(uriFrag);

				if (segment.kind === 'question') {
					parseQuestionPattern(uriFrag);
				}
			}

			if (Object.values(METHOD).includes(uriFrag as METHOD)) {
				const method: METHOD = uriFrag as METHOD; // re-assign for readability

				checkRouteFunctionObj(rule[method]);

				targetObj[method] = rule[method] as RouteRuleSeed;
			}
			else {
				// the key of the route tree : canonical representation of the uri fragment,
				// so that the same path in different spellings (e.g. '한글', '%ED%95%9C%EA%B8%80') is one node
				// the root marker '/' is kept
				const routeKey: string = isRoot && i === 0
					? uriFrag
					: canonicalRouteKey(uriFrag);

				if (i < arr.length - 1) {
					// unzip abbreviation path
					if (!targetObj[routeKey]) {
						targetObj[routeKey] = {};
					}

					targetObj = targetObj[routeKey] as RouteRule;
				}
				else {
					interface AnyRuleObj {
						[key: string]: RouteRuleSeed | RouteFunction;
					}

					// last uri frag
					const ruleAsAny: AnyRuleObj = rule as AnyRuleObj;

					let childRule: RouteRule | undefined;

					if (typeof value === 'object') {
						childRule = refineRouteRule(value, defaultMethod, false);
					}
					else if (typeof ruleAsAny[uri] === 'function') {
						if (defaultMethod) {
							childRule = {
								[defaultMethod]: ruleAsAny[uri]
							};
						}
						else {
							throw new Error('invalid rule or defaultMethod not set');
						}
					}

					if (childRule !== undefined) {
						// merge with the node made by other keys of the same rule object,
						// e.g. { '/a/b': { GET }, '/a': { b: { POST } } }, { '/한글': { GET }, '/%ED%95%9C%EA%B8%80': { POST } }
						// the same path & method : the latter wins, same as registering again
						targetObj[routeKey] = typeof targetObj[routeKey] === 'object'
							? mergeRouteRule(targetObj[routeKey] as RouteRule, childRule)
							: childRule;
					}
				}
			}
		});
	}

	if (isRoot) {
		checkDoubleAsteriskPosition(refinedRuleObj);
	}

	return refinedRuleObj;
};

// check uri duplication among sibling uri fragments (same parent), call recursively
export const checkUriDuplication = (currentRouteRule: RouteRule, newRouteRule: RouteRule): void => {
	checkSiblingUriKeys(
		sift([
			...Object.keys(currentRouteRule),
			...Object.keys(newRouteRule)
		])
			.filter((key: string): boolean => !isMethodKey(key))
	);

	// current rule is checked already, so go deeper along new rule only
	for (const [key, newChild] of Object.entries(newRouteRule)) {
		if (isMethodKey(key) || typeof newChild !== 'object') {
			continue;
		}

		const currentChild: RouteRule | RouteRuleSeed | RouteFunction | undefined = currentRouteRule[key];

		checkUriDuplication(
			typeof currentChild === 'object'
				? currentChild as RouteRule
				: {},
			newChild as RouteRule
		);
	}
};

const checkSiblingUriKeys = (targetKeys: string[]): void => {
	const segments: Map<string, RouteSegment> = new Map(
		targetKeys.map((key: string): [string, RouteSegment] => [key, compileRouteSegment(key)])
	);

	// literal of normal uri fragments, decoded
	// keys are canonical (refineRouteRule), the same path in different spellings is already one key
	const normalLiterals: Map<string, string> = new Map();

	for (const [key, segment] of segments) {
		if (segment.kind === 'normal') {
			normalLiterals.set(segment.literal, key);
		}
	}

	// colon routing
	const colonRouteArr: string[] = targetKeys.filter((uri: string): boolean => uri.startsWith(':'));
	if (colonRouteArr.length > 1) {
		throw new Error('duplicated colon routing');
	}

	// question routing, same pattern interpretation as request matching
	const questionRouteArr: string[] = targetKeys.filter((uri: string): boolean => isQuestionPattern(uri));
	if (questionRouteArr.length > 0) {
		// question pattern and normal uri fragments (literal)
		const matchingResult: string | undefined = questionRouteArr.find((pattern: string): boolean => {
			return [...normalLiterals.keys()].some((literal: string): boolean => matchQuestionPattern(pattern, literal));
		});

		if (matchingResult !== undefined) {
			throw new Error('duplicated question routing');
		}

		// question patterns that can match the same uri fragment, e.g. 'ab?c' and 'a?bc' for 'abc'
		for (let i: number = 0; i < questionRouteArr.length; i++) {
			for (let j: number = i + 1; j < questionRouteArr.length; j++) {
				if (questionPatternsIntersect(questionRouteArr[i], questionRouteArr[j])) {
					throw new Error(`duplicated question routing : ${ questionRouteArr[i] }, ${ questionRouteArr[j] }`);
				}
			}
		}
	}

	// plus routing, compare with normal uri fragments and the shortest uri fragments of other plus routes
	const plusRouteArr: string[] = targetKeys.filter((uri: string): boolean => segments.get(uri)?.kind === 'plus');
	if (plusRouteArr.length > 0) {
		plusRouteArr.forEach((plusUri: string): void => {
			const { regExp } = segments.get(plusUri) as { kind: 'plus', regExp: RegExp };

			const isDuplicated: boolean = targetKeys
				.filter((uri: string): boolean => uri !== plusUri)
				.map((uri: string): string | undefined => {
					const segment: RouteSegment = segments.get(uri) as RouteSegment;

					// other special routings are checked by themselves
					switch (segment.kind) {
						case 'normal':
							return segment.literal;

						case 'plus':
							// shortest matching uri fragment : 'abc+' -> 'abc'
							return segment.shortest;

						default:
							return undefined;
					}
				})
				.some((literal: string | undefined): boolean => literal !== undefined && regExp.test(literal));

			if (isDuplicated) {
				throw new Error('duplicated plus routing');
			}
		});
	}

	// asterisk routing, encoded '*' (%2A) is literal
	const asteriskRouteArr: string[] = targetKeys.filter((uri: string): boolean => uri.includes('*'));

	if (asteriskRouteArr.length > 1) {
		throw new Error('duplicated asterisk routing');
	}
};

export const mergeRouteRule = (a: RouteRule, b: RouteRule): RouteRule => {
	// keys of a can be changed
	invalidateNormalRouteIndex(a);

	Object.entries(b).forEach(([key, value]) => {
		if (a[key] === undefined) {
			a[key] = {};
		}

		if (typeof value === 'object') {
			mergeRouteRule((a ?? {})[key] as RouteRule, b[key] as RouteRule);
		}
		else {
			a[key] = b[key];
		}
	});

	return a;
};

export interface RouteMatch {
	// rule object of the matched path, undefined if no path matches
	rule: RouteRule | undefined;
	// params from special routing (e.g. colon routing)
	param: TypedObject<unknown> | undefined;
}

// split request url into path and query string (without '?')
export const splitUrl = (url: string): { path: string, queryStr: string | undefined } => {
	if (url.includes('?')) {
		const firstQuestionMarkIndex: number = url.indexOf('?');

		return {
			path: url.substring(0, firstQuestionMarkIndex),
			queryStr: url.substring(firstQuestionMarkIndex + 1)
		};
	}

	return {
		path: url,
		queryStr: undefined
	};
};

// has a route function for any method
const hasRouteFunction = (rule: RouteRule): boolean => {
	return Object.values(METHOD).some((method: METHOD): boolean => rule[method] !== undefined);
};

// find the rule object matching the request path
// '**' is a fallback : it is used only if the path doesn't match other routes fully,
// and the deepest '**' along the matched path is used
// throws HttpError(400) for malformed percent-encoding in a matched uri fragment
export const findRoute = (routeRule: RouteRule, uriSanitized: string): RouteMatch => {
	let param: TypedObject<unknown> | undefined;

	// '**' fallback candidate
	let fallback: {
		rule: RouteRule;
		param: TypedObject<unknown> | undefined;
		restStartIndex: number;
	} | undefined;

	// record '**' child of the node, restStartIndex : index of the uri fragment after the node
	const recordFallback = (node: RouteRule, restStartIndex: number): void => {
		const doubleAsteriskRule: unknown = node['**'];

		if (typeof doubleAsteriskRule === 'object' && doubleAsteriskRule !== null) {
			fallback = {
				rule: doubleAsteriskRule as RouteRule,
				// params matched before '**', e.g. ':id' of '/users/:id/**'
				param: param !== undefined
					? { ...param }
					: undefined,
				restStartIndex
			};
		}
	};

	let checkTargetRule: RouteRule | undefined = routeRule;

	// uri fragments are decoded separately after split by real '/', '%2F' is a '/' in a uri fragment
	// throws HttpError(400) for malformed percent-encoding
	const uriArr: string[] = tokenizeRequestPath(uriSanitized);

	// find target function
	// use 'for' instead of 'forEach' to break
	for (let depthIter: number = 0; depthIter < uriArr.length; depthIter++) {
		let loopControl: LOOP_CONTROL | undefined;

		recordFallback(checkTargetRule, depthIter);

		const routeRuleKeyArr: string[] = Object.keys(checkTargetRule);

		const uriFrag: string = uriArr[depthIter];


		// normal routing, compared with the literal of route keys (e.g. '%ED%95%9C' and '한' are the same)
		const normalRouteKey: string | undefined = findNormalRouteKey(checkTargetRule, uriFrag);

		if (normalRouteKey !== undefined) {
			checkTargetRule = checkTargetRule[normalRouteKey] as RouteRule;

			loopControl = LOOP_CONTROL.CONTINUE;
		}

		if (!loopControl) {
			// colon routing
			const colonParam: string | undefined = routeRuleKeyArr.find((_uriFrag: string): boolean => {
				return _uriFrag.startsWith(':');
			});

			if (colonParam !== undefined) {
				checkTargetRule = checkTargetRule[colonParam] as RouteRule;

				if (param === undefined) {
					param = {};
				}

				// if (param.matcher === undefined) {
				// 	param.matcher = [];
				// }

				// param.matcher.push(colonParam);
				param[colonParam.replace(':', '')] = uriFrag;

				loopControl = LOOP_CONTROL.CONTINUE;
			}
		}

		if (!loopControl) {
			// question routing
			// question patterns of siblings don't overlap (checked on registration), at most one matches
			const targetQuestionKey: string | undefined = routeRuleKeyArr
				.filter((routeRuleKey: string): boolean => isQuestionPattern(routeRuleKey))
				.find((questionKey: string): boolean => matchQuestionPattern(questionKey, uriFrag));

			if (targetQuestionKey !== undefined) {
				checkTargetRule = checkTargetRule[targetQuestionKey] as RouteRule;

				if (param === undefined) {
					param = {};
				}

				// if (param.matcher === undefined) {
				// 	param.matcher = [];
				// }

				// param.matcher.push(targetQuestionKey);
				param[targetQuestionKey] = uriFrag;

				loopControl = LOOP_CONTROL.CONTINUE;
			}
		}

		if (!loopControl) {
			// plus routing
			// other characters are literal, compared with the decoded uri fragment
			const targetPlusKey: string | undefined = routeRuleKeyArr.find((routeRuleKey: string): boolean => {
				const segment: RouteSegment | undefined = isMethodKey(routeRuleKey)
					? undefined
					: compileRouteSegment(routeRuleKey);

				return segment?.kind === 'plus' && segment.regExp.test(uriFrag);
			});

			if (targetPlusKey !== undefined) {
				checkTargetRule = checkTargetRule[targetPlusKey] as RouteRule;

				if (param === undefined) {
					param = {};
				}

				// if (param.matcher === undefined) {
				// 	param.matcher = [];
				// }

				// param.matcher.push(targetPlusKey);
				param[targetPlusKey] = uriFrag;

				loopControl = LOOP_CONTROL.CONTINUE;
			}
		}

		if (!loopControl) {
			// asterisk routing
			if (routeRuleKeyArr.includes('*')) {
				checkTargetRule = checkTargetRule['*'] as RouteRule;

				if (param === undefined) {
					param = {};
				}

				param['*'] = uriFrag;

				loopControl = LOOP_CONTROL.CONTINUE;
			}
		}

		if (!loopControl) {
			// partial asterisk routing
			// 'ab*cd', 'user1*', not '*' and '**', other characters are literal
			const targetAsteriskKey: string | undefined = routeRuleKeyArr.find((routeRuleKey: string): boolean => {
				const segment: RouteSegment | undefined = isMethodKey(routeRuleKey)
					? undefined
					: compileRouteSegment(routeRuleKey);

				return segment?.kind === 'partialAsterisk' && segment.regExp.test(uriFrag);
			});


			if (targetAsteriskKey !== undefined) {
				checkTargetRule = checkTargetRule[targetAsteriskKey] as RouteRule;

				if (param === undefined) {
					param = {};
				}

				// if (param.matcher === undefined) {
				// 	param.matcher = [];
				// }

				// param.matcher.push(targetAsteriskKey);
				param[targetAsteriskKey] = uriFrag;

				loopControl = LOOP_CONTROL.CONTINUE;
			}
		}

		if (loopControl === undefined) {
			// not found
			checkTargetRule = undefined;
			break;
		}
		// loopControl === LoopControl.Continue : continue
	}

	if (checkTargetRule !== undefined) {
		// '**' of the last node matches no more uri fragment, e.g. '/files' of '/files/**'
		recordFallback(checkTargetRule, uriArr.length);

		if (hasRouteFunction(checkTargetRule)) {
			// matched fully, '**' is not used
			return {
				rule: checkTargetRule,
				param
			};
		}
	}

	if (fallback !== undefined) {
		return {
			rule: fallback.rule,
			param: {
				...fallback.param,
				// rest of the path after '**', each uri fragment is decoded and joined with '/'
				// e.g. '/files/**' : '/files/a/b%20c' -> 'a/b c', '/files' -> ''
				'**': uriArr
					.slice(fallback.restStartIndex)
						.join('/')
			}
		};
	}

	return {
		rule: checkTargetRule,
		param
	};
};

export interface RouteFunctionMatch {
	// route function for the method, undefined if not registered
	targetFncObj: RouteFunction | RouteFunctionObj | undefined;
	// registered methods of the path, including HEAD if GET exists, for 405 Allow header
	allowedMethods: string[];
}

// find the route function for the method in the matched rule
export const findRouteFunction = (rule: RouteRule | undefined, method: string): RouteFunctionMatch => {
	// HEAD is handled by GET route function, Node.js doesn't send the body for HEAD
	const ruleMethod: string = method === 'HEAD'
		? METHOD.GET
		: method;

	if (rule && rule[ruleMethod]) {
		return {
			targetFncObj: rule[ruleMethod] as RouteFunctionObj,
			allowedMethods: []
		};
	}

	// path exists, but not for this method : 405 with allowed methods
	const allowedMethods: string[] = rule !== undefined
		? Object.values(METHOD).filter((one: METHOD): boolean => {
			return rule[one] !== undefined;
		})
		: [];

	// HEAD is handled by GET
	if (allowedMethods.includes(METHOD.GET)) {
		allowedMethods.splice(allowedMethods.indexOf(METHOD.GET) + 1, 0, 'HEAD');
	}

	return {
		targetFncObj: undefined,
		allowedMethods
	};
};
