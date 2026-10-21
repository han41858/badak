import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { Stats } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';

import * as node_path from 'node:path';

import { StaticCache } from './interfaces.js';
import { CONTENT_TYPE } from './constants.js';
import { HttpError } from './http-error.js';

// moved to body-parser.ts, re-exported for existing imports
export { convertDateStr, convertNumberStr } from './body-parser.js';


// bytes, positive integer or Infinity (no limit)
// NaN or decimal is rejected, NaN disables every size comparison
export const isValidBodyLimit = (value: unknown): value is number => {
	return typeof value === 'number'
		&& value > 0
		&& (Number.isInteger(value) || value === Infinity);
};

// response is started (headersSent) or completed (writableEnded) already,
// status code & headers can't be changed
export const isResponseStarted = (res: ServerResponse): boolean => {
	return res.headersSent || res.writableEnded;
};

// decode percent-encoded uri fragment, malformed encoding is client's fault
export const decodeUriFrag = (uriFrag: string): string => {
	try {
		return decodeURIComponent(uriFrag);
	}
	catch (e: unknown) {
		throw new HttpError(400, { cause: e });
	}
};

export const checkAbsoluteUri = async (uri: string): Promise<void> => {
	if (!uri) {
		throw new Error('no uri');
	}

	if (!uri.startsWith('/')) {
		throw new Error('uri should be start with slash(/)');
	}
};

export const checkAbsolutePath = async (path: string): Promise<void> => {
	if (!path) {
		throw new Error('no path');
	}

	if (!node_path.isAbsolute(path)) {
		throw new Error('path should be absolute');
	}
};

export const isExistFile = async (path: string): Promise<boolean> => {
	return new Promise<boolean>((resolve) => {
		fs.access(path, (err) => {
			if (!err) {
				resolve(true);
			}
			else {
				resolve(false);
			}
		});
	});
};

export const isFolder = async (path: string): Promise<boolean> => {
	return new Promise<boolean>((resolve, reject) => {
		fs.stat(path, (err: Error | null, stats: Stats) => {
			if (!err) {
				resolve(stats.isDirectory());
			}
			else {
				reject(new Error(`_isFolder() failed : ${ path }`));
			}
		});
	});
};


export const loadFolder = async (uri: string, path: string): Promise<StaticCache[]> => {
	const foldersAndFiles: string[] = await new Promise<string[]>((resolve, reject) => {
		fs.readdir(path, (err: Error | null, _foldersAndFiles: string[]) => {
			if (!err) {
				resolve(_foldersAndFiles);
			}
			else {
				reject(new Error(`loadFolder() failed : ${ path }`));
			}
		});
	});

	const cache: StaticCache[] = [];

	const allFileData: StaticCache[][] = await Promise.all(foldersAndFiles.map(async (folderOrFileName: string): Promise<StaticCache[]> => {
		const uriSanitized: string = node_path
			.join(uri, folderOrFileName)
			.replace(/\\/g, '/'); // path \\ changed to /

		const fullPath: string = node_path.join(path, folderOrFileName);

		let cacheSet: StaticCache[];

		if (await isFolder(fullPath)) {
			// call recursively
			cacheSet = await loadFolder(uriSanitized, fullPath);
		}
		else {
			const { fileData, fileStat } = await loadFile(fullPath);
			const mimeType: CONTENT_TYPE = getContentType(fileData, folderOrFileName);

			cacheSet = [{
				uri: uriSanitized,
				mime: mimeType,
				fileData: fileData,
				etag: createEtag(fileData),
				lastModified: fileStat.mtime.toUTCString()
			}];
		}

		return cacheSet;
	}));

	allFileData.forEach((oneFileData) => {
		cache.push(...oneFileData);
	});

	return cache;
};

// strong ETag from file content : "<size in hex>-<sha1 in base64url>"
export const createEtag = (data: Buffer): string => {
	const hash: string = createHash('sha1')
		.update(data)
		.digest('base64url');

	return `"${ data.byteLength.toString(16) }-${ hash }"`;
};

