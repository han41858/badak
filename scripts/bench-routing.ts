// routing benchmark, not run in CI (docs/routing-spec-5.0.0.md 6., 10.)
// yarn bench:routing
import { performance } from 'node:perf_hooks';

import { RouteFunction, RouteRule } from '../src/interfaces.js';
import { checkUriDuplication, findRoute, mergeRouteRule, refineRouteRule } from '../src/router.js';


const fnc: RouteFunction = (): string => 'ok';

const register = (paths: string[]): { routeRule: RouteRule, ms: number } => {
	const routeRule: RouteRule = {};
	const start: number = performance.now();

	for (const path of paths) {
		const refined: RouteRule = refineRouteRule({ [path]: { GET: fnc } }, undefined);

		checkUriDuplication(routeRule, refined);
		mergeRouteRule(routeRule, refined);
	}

	return { routeRule, ms: performance.now() - start };
};

const measureMatch = (routeRule: RouteRule, urls: string[], times: number): number => {
	const start: number = performance.now();

	for (let n: number = 0; n < times; n++) {
		for (const url of urls) {
			findRoute(routeRule, url);
		}
	}

	return (performance.now() - start) / (times * urls.length) * 1000;
};

const report = (name: string, paths: string[], urls: string[]): void => {
	const { routeRule, ms } = register(paths);
	const microseconds: number = measureMatch(routeRule, urls, 200);

	console.log(`${ name.padEnd(40) } routes ${ String(paths.length).padStart(5) }  register ${ ms.toFixed(1).padStart(8) } ms  match ${ microseconds.toFixed(2).padStart(7) } µs/request`);
};

// 1. REST-like API : 1,000 routes, literals and a ':' param each
{
	const paths: string[] = [];

	for (let i: number = 0; i < 250; i++) {
		paths.push(`/api/r${ i }`, `/api/r${ i }/:id`, `/api/r${ i }/:id/items`, `/api/r${ i }/:id/items/:itemId`);
	}

	report('REST 1,000 routes', paths, ['/api/r0', '/api/r125/7', '/api/r249/7/items/9', '/api/none']);
}

// 2. deep route tree with overlapping patterns at every level (depth 10)
{
	const paths: string[] = [];

	for (let depth: number = 1; depth <= 10; depth++) {
		const prefix: string = Array.from({ length: depth - 1 }, (): string => 'a').join('/');
		const base: string = prefix === '' ? '' : '/' + prefix;

		paths.push(`${ base }/a+/end${ depth }`, `${ base }/*a/stop${ depth }`, `${ base }/a/leaf${ depth }`);
	}

	report('depth 10, overlapping patterns', paths, ['/a/a/a/a/a/a/a/a/a/a/x', '/a/a/a/a/a/leaf6', '/aaa/end1']);
}

// 3. many pattern siblings in one node
{
	const paths: string[] = [];

	for (let i: number = 0; i < 300; i++) {
		paths.push(`/p/x${ i }-*`, `/p/y${ i }-z+`);
	}

	report('600 pattern siblings', paths, ['/p/x150-abc', '/p/y299-zzzz', '/p/none']);
}

// 4. long request uri fragment against patterns
{
	report('long uri fragment (10,000 characters)', ['/a*b*c*d', '/x+'], ['/' + 'a'.repeat(10000), '/' + 'x'.repeat(10000)]);
}
