// tokenization of request paths, and interpretation of route keys (uri fragments of routing paths)
//
// request path : split by real '/' first, then each uri fragment is decoded separately,
//   so '%2F' is a '/' character in a uri fragment, not a path separator
//   e.g. '/files/a%2Fb' -> ['/', 'files', 'a/b'], '/files/a/b' -> ['/', 'files', 'a', 'b']
//
// route key : the route tree keeps route keys as they are registered (original representation),
//   and they are interpreted here for matching and duplication check
//   - percent-encoded characters are always literal, e.g. '%2A' is '*', not a wildcard
//   - unencoded ':' (at the beginning), '?', '+' and '*' are routing syntax
//   - other characters are literal, not regular expression
//   so '/한글' and '/%ED%95%9C%EA%B8%80' have the same literal '한글'

import { METHOD } from './constants.js';
import { RouteRule } from './interfaces.js';
import { decodeUriFrag } from './util.js';


// split request path and decode each uri fragment, the first element is '/' for the root
// throws HttpError(400) for malformed percent-encoding
export const tokenizeRequestPath = (path: string): string[] => {
	return [
		'/', // start from root
		...path
			.split('/')
			.filter((frag: string): boolean => frag !== '')
			.map((frag: string): string => decodeUriFrag(frag))
	];
};

export type RawPart =
	{ literal: string } // one Unicode code point
	| { syntax: string }; // one of the syntax characters

// split a route key into literal characters and syntax characters
// percent-encoded characters are decoded and always literal
// throws for malformed percent-encoding
export const splitRouteKey = (routeKey: string, syntaxChars: string): RawPart[] => {
	const parts: RawPart[] = [];
	let i: number = 0;

	while (i < routeKey.length) {
		if (routeKey[i] === '%') {
			// a run of percent-encoded bytes, decoded together for multibyte UTF-8 characters
			let end: number = i;

			while (end < routeKey.length && routeKey[end] === '%') {
				if (!/^[0-9A-Fa-f]{2}$/.test(routeKey.slice(end + 1, end + 3))) {
					throw new Error(`invalid percent-encoding in routing path : ${ routeKey }`);
				}

				end += 3;
			}

			let decoded: string;

			try {
				decoded = decodeURIComponent(routeKey.slice(i, end));
			}
			catch {
				throw new Error(`invalid percent-encoding in routing path : ${ routeKey }`);
			}

			for (const char of decoded) {
				parts.push({ literal: char });
			}

			i = end;
		}
		else {
			const char: string = String.fromCodePoint(routeKey.codePointAt(i) as number);

			parts.push(
				syntaxChars.includes(char)
					? { syntax: char }
					: { literal: char }
			);

			i += char.length;
		}
	}

	return parts;
};

// literal string of a route key without routing syntax, e.g. '%ED%95%9C%EA%B8%80' -> '한글'
export const normalizeLiteral = (routeKey: string): string => {
	return splitRouteKey(routeKey, '')
		.map((part: RawPart): string => (part as { literal: string }).literal)
		.join('');
};

const escapeRegExpChar = (char: string): string => {
	return /[\\^$.*+?()[\]{}|/]/.test(char)
		? '\\' + char
		: char;
};

export type RouteSegment =
	{ kind: 'normal', literal: string }
	| { kind: 'colon' }
	| { kind: 'question' } // see question-pattern.ts
	| { kind: 'plus', regExp: RegExp, shortest: string }
	| { kind: 'partialAsterisk', regExp: RegExp }
	| { kind: 'asterisk' }
	| { kind: 'doubleAsterisk' };

const segmentCache: Map<string, RouteSegment> = new Map();

// '+' makes the character just before it repeat 1 or more times, e.g. 'ab+c' : 'abc', 'abbc'
const compilePlus = (routeKey: string): RouteSegment => {
	if (routeKey.includes('*')) {
		throw new Error(`invalid plus route, '+' can't be used with '*' : ${ routeKey }`);
	}

	const tokens: { char: string, repeat: boolean }[] = [];

	for (const part of splitRouteKey(routeKey, '+')) {
		if ('syntax' in part) {
			const last: { char: string, repeat: boolean } | undefined = tokens[tokens.length - 1];

			if (last === undefined || last.repeat) {
				// '+' at the beginning, or '++'
				throw new Error(`invalid plus route : ${ routeKey }`);
			}

			last.repeat = true;
		}
		else {
			tokens.push({ char: part.literal, repeat: false });
		}
	}

	const source: string = tokens
		.map(({ char, repeat }: { char: string, repeat: boolean }): string => escapeRegExpChar(char) + (repeat ? '+' : ''))
		.join('');

	return {
		kind: 'plus',
		regExp: new RegExp(`^(?:${ source })$`, 'u'),
		// the shortest uri fragment matched, for duplication check
		shortest: tokens.map(({ char }: { char: string }): string => char).join('')
	};
};