// remove weak indicator for weak comparison
const toOpaqueTag = (etag: string): string => {
	return etag.startsWith('W/')
		? etag.slice(2)
		: etag;
};

// etagc = %x21 / %x23-7E / obs-text, header values are decoded as latin1 by Node.js
const opaqueTagCharsRegExp: RegExp = /^[\x21\x23-\x7E\x80-\xFF]*$/;

const isOws = (char: string): boolean => {
	return char === ' ' || char === '\t';
};

/**
 * parse entity-tag list of If-None-Match, returns undefined if the syntax is invalid
 *
 * RFC 9110 8.8.3 : entity-tag = [ "W/" ] DQUOTE *etagc DQUOTE
 * RFC 9110 5.6.1 : list elements are separated by comma with optional whitespace, empty elements are ignored
 * etagc includes comma, so the list can't be split by comma
 */
export const parseEtagList = (value: string): string[] | undefined => {
	const etags: string[] = [];

	let index: number = 0;
	let expectingElement: boolean = true;

	while (index < value.length) {
		const char: string = value[index];

		if (isOws(char)) {
			index++;
			continue;
		}

		if (char === ',') {
			expectingElement = true;
			index++;
			continue;
		}

		if (!expectingElement) {
			// no comma between elements, e.g. '"a" "b"', '"a"b'
			return undefined;
		}

		const start: number = index;

		// weak indicator is case-sensitive
		if (value.startsWith('W/', index)) {
			index += 2;
		}

		if (value[index] !== '"') {
			// e.g. 'invalid"abc"', 'abc', '*' in a list
			return undefined;
		}

		const end: number = value.indexOf('"', index + 1);

		if (end === -1 || !opaqueTagCharsRegExp.test(value.slice(index + 1, end))) {
			return undefined;
		}

		etags.push(value.slice(start, end + 1));

		index = end + 1;
		expectingElement = false;
	}

	return etags;
};

// RFC 9110 13.1.2 If-None-Match : weak comparison, '*' matches any
// invalid syntax doesn't match, responds the file
const matchEtag = (ifNoneMatch: string, etag: string): boolean => {
	if (ifNoneMatch.trim() === '*') {
		return true;
	}

	const etagsInHeader: string[] | undefined = parseEtagList(ifNoneMatch);

	if (etagsInHeader === undefined) {
		return false;
	}

	const target: string = toOpaqueTag(etag);

	return etagsInHeader.some((etagInHeader: string): boolean => {
		return toOpaqueTag(etagInHeader) === target;
	});
};

// RFC 9110 13.2.2 : If-None-Match takes precedence, If-Modified-Since is ignored if If-None-Match exists
export const isNotModified = (req: IncomingMessage, etag: string, lastModified: string): boolean => {
	const ifNoneMatch: string | undefined = req.headers['if-none-match'];

	if (ifNoneMatch !== undefined) {
		return matchEtag(ifNoneMatch, etag);
	}

	const ifModifiedSince: string | undefined = req.headers['if-modified-since'];

	if (ifModifiedSince !== undefined) {
		const since: number = Date.parse(ifModifiedSince);

		// invalid date is ignored
		return !Number.isNaN(since)
			&& Date.parse(lastModified) <= since;
	}

	return false;
};

// read the content and the metadata through the same file handle,
// so that they are from the same file even if the path is replaced (e.g. by rename) in the meantime
// it doesn't guarantee atomicity for the file modified while reading
const loadFile = async (path: string): Promise<{ fileData: Buffer, fileStat: Stats }> => {
	let fileHandle: fs.promises.FileHandle | undefined;

	try {
		fileHandle = await fs.promises.open(path, 'r');

		const fileStat: Stats = await fileHandle.stat();
		const fileData: Buffer = await fileHandle.readFile();

		return { fileData, fileStat };
	}
	catch (err: unknown) {
		throw new Error(`loadFile() failed : ${ path }`, { cause: err });
	}
	finally {
		await fileHandle?.close();
	}
};


