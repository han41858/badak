import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { METHOD } from '../src/constants';
import { ParamContext, RouteFunction, RouteRule, TypedObject } from '../src/interfaces';
import { checkUriDuplication, findRoute, findRouteFunction, mergeRouteRule, refineRouteRule } from '../src/router';
import { TestPort } from './test-util';


// one request matches one route per method : docs/routing-spec-5.0.0.md 4. - 8.
describe('route conflicts and matching (5.0.0)', () => {
	// route function named by 'METHOD path'
	const fncOf = (name: string): RouteFunction => {
		const fnc: RouteFunction = (): string => name;
		Object.defineProperty(fnc, 'name', { value: name });

		return fnc;
	};

	// 'GET /a/:id' -> [method, path]
	const parse = (route: string): [METHOD, string] => {
		const [method, path] = route.split(' ');

		return [method as METHOD, path];
	};

	// register like Badak.route(), one rule object per route
	const build = (routes: string[]): RouteRule => {
		const routeRule: RouteRule = {};

		routes.forEach((route: string): void => {
			const [method, path] = parse(route);
			const refined: RouteRule = refineRouteRule({ [path]: { [method]: fncOf(route) } }, undefined);

			checkUriDuplication(routeRule, refined);
			mergeRouteRule(routeRule, refined);
		});

		return routeRule;
	};

	// matched route name & params, or the allowed methods for 405
	const match = (routeRule: RouteRule, method: string, url: string): { name?: string, param?: TypedObject<unknown>, allow?: string[] } => {
		const { rule, param } = findRoute(routeRule, url, method);
		const { targetFncObj, allowedMethods } = findRouteFunction(rule, method);

		return targetFncObj !== undefined
			? { name: (targetFncObj as RouteFunction).name, param }
			: { allow: allowedMethods };
	};

	describe('4. routes matching the same request path conflict, in both registration orders', () => {
		([
			['GET /users/me', 'GET /users/:id', true],
			['GET /files/readme', 'GET /files/*', true],
			['GET /abc', 'GET /ab+c', true],
			['GET /abc', 'GET /ab?c', true],
			['GET /abc', 'GET /ab*', true],
			['GET /ab*cd', 'GET /abXcd', true],
			['GET /ab*cd', 'GET /acd', false],
			['GET /ab*cd', 'GET /ab%2Acd', true],
			['GET /a*', 'GET /*b', true],
			['GET /a*', 'GET /b*', false],
			['GET /*.png', 'GET /*.jpg', false],
			['GET /a/:id', 'GET /a/b+', true],
			['GET /a/:id/details', 'GET /a/b+/details', true],
			['GET /a/:id/details', 'GET /a/b+/settings', false],
			['GET /users/:id/a', 'GET /users/:name/b', false],
			['GET /a/:id', 'POST /a/b+', false],
			['GET /a/:id', 'GET /a/:id/b', false],
			['GET /img/*', 'GET /img/:id', true],
			['GET /users/:id', 'GET /users/:name', true],
			['GET /한글/:id', 'GET /%ED%95%9C%EA%B8%80/:name', true],
			['GET /colou?r', 'GET /colou+r', true],
			['GET /aab+', 'GET /a+bb', true],
			['GET /ab?c', 'GET /ab+d', false]
		] as [string, string, boolean][]).forEach(([a, b, conflict]: [string, string, boolean]): void => {
			it(`${ a } & ${ b } : ${ conflict ? 'conflict' : 'allowed' }`, () => {
				[[a, b], [b, a]].forEach((order: string[]): void => {
					if (conflict) {
						expect(() => build(order), order.join(', ')).to.throw(`Conflicting routes for ${ parse(a)[0] }:`);
					}
					else {
						expect(() => build(order), order.join(', ')).to.not.throw();
					}
				});
			});
		});

		([
			['GET /users/:id', 'GET /users/:id'],
			['GET /한글', 'GET /%ED%95%9C%EA%B8%80'],
			['GET /ab%2Acd', 'GET /ab%2Acd'],
			['GET /a/**', 'GET /a/**']
		] as [string, string][]).forEach(([a, b]: [string, string]): void => {
			it(`${ a } & ${ b } : registered again, replaced by the latter`, () => {
				const routeRule: RouteRule = build([a, b]);
				const url: string = parse(a)[1].replace(/:id/, '7').replace('**', 'x').replace('%2A', '*');

				expect(match(routeRule, 'GET', url).name).to.be.eql(b);
			});
		});

		it('the error has the method and both paths', () => {
			expect(() => build(['GET /a/:id/details', 'GET /a/b+/details']))
				.to.throw('Conflicting routes for GET:\n  /a/:id/details\n  /a/b+/details');
		});

		it('keys of one route() rule object are checked too', () => {
			const rule: RouteRule = refineRouteRule({
				'/users/me': { GET: fncOf('me') },
				'/users': { ':id': { GET: fncOf(':id') } }
			}, undefined);

			expect(() => checkUriDuplication({}, rule)).to.throw('Conflicting routes for GET');
		});
	});

	describe('5. ** fallback', () => {
		([
			['GET /**', 'GET /files/**', false],
			['GET /files/*', 'GET /files/**', false],
			['GET /files/**', 'GET /files/:id', false],
			['GET /a/:id/**', 'GET /a/b+/**', true],
			['GET /:x/**', 'GET /a/**', true],
			['GET /a/:id/**', 'POST /a/b+/**', false],
			['GET /a/:id/x/**', 'GET /a/b+/**', false]
		] as [string, string, boolean][]).forEach(([a, b, conflict]: [string, string, boolean]): void => {
			it(`${ a } & ${ b } : ${ conflict ? 'conflict' : 'allowed' }`, () => {
				[[a, b], [b, a]].forEach((order: string[]): void => {
					if (conflict) {
						expect(() => build(order), order.join(', ')).to.throw('Conflicting fallback routes for GET at depth');
					}
					else {
						expect(() => build(order), order.join(', ')).to.not.throw();
					}
				});
			});
		});

		it('the error has the depth and both paths', () => {
			expect(() => build(['GET /a/:id/**', 'GET /a/b+/**']))
				.to.throw('Conflicting fallback routes for GET at depth 2:\n  /a/:id/**\n  /a/b+/**');
		});

		const routes: string[] = ['GET /**', 'GET /files/*', 'GET /files/**', 'GET /files/:id/edit', 'GET /a/:id/x/**', 'GET /a/b+/**', 'POST /a/:id/**'];

		([
			['GET', '/files/a', 'GET /files/*', { '*': 'a' }],
			['GET', '/files/a/b', 'GET /files/**', { '**': 'a/b' }],
			['GET', '/files', 'GET /files/**', { '**': '' }],
			['GET', '/files/1/edit', 'GET /files/:id/edit', { id: '1' }],
			['GET', '/other/x', 'GET /**', { '**': 'other/x' }],
			['GET', '/a/bb/x/y', 'GET /a/:id/x/**', { id: 'bb', '**': 'y' }],
			['GET', '/a/bb/z', 'GET /a/b+/**', { 'b+': 'bb', '**': 'z' }],
			['POST', '/a/cc/z', 'POST /a/:id/**', { id: 'cc', '**': 'z' }],
			['POST', '/a/bb/z', 'POST /a/:id/**', { id: 'bb', '**': 'z' }]
		] as [string, string, string, TypedObject<unknown>][]).forEach(([method, url, name, param]: [string, string, string, TypedObject<unknown>]): void => {
			it(`${ method } ${ url } -> ${ name }, in every registration order`, () => {
				// 7! = 5040 orders is too many, rotations and reversed rotations
				const orders: string[][] = routes.flatMap((_: string, i: number): string[][] => {
					const rotated: string[] = [...routes.slice(i), ...routes.slice(0, i)];

					return [rotated, [...rotated].reverse()];
				});

				orders.forEach((order: string[]): void => {
					expect(match(build(order), method, url), order.join(', ')).to.be.eql({ name, param });
				});
			});
		});

		it('deepest fallback without the method : 405 with the methods of that depth, no shallower fallback', () => {
			const routeRule: RouteRule = build(['PUT /**', 'GET /a/:id/**', 'POST /a/b+/**']);

			expect(match(routeRule, 'PUT', '/a/bb/c')).to.be.eql({ allow: ['GET', 'HEAD', 'POST'] });
			expect(match(routeRule, 'PUT', '/x/y').name).to.be.eql('PUT /**');
		});
	});

	describe('6. matching follows every candidate', () => {
		it('a route after a pattern that doesn\'t continue : 4.x responded 404', () => {
			const routeRule: RouteRule = build(['GET /a/:id/details', 'GET /a/b+/settings']);

			expect(match(routeRule, 'GET', '/a/bb/settings')).to.be.eql({ name: 'GET /a/b+/settings', param: { 'b+': 'bb' } });
			expect(match(routeRule, 'GET', '/a/bb/details')).to.be.eql({ name: 'GET /a/:id/details', param: { id: 'bb' } });
			expect(match(routeRule, 'GET', '/a/cc/settings')).to.be.eql({ allow: [] });
		});

		it('routes of different methods on overlapping patterns : 4.x responded 405', () => {
			const routeRule: RouteRule = build(['GET /a/:id', 'POST /a/b+']);

			expect(match(routeRule, 'POST', '/a/bb')).to.be.eql({ name: 'POST /a/b+', param: { 'b+': 'bb' } });
			expect(match(routeRule, 'GET', '/a/bb')).to.be.eql({ name: 'GET /a/:id', param: { id: 'bb' } });
			expect(match(routeRule, 'HEAD', '/a/bb')).to.be.eql({ name: 'GET /a/:id', param: { id: 'bb' } });
			expect(match(routeRule, 'PUT', '/a/bb')).to.be.eql({ allow: ['GET', 'HEAD', 'POST'] });
			expect(match(routeRule, 'POST', '/a/cc')).to.be.eql({ allow: ['GET', 'HEAD'] });
		});

		it('params of the routes not selected are not mixed', () => {
			const routeRule: RouteRule = build(['GET /a/:id/x', 'GET /a/b+/y']);

			expect(match(routeRule, 'GET', '/a/bb/y').param).to.be.eql({ 'b+': 'bb' });
		});

		it('a full match without the method : 405, no fallback', () => {
			const routeRule: RouteRule = build(['GET /**', 'POST /api/users']);

			expect(match(routeRule, 'GET', '/api/users')).to.be.eql({ allow: ['POST'] });
		});

		it('linear in the number of nodes : wide and deep route trees', () => {
			// every level has a literal and two patterns matching 'a'
			const routes: string[] = [];

			for (let depth: number = 1; depth <= 10; depth++) {
				const prefix: string = Array.from({ length: depth - 1 }, (): string => 'a').join('/');
				const base: string = prefix === '' ? '' : '/' + prefix;

				routes.push(`GET ${ base }/a+/end${ depth }`, `GET ${ base }/*a/stop${ depth }`);
			}

			const routeRule: RouteRule = build(routes);
			const start: number = Date.now();

			for (let n: number = 0; n < 1000; n++) {
				findRoute(routeRule, '/a/a/a/a/a/a/a/a/a/a/x');
			}

			expect(Date.now() - start).to.be.below(1000);
		});
	});

	describe('random route sets : registration and matching agree with brute force', () => {
		// deterministic pseudo random
		let seed: number = 3;

		const random = (n: number): number => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % n;
		};

		const fragments: string[] = ['a', 'b', 'ab', 'ba', 'aa', 'a+', 'b+', 'a?b', 'ab?', 'a*', '*b', '*', ':id', 'a+b', '%2A'];

		const randomPath = (): string => {
			const length: number = 1 + random(2);

			return '/' + Array.from({ length }, (): string => fragments[random(fragments.length)]).join('/');
		};

		// oracle : regular expression of one uri fragment (characters 'a', 'b', '*')
		const fragRegExp = (frag: string): RegExp => {
			if (frag === '%2A') {
				return /^\*$/;
			}

			if (frag === '*' || frag.startsWith(':')) {
				return /^.+$/;
			}

			return new RegExp(`^(?:${ frag.replace(/\*/g, '.*') })$`);
		};

		const pathMatches = (path: string, url: string): boolean => {
			const frags: string[] = path.split('/').slice(1);
			const urlFrags: string[] = url.split('/').slice(1);

			return frags.length === urlFrags.length
				&& frags.every((frag: string, i: number): boolean => fragRegExp(frag).test(decodeURIComponent(urlFrags[i])));
		};

		const urls: string[] = ((): string[] => {
			const frags: string[] = ['a', 'b', 'aa', 'ab', 'ba', 'bb', 'aab', 'abb', 'aaa', '*', 'a*'];
			const encoded: string[] = frags.map((frag: string): string => encodeURIComponent(frag).replace('*', '%2A'));

			return [
				...encoded.map((frag: string): string => '/' + frag),
				...encoded.flatMap((a: string): string[] => encoded.map((b: string): string => `/${ a }/${ b }`))
			];
		})();

		it('300 random sets of 3 routes', () => {
			let registered: number = 0;

			for (let n: number = 0; n < 300; n++) {
				const paths: string[] = Array.from({ length: 3 }, randomPath);
				const unique: string[] = [...new Set(paths)];
				const routes: string[] = unique.map((path: string): string => `GET ${ path }`);

				let routeRule: RouteRule | undefined;

				try {
					routeRule = build(routes);
				}
				catch (e) {
					expect((e as Error).message, routes.join(', ')).to.include('Conflicting routes for GET');

					// some request path is matched by two routes
					const conflicting: boolean = urls.some((url: string): boolean => {
						return unique.filter((path: string): boolean => pathMatches(path, url)).length > 1;
					});

					expect(conflicting, `${ routes.join(', ') } : ${ (e as Error).message }`).to.be.true;
					continue;
				}

				registered++;

				for (const url of urls) {
					const expected: string[] = unique.filter((path: string): boolean => pathMatches(path, url));

					expect(expected.length, `${ routes.join(', ') } : ${ url }`).to.be.at.most(1);
					expect(match(routeRule, 'GET', url).name, `${ routes.join(', ') } : ${ url }`)
						.to.be.eql(expected.length === 1 ? `GET ${ expected[0] }` : undefined);
				}
			}

			// both cases are covered
			expect(registered, 'registered sets').to.be.within(30, 270);
		});
	});

	describe('7. atomicity of a registration', () => {
		it('a conflicting route() call changes nothing', () => {
			const routeRule: RouteRule = build(['GET /users/:id', 'GET /files/a']);
			const before: string = JSON.stringify(routeRule);

			const refined: RouteRule = refineRouteRule({
				'/new/route': { GET: fncOf('new') },
				'/users/me': { GET: fncOf('me') }
			}, undefined);

			expect(() => checkUriDuplication(routeRule, refined)).to.throw('Conflicting routes');
			expect(JSON.stringify(routeRule)).to.be.eql(before);
			expect(match(routeRule, 'GET', '/new/route')).to.be.eql({ allow: [] });
		});
	});

	describe('HTTP', () => {
		let app: Badak;

		beforeEach(() => {
			app = new Badak({ catchErrorLog: false });
		});

		afterEach(() => {
			return app.isRunning()
				? app.stop(0)
				: Promise.resolve();
		});

		it('get() and route() mixed : conflict throws, the app keeps the routes before', async () => {
			await app.get('/users/:id', ({ params }: ParamContext): unknown => params);

			let error: Error | undefined;

			try {
				await app.route({ '/users': { me: { GET: (): string => 'me' } } });
			}
			catch (e) {
				error = e as Error;
			}

			expect(error?.message).to.include('Conflicting routes for GET:\n  /users/:id\n  /users/me');

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/users/me')
				.expect(200, { id: 'me' });
		});

		it('method-aware matching, 405 Allow with every candidate', async () => {
			await app.get('/a/:id', ({ params }: ParamContext): unknown => ({ get: params }));
			await app.post('/a/b+', ({ params }: ParamContext): unknown => ({ post: params }));
			await app.listen(TestPort);

			await request(app.getHttpServer()).post('/a/bb').expect(200, { post: { 'b+': 'bb' } });
			await request(app.getHttpServer()).get('/a/bb').expect(200, { get: { id: 'bb' } });
			await request(app.getHttpServer()).head('/a/bb').expect(200);
			await request(app.getHttpServer()).put('/a/bb').expect(405).expect('allow', 'GET, HEAD, POST');
		});

		it('a route after a pattern that doesn\'t continue', async () => {
			await app.get('/a/:id/details', ({ params }: ParamContext): unknown => ({ details: params }));
			await app.get('/a/b+/settings', ({ params }: ParamContext): unknown => ({ settings: params }));
			await app.listen(TestPort);

			await request(app.getHttpServer()).get('/a/bb/settings').expect(200, { settings: { 'b+': 'bb' } });
			await request(app.getHttpServer()).get('/a/bb/details').expect(200, { details: { id: 'bb' } });
		});
	});
});