// '*' in a uri fragment : the character just before '*' and '*' match any characters (0 or more)
// e.g. 'ab*cd' : 'acd', 'abcd', 'abxcd', 'user1*' : 'user', 'user1', 'user11', same as 3.0.0
const compilePartialAsterisk = (routeKey: string): RouteSegment => {
	const parts: RawPart[] = splitRouteKey(routeKey, '*');
	const asteriskIndex: number = parts.findIndex((part: RawPart): boolean => 'syntax' in part);

	if (parts.filter((part: RawPart): boolean => 'syntax' in part).length > 1) {
		throw new Error(`invalid asterisk route, only one '*' in a uri fragment : ${ routeKey }`);
	}

	if (asteriskIndex === 0) {
		// no character before '*', it never matched until 3.0.0
		throw new Error(`invalid asterisk route, '*' should follow a character : ${ routeKey }`);
	}

	const toSource = (literalParts: RawPart[]): string => {
		return literalParts
			.map((part: RawPart): string => escapeRegExpChar((part as { literal: string }).literal))
			.join('');
	};

	// the character just before '*' is a part of the wildcard
	const prefix: RawPart[] = parts.slice(0, Math.max(asteriskIndex - 1, 0));
	const suffix: RawPart[] = parts.slice(asteriskIndex + 1);

	return {
		kind: 'partialAsterisk',
		regExp: new RegExp(`^${ toSource(prefix) }[\\s\\S]*${ toSource(suffix) }$`, 'u')
	};
};

// interpret a route key, throws for an invalid route key
export const compileRouteSegment = (routeKey: string): RouteSegment => {
	const cached: RouteSegment | undefined = segmentCache.get(routeKey);

	if (cached !== undefined) {
		return cached;
	}

	let segment: RouteSegment;

	if (routeKey === '**') {
		segment = { kind: 'doubleAsterisk' };
	}
	else if (routeKey === '*') {
		segment = { kind: 'asterisk' };
	}
	else if (routeKey.startsWith(':')) {
		segment = { kind: 'colon' };
	}
	else if (routeKey.includes('?')) {
		segment = { kind: 'question' };
	}
	else if (routeKey.includes('+')) {
		segment = compilePlus(routeKey);
	}
	else if (routeKey.includes('*')) {
		segment = compilePartialAsterisk(routeKey);
	}
	else {
		segment = { kind: 'normal', literal: normalizeLiteral(routeKey) };
	}

	segmentCache.set(routeKey, segment);

	return segment;
};

const isMethodKey = (key: string): boolean => Object.values(METHOD).includes(key as METHOD);

// normal route keys of a node by literal, for request matching
const normalIndexCache: WeakMap<RouteRule, Map<string, string>> = new WeakMap();

// route key of a normal route matching the decoded uri fragment
export const findNormalRouteKey = (node: RouteRule, uriFrag: string): string | undefined => {
	let index: Map<string, string> | undefined = normalIndexCache.get(node);

	if (index === undefined) {
		index = new Map();

		for (const key of Object.keys(node)) {
			if (isMethodKey(key)) {
				continue;
			}

			const segment: RouteSegment = compileRouteSegment(key);

			if (segment.kind === 'normal') {
				// different spellings of the same literal are rejected on registration
				index.set(segment.literal, key);
			}
		}

		normalIndexCache.set(node, index);
	}

	return index.get(uriFrag);
};

// called when the keys of a node are changed
export const invalidateNormalRouteIndex = (node: RouteRule): void => {
	normalIndexCache.delete(node);
};

// route key for a literal path segment, e.g. a static file name
// encoded so that the name is literal, not routing syntax, e.g. 'a+b.txt' -> 'a%2Bb.txt'
export const encodeLiteralPath = (path: string): string => {
	return path
		.split('/')
		.map((segment: string): string => encodeURIComponent(segment).replace(/\*/g, '%2A'))
		.join('/');
};
