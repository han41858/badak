import { RouteFunction, RouteFunctionObj, RouteOption, RouteRule, RouteRuleSeed, TypedObject } from './interfaces.js';
import { METHOD } from './constants.js';
import { decodeUriFrag, isValidBodyLimit, sift } from './util.js';


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

enum LOOP_CONTROL {
	BREAK = 'B',
	CONTINUE = 'C'
}

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

			if (Object.values(METHOD).includes(uriFrag as METHOD)) {
				const method: METHOD = uriFrag as METHOD; // re-assign for readability

				checkRouteFunctionObj(rule[method]);

				targetObj[method] = rule[method] as RouteRuleSeed;
			}
			else {
				if (i < arr.length - 1) {
					// unzip abbreviation path
					if (!targetObj[uriFrag]) {
						targetObj[uriFrag] = {};
					}

					targetObj = targetObj[uriFrag] as RouteRule;
				}
				else {
					interface AnyRuleObj {
						[key: string]: RouteRuleSeed | RouteFunction;
					}

					// last uri frag
					const ruleAsAny: AnyRuleObj = rule as AnyRuleObj;

					if (typeof value === 'object') {
						targetObj[uriFrag] = refineRouteRule(value, defaultMethod, false);
					}
					else if (typeof ruleAsAny[uri] === 'function') {
						if (defaultMethod) {
							targetObj[uriFrag] = {
								[defaultMethod]: ruleAsAny[uri]
							};
						}
						else {
							throw new Error('invalid rule or defaultMethod not set');
						}
					}
				}
			}
		});
	}

	return refinedRuleObj;
};

// check uri duplication among sibling uri fragments (same parent), call recursively
export const checkUriDuplication = (currentRouteRule: RouteRule, newRouteRule: RouteRule): void => {
	const isMethodKey = (key: string): boolean => Object.values(METHOD).includes(key as METHOD);

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
	// colon routing
	const colonRouteArr: string[] = targetKeys.filter((uri: string): boolean => uri.startsWith(':'));
	if (colonRouteArr.length > 1) {
		throw new Error('duplicated colon routing');
	}

	// question routing
	const questionRouteArr: string[] = targetKeys.filter((uri: string): boolean => uri.includes('?'));
	if (questionRouteArr.length > 0) {
		const targetUris: string[] = targetKeys.filter((uri: string): boolean => !questionRouteArr.includes(uri));

		const matchingResult: string | undefined = questionRouteArr.find((regSrc: string): boolean => {
			// anchor to match whole uri fragment
			return targetUris.some((uri: string): boolean => new RegExp(`^(?:${ regSrc })$`).test(uri));
		});

		if (matchingResult !== undefined) {
			throw new Error('duplicated question routing');
		}
	}

	// plus routing
	const plusRouteArr: string[] = targetKeys.filter((uri: string): boolean => uri.includes('+'));
	if (plusRouteArr.length > 0) {
		plusRouteArr.forEach((plusUri: string): void => {
			// same as request matching, match whole uri fragment
			const plusRegExp: RegExp = new RegExp(`^(?:${ plusUri })$`);

			const isDuplicated: boolean = targetKeys
				.filter((uri: string): boolean => {
					// other special routings are checked by themselves
					return uri !== plusUri
						&& !uri.startsWith(':')
						&& !uri.includes('?')
						&& !uri.includes('*');
				})
				// for other plus uri, compare with its shortest matching uri : 'abc+' -> 'abc'
				.map((uri: string): string => uri.replace(/\+/g, ''))
				.some((uri: string): boolean => plusRegExp.test(uri));

			if (isDuplicated) {
				throw new Error('duplicated plus routing');
			}
		});
	}

	// asterisk routing
	const asteriskRouteArr: string[] = targetKeys.filter((uri: string): boolean => uri.includes('*'));

	if (asteriskRouteArr.length > 1) {
		throw new Error('duplicated asterisk routing');
	}
};

