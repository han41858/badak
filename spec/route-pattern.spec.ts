import { expect } from 'chai';

import { matchPatternTokens, PatternToken, patternTokensIntersect } from '../src/fragment-pattern';
import { canonicalRouteKey, compileRouteSegment, RouteSegment, segmentTokens, splitRouteKey } from '../src/route-segment';


// uri fragment patterns : docs/routing-spec-5.0.0.md 2. and 3.
describe('uri fragment pattern (5.0.0)', () => {
	const tokensOf = (routeKey: string): PatternToken[] => segmentTokens(compileRouteSegment(routeKey));

	const matches = (routeKey: string, uriFrag: string): boolean => matchPatternTokens(tokensOf(routeKey), uriFrag);

	const intersect = (a: string, b: string): boolean => patternTokensIntersect(tokensOf(a), tokensOf(b));

	describe('2.1 meaning of the syntax', () => {
		([
			['users', ['users'], ['user', 'userss']],
			[':id', ['7', 'me', 'a.b'], []],
			['*', ['a.png', 'x'], []],
			['ab?cd', ['acd', 'abcd'], ['abbcd', 'axcd']],
			['ab+cd', ['abcd', 'abbcd', 'abbbbcd'], ['acd', 'axcd']],
			['ab*cd', ['abcd', 'abbcd', 'abXYZcd', 'abcdcd'], ['acd', 'aXcd', 'abc', 'abcdx']],
			['ab*', ['ab', 'abc', 'abXYZ'], ['a', 'xab']],
			['*.png', ['a.png', '.png', 'x.y.png'], ['a.jpg', 'png']],
			['user1*', ['user1', 'user11', 'user1x'], ['user', 'use', 'xuser1']],
			['a*b*c', ['abc', 'aXbYc', 'abbc'], ['ab', 'acb']],
			['*abc', ['abc', 'xabc'], ['ab', 'abcx']],
			['ab?c+d', ['acd', 'abccd'], ['abd', 'abbcd']],
			['ab?c*', ['ac', 'abc', 'abcX'], ['ab', 'abbc']],
			['한+글*', ['한글', '한한글자'], ['글']],
			// percent-encoded characters are literal
			['a%3Fb', ['a?b'], ['ab', 'b']],
			['a%2Bb', ['a+b'], ['ab', 'aab']],
			['a%2Ab', ['a*b'], ['ab', 'aXb']],
			['a*%2A', ['a*', 'aX*'], ['a', 'aX']],
			['%2A%2A', ['**'], ['a', '*']]
		] as [string, string[], string[]][]).forEach(([routeKey, matched, notMatched]: [string, string[], string[]]): void => {
			it(`${ routeKey } : ${ matched.join(', ') } / not ${ notMatched.join(', ') || '-' }`, () => {
				matched.forEach((uriFrag: string): void => {
					expect(matches(routeKey, uriFrag), uriFrag).to.be.true;
				});

				notMatched.forEach((uriFrag: string): void => {
					expect(matches(routeKey, uriFrag), uriFrag).to.be.false;
				});
			});
		});

		it('** is a fallback, not a pattern of one uri fragment', () => {
			expect(compileRouteSegment('**').kind).to.be.eql('doubleAsterisk');
		});

		it(':id? is a colon route, the param name is id?', () => {
			const segment: RouteSegment = compileRouteSegment(':id?');

			expect(segment).to.be.eql({ kind: 'colon', name: 'id?' });
		});
	});

	describe('2.2 combination rules', () => {
		['ab?c+d', 'a*b*c', 'ab?c*', '*abc', 'a*%2A', '%2A*b', '*', ':id'].forEach((routeKey: string): void => {
			it(`${ routeKey } : allowed`, () => {
				expect(() => compileRouteSegment(routeKey)).to.not.throw();
			});
		});

		[
			'?abc', '+abc',
			'ab??', 'ab++', 'ab?+', 'ab+?',
			'ab?*', 'ab+*', 'ab*?', 'ab*+',
			'a**', '**b', 'a**b', '***', 'a***b',
			'ab:id', '?', '+'
		].forEach((routeKey: string): void => {
			it(`${ routeKey } : invalid route`, () => {
				expect(() => compileRouteSegment(routeKey)).to.throw(`invalid route '${ routeKey }'`);
			});
		});

		it('%2A%2A is a normal uri fragment, not a fallback', () => {
			expect(compileRouteSegment('%2A%2A')).to.be.eql({ kind: 'normal', literal: '**' });
		});
	});

	describe('2.3 parsing and normalization', () => {
		([
			['a%3Fb?', [{ literal: 'a' }, { literal: '?' }, { literal: 'b' }, { syntax: '?' }]],
			['%2B+', [{ literal: '+' }, { syntax: '+' }]],
			['a*%2A', [{ literal: 'a' }, { syntax: '*' }, { literal: '*' }]],
			['%ED%95%9C*', [{ literal: '한' }, { syntax: '*' }]]
		] as [string, unknown[]][]).forEach(([routeKey, parts]: [string, unknown[]]): void => {
			it(`${ routeKey } : syntax and literal are kept after decoding`, () => {
				expect(splitRouteKey(routeKey, '?+*')).to.be.eql(parts);
			});
		});

		([
			['ab%2Acd', 'ab%2Acd'],
			['ab*cd', 'ab*cd'],
			['%ED%95%9C%EA%B8%80', '한글'],
			['col%6Fu?r', 'colou?r'],
			['a%2ab', 'a%2Ab'],
			['%3Aid', '%3Aid'],
			[':%69d', ':id'],
			['a%20b', 'a%20b'],
			['**', '**'],
			['*', '*']
		] as [string, string][]).forEach(([routeKey, canonical]: [string, string]): void => {
			it(`canonical : ${ routeKey } -> ${ canonical }`, () => {
				expect(canonicalRouteKey(routeKey)).to.be.eql(canonical);
			});
		});

		it('ab%2Acd and ab*cd are different keys, and their patterns intersect', () => {
			expect(canonicalRouteKey('ab%2Acd')).to.not.be.eql(canonicalRouteKey('ab*cd'));
			expect(intersect('ab%2Acd', 'ab*cd')).to.be.true;
		});

		it('canonical keys keep the parts : random patterns with encoded and syntax characters (round trip)', () => {
			// deterministic pseudo random
			let seed: number = 9;

			const random = (n: number): number => {
				seed = (seed * 1103515245 + 12345) % 2147483648;
				return seed % n;
			};

			// literal characters in raw or encoded spellings, syntax characters after a literal
			const literals: string[][] = [['a', '%61'], ['한', '%ED%95%9C'], ['?', '%3F'], ['*', '%2A'], ['+', '%2B'], [':', '%3A'], ['%', '%25'], [' ', '%20']];

			for (let n: number = 0; n < 500; n++) {
				const length: number = 1 + random(5);
				let spellingA: string = '';
				let spellingB: string = '';

				for (let i: number = 0; i < length; i++) {
					const [raw, encoded] = literals[random(literals.length)];
					// raw '?', '*', '+', ':', '%', ' ' are syntax or invalid, use the encoded spelling for them
					const safeRaw: string = /^[a한]$/.test(raw) ? raw : encoded;

					spellingA += random(2) === 0 ? safeRaw : encoded;
					spellingB += random(2) === 0 ? safeRaw : encoded;

					if (random(3) === 0) {
						const syntax: string = '?+*'[random(3)];

						spellingA += syntax;
						spellingB += syntax;
					}
				}

				const canonical: string = canonicalRouteKey(spellingA);

				// the same parts in different spellings : the same key
				expect(canonicalRouteKey(spellingB), `${ spellingA } & ${ spellingB }`).to.be.eql(canonical);

				// round trip : the canonical key has the same parts and the same canonical key
				expect(splitRouteKey(canonical, '?+*'), spellingA).to.be.eql(splitRouteKey(spellingA, '?+*'));
				expect(canonicalRouteKey(canonical)).to.be.eql(canonical);
			}
		});

		it('malformed percent-encoding throws', () => {
			['%ZZ', 'a%E0%A4', 'ab*%2'].forEach((routeKey: string): void => {
				expect(() => compileRouteSegment(routeKey), routeKey).to.throw('invalid percent-encoding');
			});
		});
	});

	describe('3. intersection', () => {
		([
			['abc', 'ab+c', true],
			['abc', 'ab?c', true],
			['abc', 'ab*', true],
			['ab*cd', 'abXcd', true],
			['ab*cd', 'acd', false],
			['a*', '*b', true],
			['a*', 'b*', false],
			['*.png', '*.jpg', false],
			['*', ':id', true],
			[':id', 'b+', true],
			['aab+', 'a+bb', true],
			['ab?c', 'ab+d', false],
			['a*b', 'a*c', false],
			['*a*', '*b*', true],
			['a?', 'b?', false],
			['%2A', '*', true],
			['%2A', 'a', false]
		] as [string, string, boolean][]).forEach(([a, b, expected]: [string, string, boolean]): void => {
			it(`${ a } & ${ b } -> ${ expected }`, () => {
				expect(intersect(a, b)).to.be.eql(expected);
				expect(intersect(b, a)).to.be.eql(expected);
			});
		});
	});

	describe('3. same result as a regular expression oracle, random patterns', () => {
		// deterministic pseudo random
		let seed: number = 5;

		const random = (n: number): number => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % n;
		};

		// up to 4 characters of 'a' and 'b', each can be followed by '?', '+' or '*', a wildcard can be first
		const randomPattern = (): string => {
			let pattern: string = random(4) === 0 ? '*' : '';
			const length: number = 1 + random(4);

			for (let i: number = 0; i < length; i++) {
				pattern += 'ab'[random(2)];

				const syntax: number = random(6);

				if (syntax < 3) {
					pattern += '?+*'[syntax];
				}
			}

			return pattern;
		};

		// '?', '+' : quantifiers of the character before, '*' : any characters
		const toRegExp = (pattern: string): RegExp => new RegExp(`^(?:${ pattern.replace(/\*/g, '[ab]*') })$`);

		const allStrings = (maxLength: number): string[] => {
			const results: string[] = [];
			let current: string[] = [''];

			for (let length: number = 1; length <= maxLength; length++) {
				current = current.flatMap((one: string): string[] => [one + 'a', one + 'b']);
				results.push(...current);
			}

			return results;
		};

		it('matching : 2000 random cases', () => {
			const uriFrags: string[] = allStrings(6);

			for (let n: number = 0; n < 2000; n++) {
				const pattern: string = randomPattern();
				const uriFrag: string = uriFrags[random(uriFrags.length)];

				expect(matches(pattern, uriFrag), `${ pattern } : ${ uriFrag }`).to.be.eql(toRegExp(pattern).test(uriFrag));
			}
		});

		// common strings of patterns with up to 4 literal characters each are searched up to 8 characters
		// a pair with a longer shortest common string would fail as a false positive, not pass silently
		it('intersection : 1000 random pairs', () => {
			const strings: string[] = allStrings(8);

			for (let n: number = 0; n < 1000; n++) {
				const a: string = randomPattern();
				const b: string = randomPattern();
				const regExpA: RegExp = toRegExp(a);
				const regExpB: RegExp = toRegExp(b);

				const bruteForce: boolean = strings.some((one: string): boolean => regExpA.test(one) && regExpB.test(one));

				expect(intersect(a, b), `${ a } & ${ b }`).to.be.eql(bruteForce);
			}
		});

		it('linear : long patterns and uri fragments', () => {
			const start: number = Date.now();

			expect(matches('a+'.repeat(30) + 'b', 'a'.repeat(5000) + 'b')).to.be.true;
			expect(matches('a*'.repeat(30) + 'b', 'a'.repeat(5000) + 'c')).to.be.false;
			expect(intersect('a*'.repeat(300) + 'b', 'a+'.repeat(299) + 'c')).to.be.false;
			expect(intersect('a?'.repeat(300) + 'b', '*b')).to.be.true;

			// a regular expression backtracks for 'a*a*a*...b' and 'aaa...c'
			expect(Date.now() - start).to.be.below(1000);
		});
	});
});
