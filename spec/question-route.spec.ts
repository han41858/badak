import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { ParamContext } from '../src/interfaces';
import { RouteFunction, RouteRule } from '../src/interfaces';
import { isQuestionPattern, matchQuestionPattern, parseQuestionPattern, questionPatternsIntersect } from '../src/question-pattern';
import { checkUriDuplication, findRoute, findRouteFunction, mergeRouteRule, refineRouteRule } from '../src/router';
import { promiseFail, TestPort } from './test-util';


describe('? routing', () => {
	describe('parseQuestionPattern()', () => {
		it('? makes the character just before it optional', () => {
			expect(parseQuestionPattern('colou?r')).to.be.eql([
				{ char: 'c', optional: false },
				{ char: 'o', optional: false },
				{ char: 'l', optional: false },
				{ char: 'o', optional: false },
				{ char: 'u', optional: true },
				{ char: 'r', optional: false }
			]);
		});

		it('by Unicode code point', () => {
			expect(parseQuestionPattern('a😀?')).to.be.eql([
				{ char: 'a', optional: false },
				{ char: '😀', optional: true }
			]);
		});

		['a??', 'ab??c', 'a+?', 'a?+', 'a*?', 'a?b*'].forEach((pattern: string): void => {
			it(`invalid : ${ pattern }`, () => {
				expect(() => parseQuestionPattern(pattern)).to.throw('invalid question route');
			});
		});

		it('colon routing is not a question pattern', () => {
			expect(isQuestionPattern(':id?')).to.be.false;
			expect(isQuestionPattern('id?')).to.be.true;
		});
	});

	describe('matchQuestionPattern()', () => {
		([
			['colou?r', 'color', true],
			['colou?r', 'colour', true],
			['colou?r', 'colouur', false],
			['colou?r', 'colr', false],
			['u?se?rs', 'users', true],
			['u?se?rs', 'sers', true],
			['u?se?rs', 'usrs', true],
			['u?se?rs', 'srs', true],
			['u?se?rs', 'user', false],
			// meta characters of regular expression are literal
			['a.c?', 'a.c', true],
			['a.c?', 'a.', true],
			['a.c?', 'abc', false],
			['a.c?', 'axc', false],
			['ab(cd)?e', 'ab(cd)e', true],
			['ab(cd)?e', 'ab(cde', true],
			['ab(cd)?e', 'abe', false],
			['ab(cd)?e', 'abcde', false],
			['a[bc]?', 'a[bc]', true],
			['a[bc]?', 'ab', false],
			['^a$?', '^a', true],
			['^a$?', 'a', false],
			['a|b?', 'a|', true],
			['a|b?', 'a', false],
			['a\\d?', 'a\\', true],
			['a\\d?', 'a1', false],
			// code point
			['한글?', '한', true],
			['한글?', '한글', true],
			['a😀?b', 'ab', true],
			['a😀?b', 'a😀b', true],
			['a😀?b', 'a\uD83Db', false]
		] as [string, string, boolean][]).forEach(([pattern, uriFrag, expected]: [string, string, boolean]): void => {
			it(`${ pattern } : ${ uriFrag } -> ${ expected }`, () => {
				expect(matchQuestionPattern(pattern, uriFrag)).to.be.eql(expected);
			});
		});
	});

	describe('questionPatternsIntersect()', () => {
		([
			['ab?c', 'a?bc', true], // abc
			['colou?r', 'colo?ur', true], // colour
			['users?', 'user?s', true], // users
			['a?b', 'ab?', true], // ab
			['colou?r', 'flavou?r', false],
			['ab?c', 'ab?d', false],
			['a?', 'b?', false], // only the empty string
			['a?b?', 'b?a?', true], // a, b
			['a.c?', 'abc?', false]
		] as [string, string, boolean][]).forEach(([a, b, expected]: [string, string, boolean]): void => {
			it(`${ a } & ${ b } -> ${ expected }`, () => {
				expect(questionPatternsIntersect(a, b)).to.be.eql(expected);
				expect(questionPatternsIntersect(b, a)).to.be.eql(expected);
			});
		});

		// brute force : all strings of a pattern, 2^n for n '?'
		const expand = (pattern: string): Set<string> => {
			let results: string[] = [''];

			for (const { char, optional } of parseQuestionPattern(pattern)) {
				results = results.flatMap((one: string): string[] => optional ? [one, one + char] : [one + char]);
			}

			return new Set(results);
		};

		// deterministic pseudo random
		let seed: number = 7;

		const random = (n: number): number => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % n;
		};

		const randomPattern = (): string => {
			let pattern: string = '';
			const length: number = 1 + random(6);

			for (let i: number = 0; i < length; i++) {
				pattern += 'ab'[random(2)];

				if (random(2) === 0) {
					pattern += '?';
				}
			}

			return pattern;
		};

		it('same result as brute force, for 2000 random pairs', () => {
			for (let n: number = 0; n < 2000; n++) {
				const a: string = randomPattern();
				const b: string = randomPattern();

				const setA: Set<string> = expand(a);
				const bruteForce: boolean = [...expand(b)].some((one: string): boolean => one !== '' && setA.has(one));

				expect(questionPatternsIntersect(a, b), `${ a } & ${ b }`).to.be.eql(bruteForce);
			}
		});

		it('matchQuestionPattern() : same result as brute force, for 2000 random cases', () => {
			for (let n: number = 0; n < 2000; n++) {
				const pattern: string = randomPattern();
				const uriFrag: string = randomPattern().replace(/\?/g, '');

				expect(matchQuestionPattern(pattern, uriFrag), `${ pattern } : ${ uriFrag }`).to.be.eql(expand(pattern).has(uriFrag));
			}
		});

		it('no exponential expansion : 300 optional characters', () => {
			const a: string = 'a?'.repeat(300) + 'b';
			const b: string = 'a?'.repeat(299) + 'c';

			const start: number = Date.now();

			expect(questionPatternsIntersect(a, b)).to.be.false;
			expect(questionPatternsIntersect(a, 'a?'.repeat(300) + 'b?')).to.be.true;
			expect(matchQuestionPattern(a, 'a'.repeat(300) + 'b')).to.be.true;
			expect(matchQuestionPattern(a, 'a'.repeat(301) + 'b')).to.be.false;

			// 2^300 strings if expanded
			expect(Date.now() - start).to.be.below(1000);
		});
	});

	describe('registration', () => {
		const fnc: RouteFunction = (): string => 'ok';

		const register = (uris: string[]): RouteRule => {
			const routeRule: RouteRule = {};

			uris.forEach((uri: string): void => {
				const refined: RouteRule = refineRouteRule({ [uri]: { GET: fnc } }, undefined);

				checkUriDuplication(routeRule, refined);
				mergeRouteRule(routeRule, refined);
			});

			return routeRule;
		};

		([
			['/ab?c', '/a?bc'],
			['/colou?r', '/colo?ur'],
			['/users?', '/user?s'],
			['/a?b?', '/b?a?'],
			['/x/ab?c', '/x/a?bc']
		] as [string, string][]).forEach(([a, b]: [string, string]): void => {
			it(`overlap throws in both orders : ${ a }, ${ b }`, () => {
				expect(() => register([a, b])).to.throw('duplicated question routing');
				expect(() => register([b, a])).to.throw('duplicated question routing');
			});
		});

		it('overlap throws in one route() call', () => {
			expect(() => refineRouteRule({ '/ab?c': { GET: fnc }, '/a?bc': { GET: fnc } }, undefined)).not.to.throw();

			return promiseFail(
				new Badak().route({
					'/ab?c': { GET: fnc },
					'/a?bc': { GET: fnc }
				})
			);
		});

		([
			['/colou?r', '/flavou?r'],
			['/ab?c', '/ab?d'],
			['/a?', '/b?'],
			['/x/ab?c', '/y/a?bc'],
			// regular expression meta character is literal, 'a.c?' doesn't match 'abc'
			['/a.c?', '/abc']
		] as [string, string][]).forEach(([a, b]: [string, string]): void => {
			it(`no overlap : ${ a }, ${ b }`, () => {
				expect(() => register([a, b])).not.to.throw();
				expect(() => register([b, a])).not.to.throw();
			});
		});

		it('same question pattern for other methods', () => {
			const routeRule: RouteRule = {};

			[{ '/colou?r': { GET: fnc } }, { '/colou?r': { POST: fnc } }].forEach((rule: RouteRule): void => {
				const refined: RouteRule = refineRouteRule(rule, undefined);

				checkUriDuplication(routeRule, refined);
				mergeRouteRule(routeRule, refined);
			});

			expect(findRouteFunction(findRoute(routeRule, '/color').rule, 'POST').targetFncObj).to.be.eql(fnc);
		});

		it('normal uri and question pattern : throws as before', () => {
			expect(() => register(['/abc', '/ab?c'])).to.throw('duplicated question routing');
			expect(() => register(['/ab?c', '/ac'])).to.throw('duplicated question routing');
		});

		['/a??', '/a+?', '/a?*', '/x/ab??c'].forEach((uri: string): void => {
			it(`invalid pattern throws : ${ uri }`, () => {
				expect(() => register([uri])).to.throw('invalid question route');
			});
		});
	});

	describe('priority and registration order', () => {
		// route function for each uri, to know which route is matched
		const fncOf = (uri: string): RouteFunction => {
			const fnc: RouteFunction = (): string => uri;
			Object.defineProperty(fnc, 'name', { value: uri });

			return fnc;
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

		interface Scenario {
			name: string;
			uris: string[];
			requests: [url: string, expectedUri: string | undefined][];
		}

		const scenarios: Scenario[] = [
			{
				name: 'question patterns without overlap',
				uris: ['/colou?r', '/flavou?r', '/ab?c', '/ab?d'],
				requests: [
					['/color', '/colou?r'],
					['/colour', '/colou?r'],
					['/flavor', '/flavou?r'],
					['/ac', '/ab?c'],
					['/abd', '/ab?d'],
					['/abe', undefined]
				]
			},
			{
				// not changed from 3.0.0 : normal > ':' > '?' > '+' > '*' > '**'
				name: 'with other routings',
				uris: ['/users', '/colou?r', '/ab+c', '/img/*', '/**'],
				requests: [
					['/users', '/users'],
					['/color', '/colou?r'],
					['/abbbc', '/ab+c'],
					['/img/a', '/img/*'],
					['/colr', '/**']
				]
			},
			{
				name: 'question pattern and plus routing for the same uri fragment : ? first',
				uris: ['/ab?c', '/ab+c'],
				requests: [
					['/abc', '/ab?c'],
					['/ac', '/ab?c'],
					['/abbc', '/ab+c']
				]
			},
			{
				name: 'colon routing first',
				uris: ['/:id', '/colou?r'],
				requests: [
					['/color', '/:id'],
					['/x', '/:id']
				]
			},
			{
				name: 'meta characters are literal',
				uris: ['/a.c?', '/abc'],
				requests: [
					['/abc', '/abc'],
					['/a.c', '/a.c?'],
					['/a.', '/a.c?'],
					['/axc', undefined]
				]
			}
		];

		scenarios.forEach(({ name, uris, requests }: Scenario): void => {
			const orders: string[][] = permutations(uris);

			describe(`${ name } (${ orders.length } registration orders)`, () => {
				requests.forEach(([url, expectedUri]: [string, string | undefined]): void => {
					it(`${ url } -> ${ expectedUri ?? '404' }`, () => {
						orders.forEach((order: string[]): void => {
							const routeRule: RouteRule = {};

							order.forEach((uri: string): void => {
								const refined: RouteRule = refineRouteRule({ [uri]: { GET: fncOf(uri) } }, undefined);

								checkUriDuplication(routeRule, refined);
								mergeRouteRule(routeRule, refined);
							});

							const { targetFncObj } = findRouteFunction(findRoute(routeRule, url).rule, 'GET');

							expect((targetFncObj as RouteFunction | undefined)?.name, `order : ${ order.join(', ') }`).to.be.eql(expectedUri);
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

		it('param has the matched uri fragment', async () => {
			await app.get('/colou?r', (ctx: ParamContext): unknown => ctx.params);
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/colour')
				.expect(200, { 'colou?r': 'colour' });
		});

		it('get() throws for overlap, the second route is not registered', async (;
			await app.get('/ab?c', (): string => 'first');

			await promiseFail(
				app.get('/a?bc', (): string => 'second')
			);

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/bc')
				.expect(404);

			await request(app.getHttpServer())
				.get('/abc')
				.expect(200, 'first');
		});
	});
});
