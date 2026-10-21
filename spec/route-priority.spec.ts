import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { RouteFunction, RouteRule, TypedObject } from '../src/interfaces';
import { checkUriDuplication, findRoute, findRouteFunction, mergeRouteRule, refineRouteRule } from '../src/router';
import { TestPort } from './test-util';


// which route function handles the request
// - '**' is a fallback, used only if the path doesn't match other routes fully (deepest '**' wins)
// - '*' matches exactly one uri fragment
// - the result doesn't depend on the registration order
describe('route priority', () => {
	interface Scenario {
		name: string;
		uris: string[];
		requests: [url: string, expectedUri: string | undefined, param?: TypedObject<unknown>][];
	}

	const scenarios: Scenario[] = [
		{
			name: 'SPA fallback with static file and API routes',
			uris: ['/**', '/style.css', '/api/users', '/api/users/:id'],
			requests: [
				['/', '/**', { '**': '' }],
				['/style.css', '/style.css'],
				['/api/users', '/api/users'],
				['/api/users/7', '/api/users/:id', { id: '7' }],
				['/api/users/7/x', '/**', { '**': 'api/users/7/x' }],
				// '/api' has no route function, not matched fully
				['/api', '/**', { '**': 'api' }],
				['/client/route', '/**', { '**': 'client/route' }]
			]
		},
		{
			name: 'deepest ** wins',
			uris: ['/**', '/files/**', '/files/x'],
			requests: [
				['/files/x', '/files/x'],
				['/files/x/y', '/files/**', { '**': 'x/y' }],
				['/files', '/files/**', { '**': '' }],
				['/files/', '/files/**', { '**': '' }],
				['/other/a', '/**', { '**': 'other/a' }]
			]
		},
		{
			name: 'colon routing with **',
			uris: ['/files/**', '/files/:id/edit'],
			requests: [
				['/files/1/edit', '/files/:id/edit', { id: '1' }],
				// params matched after '**' are not passed
				['/files/1', '/files/**', { '**': '1' }],
				['/files/1/view', '/files/**', { '**': '1/view' }]
			]
		},
		{
			name: '** after colon routing',
			uris: ['/users/:id/**', '/users/:id/profile'],
			requests: [
				['/users/7/profile', '/users/:id/profile', { id: '7' }],
				['/users/7/a/b', '/users/:id/**', { id: '7', '**': 'a/b' }],
				['/users/7', '/users/:id/**', { id: '7', '**': '' }]
			]
		},
		{
			name: '* matches exactly one uri fragment',
			uris: ['/img', '/img/*'],
			requests: [
				['/img', '/img'],
				['/img/', '/img'],
				['/img/a.png', '/img/*', { '*': 'a.png' }],
				['/img/a/b', undefined]
			]
		},
		{
			name: '* without exact route',
			uris: ['/img/*'],
			requests: [
				['/img', undefined],
				['/img/', undefined],
				['/img/a.png', '/img/*', { '*': 'a.png' }]
			]
		},
		{
			name: '* and ** in different levels',
			uris: ['/**', '/img/*'],
			requests: [
				['/img/a.png', '/img/*', { '*': 'a.png' }],
				['/img', '/**', { '**': 'img' }],
				['/img/a/b', '/**', { '**': 'img/a/b' }]
			]
		},
		{
			name: 'plus & question routing with ** fallback',
			uris: ['/**', '/ab+c', '/colou?r'],
			requests: [
				['/abbbc', '/ab+c', { 'ab+c': 'abbbc' }],
				['/abbbc/x', '/**', { '**': 'abbbc/x' }],
				['/color', '/colou?r', { 'colou?r': 'color' }],
				['/colour', '/colou?r', { 'colou?r': 'colour' }],
				['/colr', '/**', { '**': 'colr' }]
			]
		},
		{
			name: 'normal routing before colon routing (not changed)',
			uris: ['/users/:id', '/users/me'],
			requests: [
				['/users/me', '/users/me'],
				['/users/7', '/users/:id', { id: '7' }]
			]
		}
	];

	// all registration orders
	const permutations = <T>(arr: T[]): T[][] => {
		if (arr.length <= 1) {
			return [arr];
		}

		return arr.flatMap((one: T, i: number): T[][] => {
			return permutations([...arr.slice(0, i), ...arr.slice(i + 1)])
				.map((rest: T[]): T[] => [one, ...rest]);
		});
	};

	// route function for each uri, to know which route is matched
	const fncOf = (uri: string): RouteFunction => {
		const fnc: RouteFunction = (param: unknown): unknown => ({ uri, param });
		Object.defineProperty(fnc, 'name', { value: uri });

		return fnc;
	};

	describe('router', () => {
		scenarios.forEach(({ name, uris, requests }: Scenario): void => {
			const orders: string[][] = permutations(uris);

			describe(`${ name } (${ orders.length } registration orders)`, () => {
				requests.forEach(([url, expectedUri, param]: [string, string | undefined, TypedObject<unknown>?]): void => {
					it(`${ url } -> ${ expectedUri ?? '404' }`, () => {
						orders.forEach((order: string[]): void => {
							const routeRule: RouteRule = {};

							order.forEach((uri: string): void => {
								const refined: RouteRule = refineRouteRule({ [uri]: { GET: fncOf(uri) } }, undefined);

								checkUriDuplication(routeRule, refined);
								mergeRouteRule(routeRule, refined);
							});

							const matched = findRoute(routeRule, url);
							const { targetFncObj } = findRouteFunction(matched.rule, 'GET');

							const matchedUri: string | undefined = (targetFncObj as RouteFunction | undefined)?.name;

							expect(matchedUri, `order : ${ order.join(', ') }`).to.be.eql(expectedUri);

							if (expectedUri !== undefined) {
								expect(matched.param, `order : ${ order.join(', ') }`).to.be.eql(param);
							}
						});
					});
				});
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

		const scenario: Scenario = scenarios[0];

		[
			['registration order', scenario.uris],
			['reversed order', [...scenario.uris].reverse()]
		].forEach(([orderName, uris]: (string | string[])[]): void => {
			it(`${ scenario.name } : ${ orderName as string }`, async () => {
				for (const uri of uris as string[]) {
					await app.get(uri, fncOf(uri));
				}

				await app.listen(TestPort);

				for (const [url, expectedUri, param] of scenario.requests) {
					await request(app.getHttpServer())
						.get(url)
						.expect(200, { uri: expectedUri, ...(param !== undefined ? { param } : {}) });
				}
			});
		});

		it('path matched fully but method not registered : 405, not ** fallback', async () => {
			await app.get('/**', fncOf('/**'));
			await app.get('/api/users', fncOf('/api/users'));
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.post('/api/users')
				.expect(405)
				.expect('allow', 'GET, HEAD');
		});

		it('setSPARoot() serves static files and API routes', async () => {
			await app.get('/api/users', (): string => 'users');
			await app.setSPARoot('/', __dirname + '/static/public');
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/style.css')
				.expect(200)
				.expect('content-type', 'text/css; charset=utf-8');

			await request(app.getHttpServer())
				.get('/api/users')
				.expect(200, 'users');

			const index = await request(app.getHttpServer())
				.get('/')
				.expect(200)
				.expect('content-type', 'text/html; charset=utf-8');

			await request(app.getHttpServer())
				.get('/client/deep/link')
				.expect(200, index.text);
		});
	});
});
