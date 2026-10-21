import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { METHOD } from '../src/constants';
import { HttpError } from '../src/http-error';
import { ParamContext, RouteFunction, RouteRule } from '../src/interfaces';
import { checkUriDuplication, findRoute, mergeRouteRule, refineRouteRule } from '../src/router';
import { promiseFail, TestPort } from './test-util';


describe('** routing', () => {
	const fnc: RouteFunction = (): string => 'ok';

	const build = (uris: string[]): RouteRule => {
		const routeRule: RouteRule = {};

		uris.forEach((uri: string): void => {
			const refined: RouteRule = refineRouteRule({ [uri]: { GET: fnc } }, undefined);

			checkUriDuplication(routeRule, refined);
			mergeRouteRule(routeRule, refined);
		});

		return routeRule;
	};

	// before : value of 2.1.0 (uri fragment before '**'), for reference only
	// matched : same as 2.1.0, matching range of '**' is not changed
	// priority with sibling routes : route-priority.spec.ts
	interface RegressionCase {
		uris: string[];
		url: string;
		matched: boolean;
		before?: string;
		after?: string;
	}

	const regressionCases: RegressionCase[] = [
		{ uris: ['/files/**'], url: '/files', matched: true, before: 'files', after: '' },
		{ uris: ['/files/**'], url: '/files/', matched: true, before: 'files', after: '' },
		{ uris: ['/files/**'], url: '/files/a', matched: true, before: 'files', after: 'a' },
		{ uris: ['/files/**'], url: '/files/a/', matched: true, before: 'files', after: 'a' },
		{ uris: ['/files/**'], url: '/files/a/b/c', matched: true, before: 'files', after: 'a/b/c' },
		{ uris: ['/files/**'], url: '/files/a%20b/c', matched: true, before: 'files', after: 'a b/c' },
		{ uris: ['/files/**'], url: '/filesx', matched: false },
		{ uris: ['/files/**'], url: '/', matched: false },
		{ uris: ['/**'], url: '/', matched: true, before: '/', after: '' },
		{ uris: ['/**'], url: '/a/b/c', matched: true, before: '/', after: 'a/b/c' },
		{ uris: ['/users/:id/**'], url: '/users/7', matched: true, before: '7', after: '' },
		{ uris: ['/users/:id/**'], url: '/users/7/x/y', matched: true, before: '7', after: 'x/y' },
		{ uris: ['/users/:id/**'], url: '/users', matched: false },
		{ uris: ['/a/b/**', '/a/c'], url: '/a/b/x', matched: true, before: 'b', after: 'x' },
		{ uris: ['/a/b/**', '/a/c'], url: '/a/c', matched: true },
		{ uris: ['/a/b/**', '/a/c'], url: '/a/c/x', matched: false }
	];

	describe('regression : matching is not changed, value is the rest of the path', () => {
		regressionCases.forEach(({ uris, url, matched, after }: RegressionCase): void => {
			it(`${ uris.join(' + ') } : ${ url }`, () => {
				const { rule, param } = findRoute(build(uris), url);

				expect(rule !== undefined && rule[METHOD.GET] !== undefined).to.be.eql(matched);

				if (after !== undefined) {
					expect(param).to.have.property('**', after);
				}
				else if (matched) {
					expect(param ?? {}).not.to.have.property('**');
				}
			});
		});
	});

	describe('regression : partial asterisk is not changed, * matches exactly one uri fragment', () => {
		([
			['/img/*', '/img/a', true, { '*': 'a' }],
			['/img/*', '/img/a.png', true, { '*': 'a.png' }],
			['/img/*', '/img/a/b', false, undefined],
			// matched in 2.1.0 with { '*': 'img' }
			['/img/*', '/img', false, undefined],
			['/img/*', '/img/', false, undefined],
			['/img/user1*', '/img/user', true, { 'user1*': 'user' }],
			['/img/user1*', '/img/user11', true, { 'user1*': 'user11' }],
			['/img/user1*', '/img/user11/x', false, undefined]
		] as [string, string, boolean, object | undefined][]).forEach(([uri, url, matched, param]: [string, string, boolean, object | undefined]): void => {
			it(`${ uri } : ${ url }`, () => {
				const result = findRoute(build([uri]), url);

				expect(result.rule !== undefined && result.rule[METHOD.GET] !== undefined).to.be.eql(matched);

				if (param !== undefined) {
					expect(result.param).to.be.eql(param);
				}
			});
		});
	});

	it('%2F in a uri fragment is decoded to / too', () => {
		expect(findRoute(build(['/files/**']), '/files/a%2Fb/c').param).to.be.eql({ '**': 'a/b/c' });
	});

	it('malformed percent-encoding in the rest of the path : HttpError(400)', () => {
		expect(() => findRoute(build(['/files/**']), '/files/a/%E0%A4%A'))
			.to.throw(HttpError)
			.with.property('status', 400);
	});

	describe('registration', () => {
		const invalidRules: [string, RouteRule][] = [
			['abbreviated path', { '/files/**/edit': { GET: fnc } }],
			['nested object with path', { '/files/**': { '/edit': { GET: fnc } } }],
			['nested object with uri fragment', { '/files': { '**': { edit: { GET: fnc } } } }],
			['method and path together', { '/files/**': { GET: fnc, '/edit': { GET: fnc } } }],
			['** in the middle of root', { '/**/a': { GET: fnc } }]
		];

		invalidRules.forEach(([name, rule]: [string, RouteRule]): void => {
			it(`throws : ${ name }`, () => {
				expect(() => refineRouteRule(rule, undefined)).to.throw('\'**\' should be the last uri fragment');
			});
		});

		it('throws with defaultMethod', () => {
			expect(() => refineRouteRule({ '/files/**/edit': fnc }, METHOD.GET)).to.throw('\'**\' should be the last uri fragment');
		});

		([
			{ '/files/**': { GET: fnc } },
			{ '/files/**': { GET: fnc, POST: fnc } },
			{ '/files': { '**': { GET: fnc } } },
			{ '/**': { GET: fnc } },
			{ '/users/:id/**': { GET: fnc } }
		] as RouteRule[]).forEach((rule: RouteRule): void => {
			it(`ok : ${ JSON.stringify(rule, (key: string, value: unknown) => typeof value === 'function' ? 'fnc' : value) }`, () => {
				expect(() => refineRouteRule(rule, undefined)).not.to.throw();
			});
		});
	});

	describe('HTTP', () => {
		let app: Badak;

		beforeEach(() => {
			app = new Badak({
				catchErrorLog: false
			});
		});

		afterEach(() => {
			return app.isRunning()
				? app.stop()
				: Promise.resolve();
		});

		it('route function receives the rest of the path', async () => {
			await app.get('/files/**', (ctx: ParamContext): unknown => ctx);
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/files/a/b%20c/d.txt')
				.expect(200, { params: { '**': 'a/b c/d.txt' }, query: {} });

			await request(app.getHttpServer())
				.get('/files')
				.expect(200, { params: { '**': '' }, query: {} });
		});

		it('query string is not included', async () => {
			await app.get('/files/**', (ctx: ParamContext): unknown => ctx);
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/files/a/b?c=1')
				.expect(200, { params: { '**': 'a/b' }, query: { c: '1' } });
		});

		it('malformed percent-encoding responds 400', async () => {
			await app.get('/files/**', (ctx: ParamContext): unknown => ctx);
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/files/a/%E0%A4%A')
				.expect(400);
		});

		it('get() throws for ** in the middle, the route is not registered', async () => {
			await promiseFail(
				app.get('/files/**/edit', fnc)
			);

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/files/a/edit')
				.expect(404);
		});

		it('setSPARoot() still works', async () => {
			await app.setSPARoot('/', __dirname + '/static/public');
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/some/client/route')
				.expect(200);
		});
	});
});