// file extension (lower case, without dot) to MIME type
const extensionMap: Record<string, CONTENT_TYPE> = {
	ico: CONTENT_TYPE.IMAGE_ICO,
	gif: CONTENT_TYPE.IMAGE_GIF,
	jpg: CONTENT_TYPE.IMAGE_JPEG,
	jpeg: CONTENT_TYPE.IMAGE_JPEG,
	bmp: CONTENT_TYPE.IMAGE_BMP,
	png: CONTENT_TYPE.IMAGE_PNG,
	tif: CONTENT_TYPE.IMAGE_TIFF,
	tiff: CONTENT_TYPE.IMAGE_TIFF,
	webp: CONTENT_TYPE.IMAGE_WEBP,
	heic: CONTENT_TYPE.IMAGE_HEIC,
	svg: CONTENT_TYPE.IMAGE_SVG,
	avif: CONTENT_TYPE.IMAGE_AVIF,

	woff: CONTENT_TYPE.FONT_WOFF,
	woff2: CONTENT_TYPE.FONT_WOFF2,
	ttf: CONTENT_TYPE.FONT_TTF,
	otf: CONTENT_TYPE.FONT_OTF,

	mp3: CONTENT_TYPE.AUDIO_MPEG,
	mp4: CONTENT_TYPE.VIDEO_MP4,
	webm: CONTENT_TYPE.VIDEO_WEBM,

	pdf: CONTENT_TYPE.APPLICATION_PDF,
	css: CONTENT_TYPE.TEXT_CSS,
	htm: CONTENT_TYPE.TEXT_HTML,
	html: CONTENT_TYPE.TEXT_HTML,
	js: CONTENT_TYPE.APPLICATION_JAVASCRIPT,
	mjs: CONTENT_TYPE.APPLICATION_JAVASCRIPT,
	cjs: CONTENT_TYPE.APPLICATION_JAVASCRIPT,
	json: CONTENT_TYPE.APPLICATION_JSON,
	map: CONTENT_TYPE.APPLICATION_JSON, // source map
	webmanifest: CONTENT_TYPE.APPLICATION_MANIFEST_JSON,
	wasm: CONTENT_TYPE.APPLICATION_WASM,
	xml: CONTENT_TYPE.APPLICATION_XML,
	txt: CONTENT_TYPE.TEXT_PLAIN,
	text: CONTENT_TYPE.TEXT_PLAIN,
	csv: CONTENT_TYPE.TEXT_CSV,
	md: CONTENT_TYPE.TEXT_MARKDOWN,
	xls: CONTENT_TYPE.APPLICATION_XLS,
	xlsx: CONTENT_TYPE.APPLICATION_XLSX
};

interface Signature {
	type: CONTENT_TYPE;
	sign: number[] | RegExp; // hex numbers or regular expression
}

