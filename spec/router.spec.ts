import { expect } from 'chai';

import { HttpError } from '../src/http-error';
import { METHOD } from '../src/constants';
import { RouteFunction, RouteRule } from '../src/interfaces';
import { checkUriDuplication, findRoute, findRouteFunction, mergeRouteRule, refineRouteRule, splitUrl } from '../src/router';


// route matching without HTTP server
describe('router', () => {
	const fnc: RouteFunction = (): string => 'ok';

	// refine & merge like Badak.route()
	const build = (...rules: RouteRule[]): RouteRule => {
		const routeRule: RouteRule = {};

		rules.forEach((rule: RouteRule): void => {
			const refined: RouteRule = refineRouteRule(rule, undefined);

			checkUriDuplication(routeRule, refined);
			mergeRouteRule(routeRule, refined);
		});

		return routeRule;
	};

	describe('splitUrl()', () => {
		([
			['/users', '/users', undefined],
			['/users?a=1', '/users', 'a=1'],
			['/users?', '/users', ''],
			['/users?a=1?b=2', '/users', 'a=1?b=2']
		] as [string, string, string | undefined][]).forEach(([url, path, queryStr]: [string, string, string | undefined]): void => {
			it(url, () => {
				expect(splitUrl(url)).to.be.eql({ path, queryStr });
			});
		});
	});

	describe('findRoute()', () => {
		const routeRule: RouteRule = build({
			'/users': { GET: fnc },
			'/users/:id': { GET: fnc, PUT: fnc },
			'/colou?r': { GET: fnc },
			'/ab+c': { GET: fnc },
			'/files/**': { GET: fnc },
			'/img/*': { GET: fnc }
		});

		it('normal routing', () => {
			const { rule, param } = findRoute(routeRule, '/users');

			expect(rule).to.have.property(METHOD.GET);
			expect(param).to.be.undefined;
		});

		it('colon routing, decoded', () => {
			const { rule, param } = findRoute(routeRule, '/users/a%20b');

			expect(rule).to.have.property(METHOD.PUT);
			expect(param).to.be.eql({ id: 'a b' });
		});

		it('question routing', () => {
			expect(findRoute(routeRule, '/color').rule).to.have.property(METHOD.GET);
			expect(findRoute(routeRule, '/colour').rule).to.have.property(METHOD.GET);
		});

		it('plus routing matches whole uri fragment', () => {
			expect(findRoute(routeRule, '/abbbc').rule).to.have.property(METHOD.GET);
			expect(findRoute(routeRule, '/xxabbbcyy').rule).to.be.undefined;
		});

		it('** routing', () => {
			const { rule, param } = findRoute(routeRule, '/files/a/b/c');

			expect(rule).to.have.property(METHOD.GET);
			// value of '**' is not specified, same as route.spec.ts
			expect(param).to.have.property('**');
		});

		it('* routing', () => {
			expect(findRoute(routeRule, '/img/logo.png').param).to.be.eql({ '*': 'logo.png' });
		});

		it('not found', () => {
			expect(findRoute(routeRule, '/nothing').rule).to.be.undefined;
		});

		it('malformed percent-encoding : HttpError(400)', () => {
			expect(() => findRoute(routeRule, '/users/%E0%A4%A')).to.throw(HttpError).with.property('status', 400);
		});
	});

	describe('findRouteFunction()', () => {
		const routeRule: RouteRule = build({
			'/users': { GET: fnc, POST: fnc },
			'/items': { DELETE: fnc }
		});

		it('registered method', () => {
			const { targetFncObj, allowedMethods } = findRouteFunction(findRoute(routeRule, '/users').rule, 'POST');

			expect(targetFncObj).to.be.eql(fnc);
			expect(allowedMethods).to.be.eql([]);
		});

		it('HEAD is handled by GET', () => {
			expect(findRouteFunction(findRoute(routeRule, '/users').rule, 'HEAD').targetFncObj).to.be.eql(fnc);
		});

		it('unregistered method : allowed methods with HEAD after GET', () => {
			const { targetFncObj, allowedMethods } = findRouteFunction(findRoute(routeRule, '/users').rule, 'PUT');

			expect(targetFncObj).to.be.undefined;
			expect(allowedMethods).to.be.eql(['GET', 'HEAD', 'POST']);
		});

		it('no HEAD without GET', () => {
			expect(findRouteFunction(findRoute(routeRule, '/items').rule, 'GET').allowedMethods).to.be.eql(['DELETE']);
		});

		it('no path : no allowed methods', () => {
			expect(findRouteFunction(undefined, 'GET')).to.be.eql({ targetFncObj: undefined, allowedMethods: [] });
		});
	});

	describe('refineRouteRule()', () => {
		it('route function without method key needs defaultMethod', () => {
			expect(() => refineRouteRule({ '/test': fnc }, undefined)).to.throw('invalid rule or defaultMethod not set');
			expect(refineRouteRule({ '/test': fnc }, METHOD.GET)).to.be.eql({ '/': { test: { GET: fnc } } });
		});
	});
});
