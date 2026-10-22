// token automaton of a uri fragment pattern, compared by Unicode code point with decoded uri fragments
//   - literal character : 1 time
//   - 'c?' : the character just before '?' 0 or 1 time
//   - 'c+' : the character just before '+' 1 or more times
//   - '*' : wildcard, any characters 0 or more times
//   - ':id' and '*' as a whole uri fragment : one wildcard, a uri fragment is not empty so 1 or more characters
// see docs/routing-spec-5.0.0.md 3.
//
// matching and intersection use the same tokens,
// and both run in O(pattern length x string length) without backtracking or expanding strings

export interface PatternToken {
	char: string | null; // one Unicode code point, null : any character (wildcard)
	optional: boolean; // can be skipped : '?' or wildcard
	repeat: boolean; // can be repeated : '+' or wildcard
}

export const WILDCARD: Readonly<PatternToken> = Object.freeze({ char: null, optional: true, repeat: true });

export const literalTokens = (literal: string): PatternToken[] => {
	return [...literal].map((char: string): PatternToken => ({ char, optional: false, repeat: false }));
};

const accepts = (token: PatternToken, char: string): boolean => token.char === null || token.char === char;

// state p : tokens[0..p) matched the consumed characters
// a skipped optional token is never repeated : only a wildcard is both optional and repeat,
// and repeating a skipped wildcard is the same as consuming it

// states reachable without consuming a character (skip optional tokens)
const closeOverOptional = (reachable: Uint8Array, tokens: PatternToken[]): void => {
	for (let p: number = 0; p < tokens.length; p++) {
		if (reachable[p] === 1 && tokens[p].optional) {
			reachable[p + 1] = 1;
		}
	}
};

// moves consuming one character from state p : [token that consumes it, next state]
const moves = (tokens: PatternToken[], p: number): [token: PatternToken, next: number][] => {
	const result: [PatternToken, number][] = [];

	if (p < tokens.length) {
		result.push([tokens[p], p + 1]);
	}

	// repeat the token consumed just before
	if (p > 0 && tokens[p - 1].repeat) {
		result.push([tokens[p - 1], p]);
	}

	return result;
};

// whole uri fragment should match
// two state arrays are reused for every character, no allocation per character
export const matchPatternTokens = (tokens: PatternToken[], uriFrag: string): boolean => {
	let reachable: Uint8Array = new Uint8Array(tokens.length + 1);
	let next: Uint8Array = new Uint8Array(tokens.length + 1);

	reachable[0] = 1;
	closeOverOptional(reachable, tokens);

	for (const char of uriFrag) {
		next.fill(0);

		let anyReachable: boolean = false;

		for (let p: number = 0; p <= tokens.length; p++) {
			if (reachable[p] !== 1) {
				continue;
			}

			// consume tokens[p]
			if (p < tokens.length && accepts(tokens[p], char)) {
				next[p + 1] = 1;
				anyReachable = true;
			}

			// repeat the token consumed just before
			if (p > 0 && tokens[p - 1].repeat && accepts(tokens[p - 1], char)) {
				next[p] = 1;
				anyReachable = true;
			}
		}

		if (!anyReachable) {
			return false;
		}

		closeOverOptional(next, tokens);
		[reachable, next] = [next, reachable];
	}

	return reachable[tokens.length] === 1;
};

// true if there is a non-empty string matched by both token sequences
// uri fragments are not empty, so the empty string is not a conflict (e.g. 'a?' and 'b?')
export const patternTokensIntersect = (a: PatternToken[], b: PatternToken[]): boolean => {
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

		if (i === a.length && j === b.length && consumed === 1) {
			return true;
		}

		// skip an optional token of a or b
		if (i < a.length && a[i].optional) {
			stack.push([i + 1, j, consumed]);
		}

		if (j < b.length && b[j].optional) {
			stack.push([i, j + 1, consumed]);
		}

		// consume the same character in both : equal characters, or a wildcard on either side
		for (const [tokenA, nextI] of moves(a, i)) {
			for (const [tokenB, nextJ] of moves(b, j)) {
				if (tokenA.char === null || tokenB.char === null || tokenA.char === tokenB.char) {
					stack.push([nextI, nextJ, 1]);
				}
			}
		}
	}

	return false;
};