export const mergeRouteRule = (a: RouteRule, b: RouteRule): RouteRule => {
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

// find the rule object matching the request path
// throws HttpError(400) for malformed percent-encoding in a matched uri fragment
export const findRoute = (routeRule: RouteRule, uriSanitized: string): RouteMatch => {
	let param: TypedObject<unknown> | undefined;

	let checkTargetRule: RouteRule | undefined = routeRule;

	// normal routing
	const uriArr: string[] = [
		'/', // start from root
		...uriSanitized.split('/')
	]
		.filter((frag: string): boolean => {
			return frag !== '';
		});

	// find target function
	// use 'for' instead of 'forEach' to break
	for (let depthIter: number = 0; depthIter < uriArr.length; depthIter++) {
		let loopControl: LOOP_CONTROL | undefined;

		const routeRuleKeyArr: string[] = Object.keys(checkTargetRule);

		const uriFrag: string = uriArr[depthIter];


		// normal routing
		if (checkTargetRule[uriFrag] !== undefined) {
			checkTargetRule = checkTargetRule[uriFrag] as RouteRule;

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
				param[colonParam.replace(':', '')] = decodeUriFrag(uriFrag);

				loopControl = LOOP_CONTROL.CONTINUE;
			}
		}

		if (!loopControl) {
			// question routing
			const questionKeyArr: string[] = routeRuleKeyArr.filter((routeRuleKey: string): boolean => {
				return !!routeRuleKey.match(/.+\?/);
			});

			const targetQuestionKey: string | undefined = questionKeyArr.find((questionKey: string): boolean => {
				const questionKeyIndex: number = questionKey.indexOf('?');

				const optionalCharacter: string = questionKey.substring(
					questionKeyIndex - 1,
					questionKeyIndex
				);

				const mandatoryKey: string = questionKey.substring(0, questionKeyIndex - 1);
				const restKey: string = questionKey.substring(questionKeyIndex + 1);

				return new RegExp(`^${ mandatoryKey }${ optionalCharacter }?${ restKey }$`).test(uriFrag);
			});

			if (targetQuestionKey !== undefined) {
				checkTargetRule = checkTargetRule[targetQuestionKey] as RouteRule;

				if (param === undefined) {
					param = {};
				}

				// if (param.matcher === undefined) {
				// 	param.matcher = [];
				// }

				// param.matcher.push(targetQuestionKey);
				param[targetQuestionKey] = decodeUriFrag(uriFrag);

				loopControl = LOOP_CONTROL.CONTINUE;
			}
		}

		if (!loopControl) {
			// plus routing
			const plusKeyArr: string[] = routeRuleKeyArr.filter((routeRuleKey: string): boolean => {
				return routeRuleKey.includes('+');
			});

			const targetPlusKey: string | undefined = plusKeyArr.find((plusKey: string): boolean => {
				// anchor to match whole uri fragment
				return new RegExp(`^(?:${ plusKey })$`).test(uriFrag);
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
				param[targetPlusKey] = decodeUriFrag(uriFrag);

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

				param['*'] = decodeUriFrag(uriFrag);

				loopControl = LOOP_CONTROL.CONTINUE;
			}
		}

		if (!loopControl) {
			// partial asterisk routing
			const targetAsteriskKey: string | undefined = routeRuleKeyArr
				.filter((routeRuleKey: string): boolean => {
					// 'ab*cd', 'user1*', not '**'
					return routeRuleKey !== '**' && /.\*/.test(routeRuleKey);
				})
				.find((asteriskKey: string): boolean => {
					// replace 'b*' to '.*', anchor to match whole uri fragment
					return new RegExp(
						`^(?:${ asteriskKey.replace(/.\*/, '.*') })$`
					).test(uriFrag);
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
				param[targetAsteriskKey] = decodeUriFrag(uriFrag);

				loopControl = LOOP_CONTROL.CONTINUE;
			}
		}


		// * / ** asterisk child routing
		const childRouteRuleKeyArr: string[] = Object.keys(checkTargetRule);

		if (depthIter === uriArr.length - 1 // for urls like '/something/'
			&& childRouteRuleKeyArr.includes('*')) {
			checkTargetRule = checkTargetRule['*'] as RouteRule;

			if (param === undefined) {
				param = {};
			}

			param['*'] = decodeUriFrag(uriFrag);

			loopControl = LOOP_CONTROL.BREAK;
		}
		else if (routeRuleKeyArr.includes('**') || childRouteRuleKeyArr.includes('**')) {
			checkTargetRule = checkTargetRule['**'] as RouteRule;

			if (param === undefined) {
				param = {};
			}

			param['**'] = decodeUriFrag(uriFrag);

			// ignore after uriFrag
			loopControl = LOOP_CONTROL.BREAK;
		}

		// use if/else instead of switch to break for loop
		if (
			loopControl === LOOP_CONTROL.BREAK
			|| uriFrag === '' // last frag with query string param
		) {
			break;
		}
		else if (loopControl === undefined) {
			// not found
			checkTargetRule = undefined;
			break;
		}
		// loopControl === LoopControl.Continue : continue
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
