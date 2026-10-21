// '?' routing pattern : '?' makes the character just before it optional, e.g. 'colou?r' matches 'color' and 'colour'
// other characters are literal, regular expression meta characters (e.g. '.', '(', ')') are not special
// percent-encoded characters are decoded and literal, e.g. '%3F' is a literal '?', '%ED%95%9C?' makes '한' optional
// characters are compared by Unicode code point, with decoded request uri fragments
//
// matching and duplication check use the same token sequence,
// and both run in O(pattern length x string length) without expanding all strings of a pattern (2^n for n '?')

import { RawPart, splitRouteKey } from './route-segment.js';


export interface QuestionToken {
	char: string; // one Unicode code point
	optional: boolean;
}

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

// skip optional tokens from the reachable token indexes
const closeOverOptional = (reachable: boolean[], tokens: QuestionToken[]): void => {
	for (let i: number = 0; i < tokens.length; i++) {
		if (reachable[i] && tokens[i].optional) {
			reachable[i + 1] = true;
		}
	}
};

// whole uri fragment should match
export const matchQuestionPattern = (pattern: string, uriFrag: string): boolean => {
	const tokens: QuestionToken[] = parseQuestionPattern(pattern);

	// reachable[i] : tokens[0..i) can match the consumed characters
	let reachable: boolean[] = new Array<boolean>(tokens.length + 1).fill(false);
	reachable[0] = true;
	closeOverOptional(reachable, tokens);

	for (const char of uriFrag) {
		const next: boolean[] = new Array<boolean>(tokens.length + 1).fill(false);
		let anyReachable: boolean = false;

		for (let i: number = 0; i < tokens.length; i++) {
			if (reachable[i] && tokens[i].char === char) {
				next[i + 1] = true;
				anyReachable = true;
			}
		}

		if (!anyReachable) {
			return false;
		}

		closeOverOptional(next, tokens);
		reachable = next;
	}

	return reachable[tokens.length];
};

// true if there is a non-empty string matched by both patterns
// uri fragments are not empty, so the empty string is not a conflict (e.g. 'a?' and 'b?')
export const questionPatternsIntersect = (patternA: string, patternB: string): boolean => {
	const a: QuestionToken[] = parseQuestionPattern(patternA);
	const b: QuestionToken[] = parseQuestionPattern(patternB);

	// state : (i, j, consumed) - a[0..i) and b[0..j) match the same string, consumed : the string is not empty
	const width: number = b.length + 1;
	const visited: Uint8Array = new Uint8Array((a.length + 1) * width * 2);
	const stack: [number, number, number][] = [[0, 0, 0]];

	while (stack.length > 0) {
		const [i, j, consumed] = stack.pop() as [number, number, number];
		const index: number = (i * width + j) * 2 + consumed;

		if (visited[index] === 1) {
			continue;
		}

		visited[index] = 1;

		if (i === a.length && j === b.length) {
			if (consumed === 1) {
				return true;
			}

			continue;
		}

		// skip an optional token of a or b
		if (i < a.length && a[i].optional) {
			stack.push([i + 1, j, consumed]);
		}

		if (j < b.length && b[j].optional) {
			stack.push([i, j + 1, consumed]);
		}

		// consume the same character in both
		if (i < a.length && j < b.length && a[i].char === b[j].char) {
			stack.push([i + 1, j + 1, 1]);
		}
	}

	return false;
};
