import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { ParamContext, RouteFunction, RouteRule } from '../src/interfaces';
import { matchPatternTokens, PatternToken, patternTokensIntersect } from '../src/fragment-pattern';
import { parseQuestionPattern } from '../src/question-pattern';
import { compileRouteSegment, RouteSegment } from '../src/route-segment';
import { checkUriDuplication, findRoute, findRouteFunction, mergeRouteRule, refineRouteRule } from '../src/router';
import { promiseFail, TestPort } from './test-util';


describe('+ routing', () => {
	// a random pattern may have no '+', it is a normal uri fragment
	const plusTokens = (pattern: string): PatternToken[] => {
		const segment: RouteSegment = compileRouteSegment(pattern);

		return segment.kind === 'plus'
			? segment.tokens
			: [...(segment as { literal: string }).literal].map((char: string): PatternToken => ({ char, optional: false, repeat: false }));
	};

	// '?' or '+' pattern
	const tokensOf = (pattern: string): PatternToken[] => {
		return pattern.includes('?')
			? parseQuestionPattern(pattern)
			: plusTokens(pattern);
	};

	// oracle : regular expression of the same pattern, characters are 'a' and 'b' only
	const toRegExp = (pattern: string): RegExp => new RegExp(`^(?:${ pattern })$`);

	// all strings of 'a' and 'b' up to the length
	const allStrings = (maxLength: number): string[] => {
		const results: string[] = [];
		let current: string[] = [''];

		for (let length: number = 1; length <= maxLength; length++) {
			current = current.flatMap((one: string): string[] => [one + 'a', one + 'b']);
			results.push(...current);
		}

		return results;
	};

	// deterministic pseudo random
	let seed: number = 11;

	const random = (n: number): number => {
		seed = (seed * 1103515245 + 12345) % 2147483648;
		return seed % n;
	};

	// up to 4 characters, each one can be followed by the syntax character
	const randomPattern = (syntax: '+' | '?'): string => {
		let pattern: string = '';
		const length: number = 1 + random(4);

		for (let i: number = 0; i < length; i++) {
			pattern += 'ab'[random(2)];

			if (random(2) === 0) {
				pattern += syntax;
			}
		}

		return pattern;
	};

	describe('tokens', () => {
		it('ab+c', () => {
			expect(plusTokens('ab+c')).to.be.eql([
				{ char: 'a', optional: false, repeat: false },
				{ char: 'b', optional: false, repeat: true },
				{ char: 'c', optional: false, repeat: false }
			]);
		});

		it('percent-encoded and non-ASCII characters are literal', () => {
			expect(plusTokens('%2B한+')).to.be.eql([
				{ char: '+', optional: false, repeat: false },
				{ char: '한', optional: false, repeat: true }
			]);
		});

		['++', 'a++', 'ab++c'].forEach((pattern: string): void => {
			it(`${ pattern } : invalid`, () => {
				expect(() => compileRouteSegment(pattern + 'x')).to.throw('invalid plus route');
			});
		});
	});

	describe('matchPatternTokens()', () => {
		([
			['ab+c', 'abc', true],
			['ab+c', 'abbbc', true],
			['ab+c', 'ac', false],
			['ab+c', 'abcc', false],
			['a+b+', 'aabbb', true],
			['a+b+', 'ba', false],
			['a.c+', 'a.cc', true],
			['a.c+', 'abc', false],
			['한+', '한한', true]
		] as [string, string, boolean][]).forEach(([pattern, uriFrag, expected]: [string, string, boolean]): void => {
			it(`${ pattern } : ${ uriFrag } -> ${ expected }`, () => {
				expect(matchPatternTokens(plusTokens(pattern), uriFrag)).to.be.eql(expected);
			});
		});

		it('same result as regular expression, for 2000 random cases', () => {
			const uriFrags: string[] = allStrings(6);

			for (let n: number = 0; n < 2000; n++) {
				const pattern: string = randomPattern('+');
				const uriFrag: string = uriFrags[random(uriFrags.length)];

				expect(matchPatternTokens(plusTokens(pattern), uriFrag), `${ pattern } : ${ uriFrag }`)
					.to.be.eql(toRegExp(pattern).test(uriFrag));
			}
		});

		it('no backtracking : a+ x 30 with a long uri fragment', () => {
			const tokens: PatternToken[] = plusTokens('a+'.repeat(30) + 'b');
			const start: number = Date.now();

			expect(matchPatternTokens(tokens, 'a'.repeat(5000) + 'b')).to.be.true;
			expect(matchPatternTokens(tokens, 'a'.repeat(5000) + 'c')).to.be.false;
			expect(matchPatternTokens(tokens, 'a'.repeat(29) + 'b')).to.be.false;

			// a regular expression backtracks O(n^30) for 'aaa...c'
			expect(Date.now() - start).to.be.below(1000);
		});
	});

	describe('patternTokensIntersect()', () => {
		([
			['aab+', 'a+bb', true], // aabb
			['ab+c', 'abb+c', true], // abbc
			['a+b', 'ab+', true], // ab
			['ab+', 'a+c', false],
			['ab+c', 'ab+d', false],
			['a+', 'b+', false],
			['colou?r', 'colou+r', true], // colour
			['ab?c', 'ab+c', true], // abc
			['ab?c', 'ab+d', false],
			['a?', 'a+', true], // a
			['b?', 'a+', false],
			['a?b?', 'c+', false]
		] as [string, string, boolean][]).forEach(([a, b, expected]: [string, string, boolean]): void => {
			it(`${ a } & ${ b } -> ${ expected }`, () => {
				expect(patternTokensIntersect(tokensOf(a), tokensOf(b))).to.be.eql(expected);
				expect(patternTokensIntersect(tokensOf(b), tokensOf(a))).to.be.eql(expected);
			});
		});

		// common strings of random patterns (up to 4 characters each) are searched up to 8 characters
		// a pair with a longer shortest common string would fail as a false positive, not pass silently
		const strings: string[] = allStrings(8);

		const bruteForce = (a: string, b: string): boolean => {
			const regExpA: RegExp = toRegExp(a);
			const regExpB: RegExp = toRegExp(b);

			return strings.some((one: string): boolean => regExpA.test(one) && regExpB.test(one));
		};

		it('+ and + : same result as brute force, for 1000 random pairs', () => {
			for (let n: number = 0; n < 1000; n++) {
				const a: string = randomPattern('+');
				const b: string = randomPattern('+');

				expect(patternTokensIntersect(tokensOf(a), tokensOf(b)), `${ a } & ${ b }`).to.be.eql(bruteForce(a, b));
			}
		});

		it('? and + : same result as brute force, for 1000 random pairs', () => {
			for (let n: number = 0; n < 1000; n++) {
				const a: string = randomPattern('?');
				const b: string = randomPattern('+');

				expect(patternTokensIntersect(tokensOf(a), tokensOf(b)), `${ a } & ${ b }`).to.be.eql(bruteForce(a, b));
			}
		});

		it('linear : 300 repeat characters', () => {
			const start: number = Date.now();

			expect(patternTokensIntersect(tokensOf('a+'.repeat(300) + 'b'), tokensOf('a+'.repeat(299) + 'c'))).to.be.false;
			expect(patternTokensIntersect(tokensOf('a+'.repeat(300) + 'b'), tokensOf('a'.repeat(400) + 'b+'))).to.be.true;
			expect(patternTokensIntersect(tokensOf('a?'.repeat(300) + 'b'), tokensOf('a+b'))).to.be.true;

			expect(Date.now() - start).to.be.below(1000);
		});
	});

	describe('registration', () => {
		const fncOf = (uri: string): RouteFunction => {
			const fnc: RouteFunction = (): string => uri;
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

		([
			// + and + : '/aab+' and '/a+bb' were registered together in 4.0.0, the common uri fragment is longer than the shortest ones
			[['/aab+', '/a+bb'], 'duplicated plus routing'],
			[['/xa+y', '/xaa+y'], 'duplicated plus routing'],
			[['/ab+c', '/abb+c'], 'duplicated plus routing'],
			// + and normal
			[['/ab+c', '/abbbc'], 'duplicated plus routing'],
			// ? and +
			[['/colou?r', '/colou+r'], 'duplicated question and plus routing'],
			[['/ab?c', '/ab+c'], 'duplicated question and plus routing'],
			[['/a?', '/a+'], 'duplicated question and plus routing'],
			// percent-encoded characters are literal
			[['/%61b+', '/a+bb'], 'duplicated plus routing'],
			[['/colo%75?r', '/colou+r'], 'duplicated question and plus routing']
		] as [string[], string][]).forEach(([[a, b], message]: [string[], string]): void => {
			it(`${ a } & ${ b } : ${ message }, regardless of the registration order`, () => {
				expect(() => build([a, b])).to.throw(message);
				expect(() => build([b, a])).to.throw(message);
			});
		});

		[
			['/ab+c', '/ab+d'],
			['/ab?c', '/ab+d'],
			['/a+', '/b+'],
			['/ab+', '/a+c'],
			['/b?', '/a+']
		].forEach(([a, b]: string[]): void => {
			it(`${ a } & ${ b } : not duplicated`, () => {
				expect(() => build([a, b])).to.not.throw();
				expect(() => build([b, a])).to.not.throw();
			});
		});

		it('different levels are not compared', () => {
			expect(() => build(['/x/colou?r', '/y/colou+r', '/x/aab+', '/y/a+bb'])).to.not.throw();
		});

		it('route() : keys of one rule object and nested rules', () => {
			const routeRule: RouteRule = build(['/p/aab+']);
			const refined: RouteRule = refineRouteRule({ '/p': { 'a+bb': { GET: fncOf('/p/a+bb') } } }, undefined);

			expect(() => checkUriDuplication(routeRule, refined)).to.throw('duplicated plus routing');

			expect(() => {
				const one: RouteRule = refineRouteRule({ '/q/colou?r': { GET: fncOf('?') }, '/q': { 'colou+r': { GET: fncOf('+') } } }, undefined);

				checkUriDuplication({}, one);
			}).to.throw('duplicated question and plus routing');
		});

		it('patterns that don\'t overlap are registered together in every order, and match the same routes', () => {
			const uris: string[] = ['/ab?c', '/ab+d', '/x+y', '/xz?', '/abe'];

			const permutations = (arr: string[]): string[][] => {
				return arr.length <= 1
					? [arr]
					: arr.flatMap((one: string, i: number): string[][] => {
						return permutations([...arr.slice(0, i), ...arr.slice(i + 1)])
							.map((rest: string[]): string[] => [one, ...rest]);
					});
			};

			const requests: [string, string | undefined][] = [
				['/ac', '/ab?c'],
				['/abc', '/ab?c'],
				['/abd', '/ab+d'],
				['/abbbd', '/ab+d'],
				['/xy', '/x+y'],
				['/xxxy', '/x+y'],
				['/x', '/xz?'],
				['/xz', '/xz?'],
				['/abe', '/abe'],
				['/abbc', undefined],
				['/xzy', undefined]
			];

			const orders: string[][] = permutations(uris);

			// 5! = 120 registration orders
			expect(orders.length).to.be.eql(120);

			orders.forEach((order: string[]): void => {
				const routeRule: RouteRule = build(order);

				requests.forEach(([url, expected]: [string, string | undefined]): void => {
					const matched: string | undefined = (findRouteFunction(findRoute(routeRule, url).rule, 'GET').targetFncObj as RouteFunction | undefined)?.name;

					expect(matched, `${ url }, order : ${ order.join(', ') }`).to.be.eql(expected);
				});
			});
		});

		it('matching : at most one of ? and + routes matches, the result doesn\'t depend on the registration order', () => {
			[
				['/ab?c', '/ab+d'],
				['/ab+d', '/ab?c']
			].forEach((uris: string[]): void => {
				const routeRule: RouteRule = build(uris);

				const matched = (url: string): string | undefined => {
					return (findRouteFunction(findRoute(routeRule, url).rule, 'GET').targetFncObj as RouteFunction | undefined)?.name;
				};

				expect(matched('/ac')).to.be.eql('/ab?c');
				expect(matched('/abc')).to.be.eql('/ab?c');
				expect(matched('/abbbd')).to.be.eql('/ab+d');
				expect(matched('/abbc')).to.be.undefined;
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

		it('get() : + and + overlap throws, regardless of the registration order', async () => {
			await app.get('/aab+', (): string => 'first');

			await promiseFail(
				app.get('/a+bb', (): string => 'second')
			);

			const other: Badak = new Badak({ catchErrorLog: false });

			await other.get('/a+bb', (): string => 'first');

			await promiseFail(
				other.get('/aab+', (): string => 'second')
			);
		});

		it('route() : ? and + overlap throws', async () => {
			await app.get('/colou?r', (): string => 'question');

			await promiseFail(
				app.route({
					'/colou+r': {
						GET: (): string => 'plus'
					}
				})
			);
		});

		it('matched value is in ctx.params', async () => {
			await app.get('/ab+c', ({ params }: ParamContext): unknown => params);
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/abbbc')
				.expect(200, { 'ab+c': 'abbbc' });

			await request(app.getHttpServer())
				.get('/ac')
				.expect(404);
		});
	});
});
