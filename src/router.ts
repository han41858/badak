import { RouteFunction, RouteFunctionObj, RouteOption, RouteRule, RouteRuleSeed, TypedObject } from './interfaces.js';
import { METHOD } from './constants.js';
import { HttpError } from './http-error.js';
import { isValidBodyLimit } from './util.js';
import { matchPatternTokens, patternTokensIntersect } from './fragment-pattern.js';
import {
	canonicalRouteKey,
	compileRouteSegment,
	findNormalRouteKey,
	invalidateNormalRouteIndex,
	patternRouteKeys,
	RouteSegment,
	segmentTokens,
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

			if (!Object.values(METHOD).includes(uriFrag as METHOD)) {
				// throws for malformed percent-encoding and invalid syntax ('??', 'a**', '?a', 'a:b', ...)
				compileRouteSegment(uriFrag);
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

// a route : the route keys from the root ('/') and a method
interface RegisteredRoute {
	keys: string[];
	method: METHOD;
}

const collectRoutes = (rule: RouteRule, keys: string[] = [], routes: RegisteredRoute[] = []): RegisteredRoute[] => {
	for (const [key, value] of Object.entries(rule)) {
		if (isMethodKey(key)) {
			routes.push({ keys, method: key as METHOD });
		}
		else if (typeof value === 'object' && value !== null) {
			collectRoutes(value as RouteRule, [...keys, key], routes);
		}
	}

	return routes;
};

// route keys are canonical, the same key is the same pattern
const keysIntersect = (a: string, b: string): boolean => {
	return a === b
		|| patternTokensIntersect(segmentTokens(compileRouteSegment(a)), segmentTokens(compileRouteSegment(b)));
};

const sameKeys = (a: string[], b: string[]): boolean => {
	return a.length === b.length && a.every((key: string, i: number): boolean => key === b[i]);
};

// '/' + route keys except the root marker
const routePath = (keys: string[]): string => '/' + keys.slice(1).join('/');

// throws if two routes of the same method can match the same request path (docs/routing-spec-5.0.0.md 4., 5.)
// - routes without '**' : the same number of uri fragments, and every uri fragment intersects
// - '**' routes : not compared with other routes, but with '**' routes of the same depth by the part before '**'
// - the same keys : registered again, the route function is replaced
const checkRoutePair = (a: RegisteredRoute, b: RegisteredRoute): void => {
	if (a.method !== b.method || sameKeys(a.keys, b.keys)) {
		return;
	}

	const fallbackA: boolean = a.keys[a.keys.length - 1] === '**';
	const fallbackB: boolean = b.keys[b.keys.length - 1] === '**';

	if (fallbackA !== fallbackB || a.keys.length !== b.keys.length) {
		return;
	}

	const comparedLength: number = fallbackA
		? a.keys.length - 1
		: a.keys.length;

	for (let i: number = 0; i < comparedLength; i++) {
		if (!keysIntersect(a.keys[i], b.keys[i])) {
			return;
		}
	}

	const header: string = fallbackA
		// depth : the number of uri fragments before '**'
		? `Conflicting fallback routes for ${ a.method } at depth ${ comparedLength - 1 }:`
		: `Conflicting routes for ${ a.method }:`;

	throw new Error(`${ header }\n  ${ routePath(b.keys) }\n  ${ routePath(a.keys) }`);
};

// registered routes that can conflict with the route, found along the route tree
// only the children whose route keys intersect with the route key of the same depth are followed
// '**' children are compared only with '**' routes, at the same depth
const findConflictCandidates = (node: RouteRule, route: RegisteredRoute, depth: number, keys: string[], found: RegisteredRoute[]): void => {
	if (depth === route.keys.length) {
		if (node[route.method] !== undefined) {
			found.push({ keys, method: route.method });
		}

		return;
	}

	const routeKey: string = route.keys[depth];

	if (routeKey === '**') {
		// the last key
		const doubleAsteriskRule: unknown = node['**'];

		if (typeof doubleAsteriskRule === 'object' && doubleAsteriskRule !== null && (doubleAsteriskRule as RouteRule)[route.method] !== undefined) {
			found.push({ keys: [...keys, '**'], method: route.method });
		}

		return;
	}

	const segment: RouteSegment = compileRouteSegment(routeKey);

	// a literal route key : only the normal child of the same literal, and pattern children
	const childKeys: string[] = segment.kind === 'normal'
		? [
			...(findNormalRouteKey(node, segment.literal) !== undefined ? [findNormalRouteKey(node, segment.literal) as string] : []),
			...patternRouteKeys(node)
		]
		: Object.keys(node).filter((key: string): boolean => !isMethodKey(key) && key !== '**');

	for (const childKey of childKeys) {
		const child: unknown = node[childKey];

		if (typeof child === 'object' && child !== null && keysIntersect(childKey, routeKey)) {
			findConflictCandidates(child as RouteRule, route, depth + 1, [...keys, childKey], found);
		}
	}
};

// check that each request path matches only one route per method, with the routes of currentRouteRule and newRouteRule
// throws before anything is changed, the caller merges newRouteRule only if this passes
export const checkUriDuplication = (currentRouteRule: RouteRule, newRouteRule: RouteRule): void => {
	const newRoutes: RegisteredRoute[] = collectRoutes(newRouteRule);

	newRoutes.forEach((newRoute: RegisteredRoute, i: number): void => {
		// registered routes, found along the route tree
		const candidates: RegisteredRoute[] = [];

		findConflictCandidates(currentRouteRule, newRoute, 0, [], candidates);

		for (const candidate of candidates) {
			checkRoutePair(newRoute, candidate);
		}

		// new routes before this one (keys of one rule object)
		for (const other of newRoutes.slice(0, i)) {
			checkRoutePair(newRoute, other);
		}
	});
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
// request target (RFC 9112 3.2) to origin-form ('/path?query')
// - origin-form : as it is
// - absolute-form (e.g. 'http://host/path?query', sent to proxies) : path and query, the authority is ignored
//   only 'http' and 'https' (case-insensitive), the host should not be empty (RFC 9110 4.2.1)
//   userinfo (e.g. 'http://user@host/') is an error (RFC 9110 4.2.4)
//   the path is not normalized (e.g. dot segments), same as origin-form
// - asterisk-form ('*', OPTIONS for the server) : no resource, 404
// - authority-form ('host:port', CONNECT), other schemes, and others : 400
// - a fragment ('#') is not a part of the request target in any form : 400
export const toOriginForm = (target: string): string => {
	if (target.includes('#')) {
		throw new HttpError(400);
	}

	if (target.startsWith('/')) {
		return target;
	}

	if (target === '*') {
		throw new HttpError(404);
	}

	const absolute: RegExpMatchArray | null = target.match(/^https?:\/\/([^/?]*)(.*)$/i);

	if (absolute === null) {
		throw new HttpError(400);
	}

	const [, authority, rest] = absolute;

	// host : reg-name or IPv4 (without ':'), or IP literal in brackets, then an optional port
	if (!/^(?:\[[0-9A-Fa-f:.]+\]|[^:@[\]]+)(?::\d*)?$/.test(authority)) {
		throw new HttpError(400);
	}

	return rest.startsWith('/')
		? rest
		: '/' + rest; // 'http://host' -> '/', 'http://host?a=1' -> '/?a=1'
};

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

interface Candidate {
	node: RouteRule;
	param: TypedObject<unknown> | undefined;
}

// param key of a matched uri fragment : the name for ':' routing, '*' for '*', the route key for other patterns
const paramKeyOf = (routeKey: string, segment: RouteSegment): string => {
	return segment.kind === 'colon'
		? segment.name
		: routeKey;
};

// candidates have the route functions of different methods, at most one per method (checked on registration)
const selectCandidate = (candidates: Candidate[], method: string): RouteMatch => {
	// HEAD is handled by GET route function
	const ruleMethod: string = method === 'HEAD'
		? METHOD.GET
		: method;

	if (candidates.length === 1) {
		return { rule: candidates[0].node, param: candidates[0].param };
	}

	// route functions of all candidates, for the method and the 405 Allow header
	const rule: RouteRule = {};

	for (const candidate of candidates) {
		for (const one of Object.values(METHOD)) {
			if (candidate.node[one] !== undefined && rule[one] === undefined) {
				rule[one] = candidate.node[one];
			}
		}
	}

	const selected: Candidate = candidates.find((candidate: Candidate): boolean => candidate.node[ruleMethod] !== undefined)
		?? candidates[0];

	return { rule, param: selected.param };
};

// find the route matching the request path (docs/routing-spec-5.0.0.md 6.)
// every child matching a uri fragment is followed, not only the first one by priority
// each node of the route tree has a fixed depth, so a node is visited at most once
// - routes matching the path fully are used, the route function is selected by the method
// - '**' is a fallback : used only if no route matches the path fully, the deepest '**' is used
// method : params are taken from the route of the method (HEAD : GET), for the 405 Allow header the rule has all methods
// throws HttpError(400) for malformed percent-encoding
export const findRoute = (routeRule: RouteRule, uriSanitized: string, method: string = METHOD.GET): RouteMatch => {
	// uri fragments are decoded separately after split by real '/', '%2F' is a '/' in a uri fragment
	const uriArr: string[] = tokenizeRequestPath(uriSanitized);

	const fullMatches: Candidate[] = [];
	const fallbacks: (Candidate & { restStartIndex: number })[] = [];

	const visit = (node: RouteRule, depth: number, param: TypedObject<unknown> | undefined): void => {
		const doubleAsteriskRule: unknown = node['**'];

		if (typeof doubleAsteriskRule === 'object' && doubleAsteriskRule !== null && hasRouteFunction(doubleAsteriskRule as RouteRule)) {
			// params matched before '**', e.g. ':id' of '/users/:id/**'
			fallbacks.push({ node: doubleAsteriskRule as RouteRule, param, restStartIndex: depth });
		}

		if (depth === uriArr.length) {
			if (hasRouteFunction(node)) {
				fullMatches.push({ node, param });
			}

			return;
		}

		const uriFrag: string = uriArr[depth];

		// normal routing, by the literal of route keys (e.g. '%ED%95%9C' and '한' are the same)
		const normalRouteKey: string | undefined = findNormalRouteKey(node, uriFrag);

		if (normalRouteKey !== undefined) {
			visit(node[normalRouteKey] as RouteRule, depth + 1, param);
		}

		// ':', '?', '+', '*' routing
		for (const routeKey of patternRouteKeys(node)) {
			const segment: RouteSegment = compileRouteSegment(routeKey);

			if (matchPatternTokens(segmentTokens(segment), uriFrag)) {
				visit(node[routeKey] as RouteRule, depth + 1, { ...param, [paramKeyOf(routeKey, segment)]: uriFrag });
			}
		}
	};

	visit(routeRule, 0, undefined);

	if (fullMatches.length > 0) {
		// matched fully, '**' is not used
		return selectCandidate(fullMatches, method);
	}

	if (fallbacks.length > 0) {
		const deepest: number = Math.max(...fallbacks.map((one: { restStartIndex: number }): number => one.restStartIndex));
		const matched: RouteMatch = selectCandidate(
			fallbacks.filter((one: { restStartIndex: number }): boolean => one.restStartIndex === deepest),
			method
		);

		return {
			rule: matched.rule,
			param: {
				...matched.param,
				// rest of the path after '**', each uri fragment is decoded and joined with '/'
				// e.g. '/files/**' : '/files/a/b%20c' -> 'a/b c', '/files' -> ''
				'**': uriArr
					.slice(deepest)
					.join('/')
			}
		};
	}

	return {
		rule: undefined,
		param: undefined
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