const signatureMap: Signature[] = [
	{ type: CONTENT_TYPE.IMAGE_ICO, sign: [0x00, 0x00, 0x01, 0x00] },
	{ type: CONTENT_TYPE.IMAGE_GIF, sign: [0x47, 0x49, 0x46, 0x38] },
	{ type: CONTENT_TYPE.IMAGE_JPEG, sign: [0xFF, 0xD8, 0xFF] },
	{ type: CONTENT_TYPE.IMAGE_BMP, sign: [0x42, 0x4D] },
	{ type: CONTENT_TYPE.IMAGE_PNG, sign: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
	{ type: CONTENT_TYPE.IMAGE_TIFF, sign: [0x49, 0x49, 0x2A, 0x00] }, // Intel
	{ type: CONTENT_TYPE.IMAGE_TIFF, sign: [0x4D, 0x4D, 0x00, 0x2A] }, // Motorola
	{ type: CONTENT_TYPE.IMAGE_WEBP, sign: /^RIFF....WEBP/ },
	{ type: CONTENT_TYPE.IMAGE_HEIC, sign: /^.{4}ftypheic/ },
	{ type: CONTENT_TYPE.IMAGE_HEIC, sign: /^.{4}ftypmif1/ },

	{ type: CONTENT_TYPE.APPLICATION_PDF, sign: [0x25, 0x50, 0x44, 0x46] }
];

export interface SerializedBody {
	body: string | Buffer;
	contentType: CONTENT_TYPE;
}

// make a value sendable by res.end()
// string : as it is (text), Buffer & Uint8Array : as it is (binary), others : JSON (Buffer in it as base64)
// returns undefined if it can't be serialized (e.g. circular reference, BigInt, function, symbol)
export const serializeBody = (value: unknown): SerializedBody | undefined => {
	if (typeof value === 'string') {
		return {
			body: value,
			contentType: CONTENT_TYPE.TEXT_PLAIN
		};
	}

	if (value instanceof Uint8Array) {
		const buffer: Buffer = Buffer.isBuffer(value)
			? value
			: Buffer.from(value.buffer, value.byteOffset, value.byteLength);

		return {
			body: buffer,
			contentType: getContentType(buffer)
		};
	}

	try {
		// Buffer in object : base64 string, without modifying the original object
		const json: string | undefined = JSON.stringify(value, function (this: Record<string, unknown>, key: string, converted: unknown): unknown {
			const original: unknown = this[key];

			return Buffer.isBuffer(original)
				? original.toString('base64')
				: converted;
		});

		return json !== undefined
			? {
				body: json,
				contentType: CONTENT_TYPE.APPLICATION_JSON
			}
			: undefined;
	}
	catch (e: unknown) {
		return undefined;
	}
};

// add charset=utf-8 to text types for Content-Type header, like Express (serve-static)
// JSON is always UTF-8 (RFC 8259) and has no charset parameter
export const toContentTypeHeader = (mime: string): string => {
	return mime.startsWith('text/') || mime === CONTENT_TYPE.APPLICATION_JAVASCRIPT
		? `${ mime }; charset=utf-8`
		: mime;
};

// MIME type by file extension, e.g. 'app.min.js' -> 'js'
export const getContentTypeByFileName = (fileName: string): CONTENT_TYPE | undefined => {
	const extension: string = node_path.extname(fileName).slice(1).toLowerCase();

	return Object.hasOwn(extensionMap, extension)
		? extensionMap[extension]
		: undefined;
};

// MIME type by magic number of binary data
const getContentTypeBySignature = (data: Buffer): CONTENT_TYPE | undefined => {
	// only head bytes are needed for signature, don't convert whole data to string
	const headStr: string = data.subarray(0, 16).toString('latin1');

	return signatureMap.find((one: Signature): boolean => {
		return one.sign instanceof RegExp
			? one.sign.test(headStr)
			: Buffer.from(one.sign).equals(data.subarray(0, one.sign.length));
	})?.type;
};

export const getContentType = (data: unknown, fileName?: string): CONTENT_TYPE => {
	let contentType: CONTENT_TYPE | undefined;

	// file extension is more reliable than a short signature (e.g. a text file starting with 'BM' is not a bitmap)
	if (fileName !== undefined) {
		contentType = getContentTypeByFileName(fileName);
	}

	if (
		contentType === undefined
		&& data !== null
		&& data !== undefined
	) {
		if (data instanceof Buffer) {
			contentType = getContentTypeBySignature(data);
		}
		else if (typeof data === 'object') {
			try {
				JSON.stringify(data);
				contentType = CONTENT_TYPE.APPLICATION_JSON;
			}
			catch (e: unknown) {
				// do nothing
			}
		}
		else if (typeof data === 'string') {
			contentType = CONTENT_TYPE.TEXT_PLAIN;
		}
	}

	if (contentType !== undefined) {
		return contentType;
	}

	// fallback
	// file of unknown extension (or without extension) can be binary, don't let browsers render it as text
	return fileName !== undefined
		? CONTENT_TYPE.APPLICATION_OCTET_STREAM
		: CONTENT_TYPE.TEXT_PLAIN;
};


export function sift<T> (arr: T[]): T[] {
	return arr.reduce((acc: T[], one: T): T[] => {
		if (!acc.includes(one)) {
			acc.push(one);
		}

		return acc;
	}, []);
}
