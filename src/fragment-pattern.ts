// character patterns of '?' and '+' routing, compared by Unicode code point with decoded uri fragments
//   - '?' makes the character just before it optional (0 or 1), e.g. 'colou?r' : 'color', 'colour'
//   - '+' makes the character just before it repeat (1 or more), e.g. 'ab+c' : 'abc', 'abbc'
//   - other characters are literal
//
// matching and duplication check use the same token sequence,
// and both run in O(pattern length x string length) without backtracking or expanding strings

export interface PatternToken {
	char: string; // one Unicode code point
	optional: boolean; // '?' : 0 or 1
	repeat?: boolean; // '+' : 1 or more
}

// state p : tokens[0..p) matched the consumed characters
// a token is either optional or repeat, an optional token is not repeated and a repeat token is not skipped

// states reachable without consuming a character (skip optional tokens)
const closeOverOptional = (reachable: boolean[], tokens: PatternToken[]): void => {
	for (let p: number = 0; p < tokens.length; p++) {
		if (reachable[p] && tokens[p].optional) {
			reachable[p + 1] = true;
		}
	}
};

// next states consuming one character from state p
const nextStates = (tokens: PatternToken[], p: number, char: string): number[] => {
	const states: number[] = [];

	if (p < tokens.length && tokens[p].char === char) {
		states.push(p + 1);
	}

	// repeat the token consumed just before
	if (p > 0 && tokens[p - 1].repeat === true && tokens[p - 1].char === char) {
		states.push(p);
	}

	return states;
};

// characters that can be consumed from state p, with the next state
const moves = (tokens: PatternToken[], p: number): [char: string, next: number][] => {
	const result: [string, number][] = [];

	if (p < tokens.length) {
		result.push([tokens[p].char, p + 1]);
	}

	if (p > 0 && tokens[p - 1].repeat === true) {
		result.push([tokens[p - 1].char, p]);
	}

	return result;
};

// whole uri fragment should match
export const matchPatternTokens = (tokens: PatternToken[], uriFrag: string): boolean => {
	let reachable: boolean[] = new Array<boolean>(tokens.length + 1).fill(false);
	reachable[0] = true;
	closeOverOptional(reachable, tokens);

	for (const char of uriFrag) {
		const next: boolean[] = new Array<boolean>(tokens.length + 1).fill(false);
		let anyReachable: boolean = false;

		for (let p: number = 0; p <= tokens.length; p++) {
			if (reachable[p]) {
				for (const state of nextStates(tokens, p, char)) {
					next[state] = true;
					anyReachable = true;
				}
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

		// consume the same character in both
		for (const [charA, nextI] of moves(a, i)) {
			for (const [charB, nextJ] of moves(b, j)) {
				if (charA === charB) {
					stack.push([nextI, nextJ, 1]);
				}
			}
		}
	}

	return false;
};
