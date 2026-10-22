// '?' routing pattern : '?' makes the character just before it optional, e.g. 'colou?r' matches 'color' and 'colour'
// other characters are literal, regular expression meta characters (e.g. '.', '(', ')') are not special
// percent-encoded characters are decoded and literal, e.g. '%3F' is a literal '?', '%ED%95%9C?' makes '한' optional
// characters are compared by Unicode code point, with decoded request uri fragments
//
// matching and duplication check use the same token sequence (see fragment-pattern.ts),
// and both run in O(pattern length x string length) without expanding all strings of a pattern (2^n for n '?')

import { matchPatternTokens, PatternToken, patternTokensIntersect } from './fragment-pattern.js';
import { RawPart, splitRouteKey } from './route-segment.js';


export type QuestionToken = Omit<PatternToken, 'repeat'>;

// parsed patterns, route keys are registered once and used for every request
const tokenCache: Map<string, QuestionToken[]> = new Map();

// a uri fragment with '?' is a question pattern, except colon routing (e.g. ':id?' is a colon route param)
export const isQuestionPattern = (uriFrag: string): boolean => {
	return uriFrag.includes('?') && !uriFrag.startsWith(':');
};

// throws if the pattern is invalid
//  - '?' at the beginning : nothing to be optional
//  - '??' : '?' can't be optional
//  - '?' with '+' or '*' in the same uri fragment : can't be interpreted in one way
export const parseQuestionPattern = (pattern: string): QuestionToken[] => {
	const cached: QuestionToken[] | undefined = tokenCache.get(pattern);

	if (cached !== undefined) {
		return cached;
	}

	if (pattern.includes('+') || pattern.includes('*')) {
		throw new Error(`invalid question route, '?' can't be used with '+' or '*' : ${ pattern }`);
	}

	const tokens: QuestionToken[] = [];

	// throws for malformed percent-encoding
	splitRouteKey(pattern, '?').forEach((part: RawPart): void => {
		if ('syntax' in part) {
			const last: QuestionToken | undefined = tokens[tokens.length - 1];

			if (last === undefined || last.optional) {
				throw new Error(`invalid question route : ${ pattern }`);
			}

			last.optional = true;
		}
		else {
			tokens.push({ char: part.literal, optional: false });
		}
	});

	tokenCache.set(pattern, tokens);

	return tokens;
};

// whole uri fragment should match
export const matchQuestionPattern = (pattern: string, uriFrag: string): boolean => {
	return matchPatternTokens(parseQuestionPattern(pattern), uriFrag);
};

// true if there is a non-empty string matched by both patterns
// uri fragments are not empty, so the empty string is not a conflict (e.g. 'a?' and 'b?')
export const questionPatternsIntersect = (patternA: string, patternB: string): boolean => {
	return patternTokensIntersect(parseQuestionPattern(patternA), parseQuestionPattern(patternB));
};
