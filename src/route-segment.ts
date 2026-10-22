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
import { literalTokens, PatternToken, WILDCARD } from './fragment-pattern.js';


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

export type RouteSegment =
	{ kind: 'normal', literal: string } // literal characters only, compared by the decoded literal
	| { kind: 'colon', name: string } // ':id', one wildcard
	| { kind: 'pattern', tokens: PatternToken[] } // '?', '+' or '*' (including '*' as a whole uri fragment)
	| { kind: 'doubleAsterisk' }; // '**', the rest of the path (fallback)

const segmentCache: Map<string, RouteSegment> = new Map();

const COLON_TOKENS: PatternToken[] = [WILDCARD];

// tokens of a uri fragment pattern, for matching and intersection (see fragment-pattern.ts)
// '**' has no tokens, it is not a pattern of one uri fragment
export const segmentTokens = (segment: RouteSegment): PatternToken[] => {
	switch (segment.kind) {
		case 'normal':
			return literalTokens(segment.literal);

		case 'colon':
			return COLON_TOKENS;

		case 'pattern':
			return segment.tokens;

		case 'doubleAsterisk':
			throw new Error('\'**\' is not a pattern of one uri fragment');
	}
};

const invalidRoute = (routeKey: string, reason: string): Error => {
	return new Error(`invalid route '${ routeKey }' : ${ reason }`);
};

// parse a uri fragment pattern from the parts of the original route key (docs/routing-spec-5.0.0.md 2.)
// syntax characters are unencoded '?', '+' and '*', percent-encoded characters are always literal
const compilePattern = (routeKey: string, parts: RawPart[]): RouteSegment => {
	const tokens: PatternToken[] = [];

	parts.forEach((part: RawPart, i: number): void => {
		if (!('syntax' in part)) {
			tokens.push({ char: part.literal, optional: false, repeat: false });
			return;
		}

		if (i > 0 && 'syntax' in parts[i - 1]) {
			// '??', '++', '?+', '?*', '*?', '**' in a uri fragment, ...
			throw invalidRoute(routeKey, 'routing syntax characters can\'t be adjacent, \'**\' is allowed only as a whole uri fragment');
		}

		if (part.syntax === '*') {
			tokens.push({ ...WILDCARD });
			return;
		}

		const last: PatternToken | undefined = tokens[tokens.length - 1];

		if (last === undefined) {
			throw invalidRoute(routeKey, `'${ part.syntax }' should follow a character`);
		}

		if (part.syntax === '?') {
			last.optional = true;
		}
		else {
			last.repeat = true;
		}
	});

	return { kind: 'pattern', tokens };
};

const SYNTAX_CHARS: string = '?+*';

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
	else if (routeKey.startsWith(':')) {
		// the rest is the param name, percent-encoded characters are decoded (e.g. ':%69d' -> 'id')
		// throws for malformed percent-encoding
		segment = { kind: 'colon', name: normalizeLiteral(routeKey.slice(1)) };
	}
	else {
		if (routeKey.includes(':')) {
			throw invalidRoute(routeKey, '\':\' is routing syntax only at the beginning of a uri fragment');
		}

		// throws for malformed percent-encoding
		const parts: RawPart[] = splitRouteKey(routeKey, SYNTAX_CHARS);

		segment = parts.some((part: RawPart): boolean => 'syntax' in part)
			? compilePattern(routeKey, parts)
			: { kind: 'normal', literal: parts.map((part: RawPart): string => (part as { literal: string }).literal).join('') };
	}

	segmentCache.set(routeKey, segment);

	return segment;
};

// characters kept percent-encoded in canonical route keys, so that they stay literal
// '%' : escape, '/' : separator, ':' '?' '+' '*' : routing syntax, ' ' and control characters : not allowed raw
const KEEP_ENCODED: RegExp = /[%/:?+*\s\p{Cc}]/u;

const encodeChar = (char: string): string => {
	return Array.from(new TextEncoder().encode(char))
		.map((byte: number): string => '%' + byte.toString(16).toUpperCase().padStart(2, '0'))
		.join('');
};

/**
 * canonical representation of a route key, used as the key of the route tree
 * route keys of the same meaning become the same key, so that they are merged into one node
 * e.g. '한글' and '%ED%95%9C%EA%B8%80' -> '한글', '%2a' -> '%2A', 'col%6Fu?r' -> 'colou?r', ':%69d' -> ':id'
 * routing syntax is kept, literal characters are decoded except characters in KEEP_ENCODED
 */
export const canonicalRouteKey = (routeKey: string): string => {
	if (routeKey === '**') {
		return routeKey;
	}

	if (routeKey.startsWith(':')) {
		// param name, decoded (e.g. ':%69d' -> ':id'), unencoded characters are kept as they are
		return ':' + normalizeLiteral(routeKey.slice(1));
	}

	// throws for an invalid route key
	compileRouteSegment(routeKey);

	return splitRouteKey(routeKey, SYNTAX_CHARS)
		.map((part: RawPart): string => {
			if ('syntax' in part) {
				return part.syntax;
			}

			return KEEP_ENCODED.test(part.literal)
				? encodeChar(part.literal)
				: part.literal;
		})
		.join('');
};

const isMethodKey = (key: string): boolean => Object.values(METHOD).includes(key as METHOD);

// route keys of a node for request matching : normal route keys by literal, and pattern route keys (':', '?', '+', '*')
interface RouteIndex {
	normal: Map<string, string>;
	patterns: string[];
}

const routeIndexCache: WeakMap<RouteRule, RouteIndex> = new WeakMap();

const routeIndexOf = (node: RouteRule): RouteIndex => {
	let index: RouteIndex | undefined = routeIndexCache.get(node);

	if (index === undefined) {
		index = { normal: new Map(), patterns: [] };

		for (const key of Object.keys(node)) {
			if (isMethodKey(key)) {
				continue;
			}

			const segment: RouteSegment = compileRouteSegment(key);

			if (segment.kind === 'normal') {
				// route keys are canonical, the same literal is one key
				index.normal.set(segment.literal, key);
			}
			else if (segment.kind !== 'doubleAsterisk') {
				index.patterns.push(key);
			}
		}

		routeIndexCache.set(node, index);
	}

	return index;
};

// route key of a normal route matching the decoded uri fragment
export const findNormalRouteKey = (node: RouteRule, uriFrag: string): string | undefined => {
	return routeIndexOf(node).normal.get(uriFrag);
};

// pattern route keys of a node, '**' is not included
export const patternRouteKeys = (node: RouteRule): string[] => {
	return routeIndexOf(node).patterns;
};

// called when the keys of a node are changed
export const invalidateNormalRouteIndex = (node: RouteRule): void => {
	routeIndexCache.delete(node);
};

// route key for a literal path segment, e.g. a static file name
// encoded so that the name is literal, not routing syntax, e.g. 'a+b.txt' -> 'a%2Bb.txt'
export const encodeLiteralPath = (path: string): string => {
	return path
		.split('/')
		.map((segment: string): string => encodeURIComponent(segment).replace(/\*/g, '%2A'))
		.join('/');
};
