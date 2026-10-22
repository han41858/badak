import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { HttpError } from '../src/http-error';
import { ParamContext, RouteFunction, RouteRule, TypedObject } from '../src/interfaces';
import { canonicalRouteKey, compileRouteSegment, normalizeLiteral, tokenizeRequestPath } from '../src/route-segment';
import { checkUriDuplication, findRoute, findRouteFunction, mergeRouteRule, refineRouteRule } from '../src/router';
import { TestPort } from './test-util';


// percent-encoding of a string, for request paths
const enc = (str: string): string => encodeURIComponent(str);

describe('non-ASCII & percent-encoded routing', () => {
	// route function for each uri, to know which route is matched
	const fncOf = (uri: string): RouteFunction => {
		const fnc: RouteFunction = (ctx: ParamContext): unknown => ({
			uri,
			...(Object.keys(ctx.params).length > 0 ? { param: ctx.params } : {})
		});
		Object.defineProperty(fnc, 'name', { value: uri });

		return fnc;
	};

	const build = (uris: string[]): RouteRule => {
		const routeRule: RouteRule = {};

		uris.forEach((uri: string): void => {
			const refined: RouteRule = refineRouteRule({ [uri]: { GET: fncOf(uri) } }, undefined);

			checkUriDuplication(routeRule, refined);
			mergeRouteRule(routeRule, refined);
		});

		return routeRule;
	};

	// matched route uri & param
	const match = (routeRule: RouteRule, url: string): [string | undefined, TypedObject<unknown> | undefined] => {
		const { rule, param } = findRoute(routeRule, url);
		const { targetFncObj } = findRouteFunction(rule, 'GET');

		return [(targetFncObj as RouteFunction | undefined)?.name, param];
	};

	describe('tokenizeRequestPath() : split by real / first, then decode each uri fragment', () => {
		([
			['/files/a%2Fb', ['/', 'files', 'a/b']],
			['/files/a/b', ['/', 'files', 'a', 'b']],
			[`/${ enc('한글') }/${ enc('파일') }`, ['/', '한글', '파일']],
			['/a%2F%2Fb', ['/', 'a//b']],
			['/%2F', ['/', '/']],
			['/a%3Fb', ['/', 'a?b']],
			['/a%25b', ['/', 'a%b']],
			['//a//b/', ['/', 'a', 'b']]
		] as [string, string[]][]).forEach(([url, expected]: [string, string[]]): void => {
			it(`${ url } -> ${ JSON.stringify(expected) }`, () => {
				expect(tokenizeRequestPath(url)).to.be.eql(expected);
			});
		});

		it('%2F doesn\'t change the number of uri fragments', () => {
			expect(tokenizeRequestPath('/a%2Fb%2Fc/d')).to.have.length(3);
			expect(tokenizeRequestPath('/a/b/c/d')).to.have.length(5);
		});

		['/%E0%A4%A', '/a/%ZZ', '/%', '/a%2'].forEach((url: string): void => {
			it(`malformed percent-encoding : HttpError(400) : ${ url }`, () => {
				expect(() => tokenizeRequestPath(url)).to.throw(HttpError).with.property('status', 400);
			});
		});
	});

	describe('route key : encoded characters are literal, unencoded characters are syntax', () => {
		([
			['한글', '한글'],
			['%ED%95%9C%EA%B8%80', '한글'],
			['%ed%95%9c%ea%b8%80', '한글'],
			['a%2Fb', 'a/b'],
			['%2A', '*'],
			['a%3Fb', 'a?b'],
			['%3Aid', ':id'],
			['a%2Bb', 'a+b'],
			['100%25', '100%']
		] as [string, string][]).forEach(([routeKey, literal]: [string, string]): void => {
			it(`${ routeKey } is a normal route of literal '${ literal }'`, () => {
				expect(compileRouteSegment(routeKey)).to.be.eql({ kind: 'normal', literal });
				expect(normalizeLiteral(routeKey)).to.be.eql(literal);
			});
		});

		([
			['*', 'pattern'],
			['**', 'doubleAsterisk'],
			[':id', 'colon'],
			['colou?r', 'pattern'],
			['ab+c', 'pattern'],
			['ab*c', 'pattern'],
			['%2A', 'normal'],
			['a%3Fb', 'normal']
		] as [string, string][]).forEach(([routeKey, kind]: [string, string]): void => {
			it(`${ routeKey } is ${ kind }`, () => {
				expect(compileRouteSegment(routeKey).kind).to.be.eql(kind);
			});
		});

		['/%E0%A4%A', '/%ZZ', '/100%', '/a/%2', '/colou?r%', '/ab+c%E0'].forEach((uri: string): void => {
			it(`malformed percent-encoding throws on registration : ${ uri }`, () => {
				expect(() => build([uri])).to.throw('invalid percent-encoding');
			});
		});

		['/a++b', '/ab+*c', '/a**b', '/ab?*c', '/?ab'].forEach((uri: string): void => {
			it(`invalid syntax throws on registration : ${ uri }`, () => {
				expect(() => build([uri])).to.throw('invalid');
			});
		});
	});

	describe('each routing with non-ASCII paths', () => {
		const routeRule: RouteRule = build([
			'/한글',
			'/files/:id',
			'/색깔?',
			'/가+나',
			'/img/*',
			'/사진*',
			'/dir/**'
		]);

		([
			[`/${ enc('한글') }`, '/한글', undefined],
			[`/files/${ enc('한글') }`, '/files/:id', { id: '한글' }],
			[`/${ enc('색') }`, '/색깔?', { '색깔?': '색' }],
			[`/${ enc('색깔') }`, '/색깔?', { '색깔?': '색깔' }],
			[`/${ enc('가나') }`, '/가+나', { '가+나': '가나' }],
			[`/${ enc('가가가나') }`, '/가+나', { '가+나': '가가가나' }],
			[`/img/${ enc('한.png') }`, '/img/*', { '*': '한.png' }],
			[`/${ enc('사진첩') }`, '/사진*', { '사진*': '사진첩' }],
			[`/${ enc('사진') }`, '/사진*', { '사진*': '사진' }],
			[`/${ enc('사') }`, undefined, undefined],
			[`/dir/${ enc('한') }/${ enc('글') }`, '/dir/**', { '**': '한/글' }],
			[`/${ enc('한글x') }`, undefined, undefined],
			[`/${ enc('나') }`, undefined, undefined]
		] as [string, string | undefined, TypedObject<unknown> | undefined][]).forEach(([url, uri, param]: [string, string | undefined, TypedObject<unknown> | undefined]): void => {
			it(`${ decodeURIComponent(url) } -> ${ uri ?? '404' }`, () => {
				const [matchedUri, matchedParam] = match(routeRule, url);

				expect(matchedUri).to.be.eql(uri);

				if (uri !== undefined) {
					expect(matchedParam).to.be.eql(param);
				}
			});
		});
	});

	describe('encoded and decoded routing paths are equivalent', () => {
		const pairs: [string, string][] = [
			['/한글', '/%ED%95%9C%EA%B8%80'],
			['/files/한글/:id', '/files/%ED%95%9C%EA%B8%80/:id'],
			['/색깔?', '/%EC%83%89%EA%B9%94?'],
			['/가+나', '/%EA%B0%80+%EB%82%98'],
			['/사진*', '/%EC%82%AC%EC%A7%84*'],
			['/한글/**', '/%ED%95%9C%EA%B8%80/**']
		];

		const urls: string[] = [
			`/${ enc('한글') }`,
			`/files/${ enc('한글') }/7`,
			`/${ enc('색') }`,
			`/${ enc('가가나') }`,
			`/${ enc('사진첩') }`,
			`/${ enc('한글') }/a/b`,
			`/${ enc('한') }`
		];

		pairs.forEach(([decoded, encoded]: [string, string]): void => {
			it(`${ decoded } = ${ encoded }`, () => {
				const decodedRule: RouteRule = build([decoded]);
				const encodedRule: RouteRule = build([encoded]);

				urls.forEach((url: string): void => {
					const [decodedUri, decodedParam] = match(decodedRule, url);
					const [encodedUri, encodedParam] = match(encodedRule, url);

					expect(encodedUri === undefined, url).to.be.eql(decodedUri === undefined);

					// route keys are canonical, param keys of '?', '+', '*' are the same too
					expect(encodedParam, url).to.be.eql(decodedParam);
				});
			});
		});

		it('literal * (%2A) and wildcard * are different routes', () => {
			const routeRule: RouteRule = build(['/%2A', '/a/*']);

			expect(match(routeRule, '/*')[0]).to.be.eql('/%2A');
			expect(match(routeRule, '/%2A')[0]).to.be.eql('/%2A');
			expect(match(routeRule, '/x')[0]).to.be.undefined;
			expect(match(routeRule, '/a/x')[0]).to.be.eql('/a/*');
		});

	});

	describe('canonicalRouteKey()', () => {
		([
			['한글', '한글'],
			['%ED%95%9C%EA%B8%80', '한글'],
			['%ed%95%9c%ea%b8%80', '한글'],
			['%2a', '%2A'],
			['%2A', '%2A'],
			['a%2Fb', 'a%2Fb'],
			['a%3fb', 'a%3Fb'],
			['%3Aid', '%3Aid'],
			['100%25', '100%25'],
			['a%20b', 'a%20b'],
			['col%6Fu?r', 'colou?r'],
			['%EC%83%89%EA%B9%94?', '색깔?'],
			['colou%3F?r', 'colou%3F?r'],
			['a%62+c', 'ab+c'],
			['%EC%82%AC%EC%A7%84*', '사진*'],
			[':%69d', ':id'],
			[':id', ':id'],
			['*', '*'],
			['**', '**']
		] as [string, string][]).forEach(([routeKey, canonical]: [string, string]): void => {
			it(`${ routeKey } -> ${ canonical }`, () => {
				expect(canonicalRouteKey(routeKey)).to.be.eql(canonical);

				// idempotent, and the same interpretation
				expect(canonicalRouteKey(canonical)).to.be.eql(canonical);
				expect(compileRouteSegment(canonical).kind).to.be.eql(compileRouteSegment(routeKey).kind);
			});
		});
	});

	describe('the same path in different spellings is one node', () => {
		const spellings: string[][] = [
			['/한글', '/%ED%95%9C%EA%B8%80', '/%ed%95%9c%ea%b8%80'],
			['/a/한글/:id', '/a/%ED%95%9C%EA%B8%80/:id', '/a/%ed%95%9c%ea%b8%80/:%69d'],
			['/colou?r', '/col%6Fu?r', '/c%6Flou?r'],
			['/ab+c', '/a%62+c', '/%61b+c'],
			['/사진*', '/%EC%82%AC%EC%A7%84*', '/%EC%82%AC진*'],
			['/한글/**', '/%ED%95%9C%EA%B8%80/**', '/%ed%95%9c%ea%b8%80/**']
		];

		const methods: ('GET' | 'POST' | 'PUT')[] = ['GET', 'POST', 'PUT'];

		const urlOf = (uri: string): string => {
			return uri
				.replace('/:id', '/7')
				.replace('/:%69d', '/7')
				.replace(/\?/g, '')
				.replace(/\+/g, '')
				.replace(/\*\*$/, 'x/y')
				.replace(/\*$/, '첩')
				.split('/')
				.map((frag: string): string => enc(decodeURIComponent(frag)))
				.join('/');
		};

		const permutations = <T>(arr: T[]): T[][] => {
			if (arr.length <= 1) {
				return [arr];
			}

			return arr.flatMap((one: T, i: number): T[][] => {
				return permutations([...arr.slice(0, i), ...arr.slice(i + 1)])
					.map((rest: T[]): T[] => [one, ...rest]);
			});
		};

		spellings.forEach((uris: string[]): void => {
			describe(uris.join(', '), () => {
				// different methods in different spellings, all registration orders
				const registrations: [string, 'GET' | 'POST' | 'PUT'][] = uris.map((uri: string, i: number): [string, 'GET' | 'POST' | 'PUT'] => [uri, methods[i]]);

				it('get() / post() / put() : merged into one node, in all registration orders', () => {
					let firstTree: string | undefined;

					permutations(registrations).forEach((order: [string, 'GET' | 'POST' | 'PUT'][]): void => {
						const routeRule: RouteRule = {};

						order.forEach(([uri, method]: [string, 'GET' | 'POST' | 'PUT']): void => {
							const refined: RouteRule = refineRouteRule({ [uri]: { [method]: fncOf(method) } }, undefined);

							checkUriDuplication(routeRule, refined);
							mergeRouteRule(routeRule, refined);
						});

						const url: string = urlOf(uris[0]);

						methods.forEach((method: string): void => {
							const { targetFncObj } = findRouteFunction(findRoute(routeRule, url).rule, method);

							expect((targetFncObj as RouteFunction | undefined)?.name, `${ method } ${ url }, order : ${ JSON.stringify(order) }`).to.be.eql(method);
						});

						// the same tree regardless of the order
						// keys sorted, insertion order of method keys depends on the registration order
						const tree: string = JSON.stringify(routeRule, (key: string, value: unknown): unknown => {
							if (typeof value === 'function') {
								return value.name;
							}

							return typeof value === 'object' && value !== null
								? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
								: value;
						});

						if (firstTree === undefined) {
							firstTree = tree;
						}

						expect(tree).to.be.eql(firstTree);
					});
				});

				it('route() with one rule object', async () => {
					const app: Badak = new Badak({ catchErrorLog: false });

					await app.route(Object.fromEntries(
						registrations.map(([uri, method]: [string, string]): [string, RouteRule] => [uri, { [method]: fncOf(method) }])
					));

					await app.listen(TestPort);

					try {
						for (const method of methods) {
							await request(app.getHttpServer())[method.toLowerCase() as 'get' | 'post' | 'put'](urlOf(uris[0]))
								.expect(200)
								.then((res): void => {
									expect(res.body.uri).to.be.eql(method);
								});
						}
					}
					finally {
						await app.stop();
					}
				});
			});
		});

		it('route() with nested rule objects', async () => {
			const app: Badak = new Badak({ catchErrorLog: false });

			await app.route({
				'/x': {
					'한글': { GET: fncOf('GET') },
					'%ED%95%9C%EA%B8%80': { POST: fncOf('POST') }
				},
				'/%78/%ed%95%9c%ea%b8%80': { PUT: fncOf('PUT') }
			});

			await app.listen(TestPort);

			try {
				for (const method of methods) {
					await request(app.getHttpServer())[method.toLowerCase() as 'get' | 'post' | 'put'](`/x/${ enc('한글') }`)
						.expect(200)
						.then((res): void => {
							expect(res.body.uri).to.be.eql(method);
						});
				}

				// allowed methods of the merged node
				await request(app.getHttpServer())
					.delete(`/x/${ enc('한글') }`)
					.expect(405)
					.expect('allow', 'GET, HEAD, POST, PUT');
			}
			finally {
				await app.stop();
			}
		});

		it('route() : abbreviated path and nested object for the same node are merged', async () => {
			const app: Badak = new Badak({ catchErrorLog: false });

			// GET was lost until 3.0.0, '/b' node replaced the node made by '/b/c'
			await app.route({
				'/b/c': { GET: fncOf('GET') },
				'/b': { c: { POST: fncOf('POST') } }
			});

			await app.listen(TestPort);

			try {
				await request(app.getHttpServer()).get('/b/c').expect(200, { uri: 'GET' });
				await request(app.getHttpServer()).post('/b/c').expect(200, { uri: 'POST' });
			}
			finally {
				await app.stop();
			}
		});

		describe('the same path & method : the latter wins, same as the same spelling', () => {
			[
				['/한글', '/한글'],
				['/한글', '/%ED%95%9C%EA%B8%80'],
				['/%ED%95%9C%EA%B8%80', '/한글']
			].forEach(([first, second]: string[]): void => {
				it(`get('${ first }') then get('${ second }')`, async () => {
					const app: Badak = new Badak({ catchErrorLog: false });

					await app.get(first, fncOf('first'));
					await app.get(second, fncOf('second'));
					await app.listen(TestPort);

					try {
						await request(app.getHttpServer())
							.get(`/${ enc('한글') }`)
							.expect(200, { uri: 'second' });
					}
					finally {
						await app.stop();
					}
				});
			});

			it('in one route() rule object', async () => {
				const app: Badak = new Badak({ catchErrorLog: false });

				await app.route({
					'/한글': { GET: fncOf('first') },
					'/%ED%95%9C%EA%B8%80': { GET: fncOf('second') }
				});

				await app.listen(TestPort);

				try {
					await request(app.getHttpServer())
						.get(`/${ enc('한글') }`)
						.expect(200, { uri: 'second' });
				}
				finally {
					await app.stop();
				}
			});
		});

		it('different spellings don\'t break duplication check of other routes', () => {
			expect(() => build(['/%ED%95%9C%EA%B8%80', '/한?글'])).to.throw('Conflicting routes for GET');
			expect(() => build(['/a%62+c', '/abbc'])).to.throw('Conflicting routes for GET');
			expect(() => build(['/:id', '/:%6Eame'])).to.throw('Conflicting routes for GET');
		});
	});

	describe('%2F in a uri fragment', () => {
		it('/files/:id : a%2Fb is { id: \'a/b\' }, a/b is not matched', () => {
			const routeRule: RouteRule = build(['/files/:id']);

			expect(match(routeRule, '/files/a%2Fb')).to.be.eql(['/files/:id', { id: 'a/b' }]);
			expect(match(routeRule, '/files/a/b')[0]).to.be.undefined;
		});

		it('/files/:id/edit : a%2Fb/edit', () => {
			const routeRule: RouteRule = build(['/files/:id/edit']);

			expect(match(routeRule, '/files/a%2Fb/edit')).to.be.eql(['/files/:id/edit', { id: 'a/b' }]);
			expect(match(routeRule, '/files/a/b/edit')[0]).to.be.undefined;
		});

		it('%2F in a route key is one uri fragment, not a separator', () => {
			const routeRule: RouteRule = build(['/s/a%2Fb', '/s/a/b']);

			expect(match(routeRule, '/s/a%2Fb')[0]).to.be.eql('/s/a%2Fb');
			expect(match(routeRule, '/s/a/b')[0]).to.be.eql('/s/a/b');
		});
	});

	describe('reserved characters decoded don\'t become routing syntax', () => {
		([
			['/%2A', '/x', false],
			['/%2A', '/*', true],
			['/colou%3Fr', '/color', false],
			['/colou%3Fr', '/colou%3Fr', true],
			['/%3Aid', '/7', false],
			['/%3Aid', '/:id', true],
			['/a%2Bb', '/aab', false],
			['/a%2Bb', '/a%2Bb', true],
			['/100%25', '/100%25', true],
			['/a%2A%2A', '/a**', true],
			['/a%2A%2A', '/abc', false]
		] as [string, string, boolean][]).forEach(([uri, url, matched]: [string, string, boolean]): void => {
			it(`${ uri } : ${ url } -> ${ matched }`, () => {
				expect(match(build([uri]), url)[0] !== undefined).to.be.eql(matched);
			});
		});

		it('request uri fragments are data : decoded * ? : + are not syntax', () => {
			const routeRule: RouteRule = build(['/colou?r', '/ab+c', '/x/*']);

			expect(match(routeRule, '/colou%3Fr')[0]).to.be.undefined;
			expect(match(routeRule, '/ab%2Bc')[0]).to.be.undefined;
			expect(match(routeRule, '/x/%2A')).to.be.eql(['/x/*', { '*': '*' }]);
		});
	});

	describe('registration order doesn\'t change the result', () => {
		const permutations = <T>(arr: T[]): T[][] => {
			if (arr.length <= 1) {
				return [arr];
			}

			return arr.flatMap((one: T, i: number): T[][] => {
				return permutations([...arr.slice(0, i), ...arr.slice(i + 1)])
					.map((rest: T[]): T[] => [one, ...rest]);
			});
		};

		// patterns that don't overlap each other (5.0.0 : no priority between them)
		const uris: string[] = ['/한글', '/%EB%B0%94%EB%8B%A5', '/다*', '/색깔?', '/가+나', '/**'];
		const orders: string[][] = permutations(uris);

		([
			[`/${ enc('한글') }`, '/한글'],
			[`/${ enc('바닥') }`, '/%EB%B0%94%EB%8B%A5'],
			[`/${ enc('다른') }`, '/다*'],
			[`/${ enc('가나') }`, '/가+나'],
			[`/${ enc('색') }`, '/색깔?'],
			[`/${ enc('나') }`, '/**'],
			[`/${ enc('한글') }/x`, '/**']
		] as [string, string][]).forEach(([url, expectedUri]: [string, string]): void => {
			it(`${ decodeURIComponent(url) } -> ${ expectedUri } (${ orders.length } orders)`, () => {
				orders.forEach((order: string[]): void => {
					expect(match(build(order), url)[0], `order : ${ order.join(', ') }`).to.be.eql(expectedUri);
				});
			});
		});
	});

	describe('HTTP', () => {
		let app: Badak;
		let tempDir: string;

		beforeEach(() => {
			app = new Badak({
				catchErrorLog: false
			});

			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'badak-non-ascii-'));
		});

		afterEach(async () => {
			fs.rmSync(tempDir, { recursive: true, force: true });

			if (app.isRunning()) {
				await app.stop();
			}
		});

		it('route functions receive decoded params', async () => {
			await app.get('/한글/:id', (ctx: ParamContext): unknown => ctx.params);
			await app.get('/files/**', (ctx: ParamContext): unknown => ctx.params);
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get(`/${ enc('한글') }/${ enc('값') }`)
				.expect(200, { id: '값' });

			await request(app.getHttpServer())
				.get('/files/a%2Fb/c')
				.expect(200, { '**': 'a/b/c' });
		});

		it('malformed percent-encoding responds 400 for any path', async () => {
			await app.get('/a', (): string => 'a');
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/a/%E0%A4%A')
				.expect(400);

			await request(app.getHttpServer())
				.get('/%E0%A4%A')
				.expect(400);
		});

		it('static files with non-ASCII or reserved characters in names', async () => {
			const names: string[] = ['한글.txt', 'a+b.txt', '100%.txt', 'a b.txt', 'star*.txt', 'q?.txt', ':colon.txt'];

			names.forEach((name: string): void => {
				fs.writeFileSync(path.join(tempDir, name), name);
			});

			await app.static('/static', tempDir);
			await app.listen(TestPort);

			for (const name of names) {
				await request(app.getHttpServer())
					.get(`/static/${ enc(name) }`)
					.expect(200, name);
			}

			// literal file names, not routing syntax
			await request(app.getHttpServer())
				.get('/static/aab.txt')
				.expect(404);

			await request(app.getHttpServer())
				.get('/static/starX.txt')
				.expect(404);
		});

		it('static prefix with non-ASCII', async () => {
			fs.writeFileSync(path.join(tempDir, '파일.txt'), 'file');

			await app.static('/정적', tempDir);
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get(`/${ enc('정적') }/${ enc('파일.txt') }`)
				.expect(200, 'file');
		});

		it('SPA fallback with non-ASCII static file and route', async () => {
			fs.writeFileSync(path.join(tempDir, 'index.html'), '<p>index</p>');
			fs.writeFileSync(path.join(tempDir, '스타일.css'), 'body {}');

			await app.get('/api/사용자', (): string => 'users');
			await app.setSPARoot('/', tempDir);
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get(`/${ enc('스타일.css') }`)
				.expect(200, 'body {}');

			await request(app.getHttpServer())
				.get(`/api/${ enc('사용자') }`)
				.expect(200, 'users');

			await request(app.getHttpServer())
				.get(`/${ enc('클라이언트') }/route`)
				.expect(200, '<p>index</p>');

			await request(app.getHttpServer())
				.get('/')
				.expect(200, '<p>index</p>');
		});
	});
});
