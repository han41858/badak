// convert if number string
// if not number string, return itself
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { Stats } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';

import * as node_path from 'node:path';

import { StaticCache } from './interfaces.js';
import { CONTENT_TYPE } from './constants.js';
import { HttpError } from './http-error.js';


// only plain decimal format is converted : '5', '-1.5', '0.25'
// kept as string : leading zero ('007'), '+5', '.5', '5.', exponent ('1e3'), hex ('0x10'), spaces (' 5'), '', 'Infinity',
// and integers out of safe range ('12345678901234567890') to keep IDs as they are
const decimalNumberRegExp: RegExp = /^-?(0|[1-9]\d*)(\.\d+)?$/;

export const convertNumberStr = (param: string): string | number => {
	if (!decimalNumberRegExp.test(param)) {
		return param;
	}

	const converted: number = Number(param);

	if (Number.isInteger(converted) && !Number.isSafeInteger(converted)) {
		return param;
	}

	return converted;
};

// convert if date string
// if not date string, return itself
export const convertDateStr = (param: string): string | Date => {
	let result: string | Date = param;

	// only work for ISO 8601 date format
	const dateExps: RegExp[] = [
		/^(\d){4}-(\d){2}-(\d){2}$/, // date : '2018-06-20'
		/^(\d){4}-(\d){2}-(\d){2}T(\d){2}:(\d){2}:(\d){2}\+(\d){2}:(\d){2}$/, // combined date and time in UTC : '2018-06-20T21:22:09+00:00'
		/^(\d){4}-(\d){2}-(\d){2}T(\d){2}:(\d){2}:(\d){2}(.(\d){3})?Z$/, // combined date and time in UTC : '2018-06-20T21:22:09Z', '2018-06-20T22:00:30.296Z'
		/^(\d){8}T(\d){6}Z$/, // combined date and time in UTC : '20180620T212209Z'
		/^(\d){4}-W(\d){2}$/, // week : '2018-W25'
		/^(\d){4}-W(\d){2}-(\d)$/, // date with week number : '2018-W25-3'
		/^--(\d){2}-(\d){2}$/, // date without year : '--06-20'
		/^(\d){4}-(\d){3}$/ // ordinal dates : '2018-171'
	];


	if (dateExps.some((dateExp: RegExp): boolean => {
		return dateExp.test(param);
	})) {
		result = new Date(param);
	}

	return result;
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
			const fileData: Buffer<ArrayBufferLike> = await loadFile(fullPath);
			const mimeType: CONTENT_TYPE = getContentType(fileData, folderOrFileName);
			const fileStat: Stats = await fs.promises.stat(fullPath);

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

// RFC 9110 13.1.2 If-None-Match : weak comparison, '*' matches any
const matchEtag = (ifNoneMatch: string, etag: string): boolean => {
	if (ifNoneMatch.trim() === '*') {
		return true;
	}

	const target: string = toOpaqueTag(etag);
	const etagsInHeader: string[] = ifNoneMatch.match(/(?:W\/)?"[^"]*"/g) ?? [];

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

const loadFile = async (path: string): Promise<Buffer> => {
	return new Promise<Buffer>((resolve, reject) => {
		fs.readFile(path, (err: Error | null, data: Buffer) => {
			if (!err) {
				resolve(data);
			}
			else {
				reject(new Error(`loadFile() failed : ${ path }`));
			}
		});
	});
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


export interface MultipartPart {
	name: string;
	filename?: string;
	contentType?: string;
	data: Buffer;
}

// get boundary parameter from content-type header, quoted or not
// e.g. 'multipart/form-data; boundary=abc', 'multipart/form-data; charset=utf-8; boundary="abc"'
export const getMultipartBoundary = (contentTypeHeader: string): string | undefined => {
	const matching: RegExpMatchArray | null = contentTypeHeader.match(/;\s*boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);

	return matching !== null
		? matching[1] ?? matching[2]
		: undefined;
};

// get parameter from header value, e.g. name from 'form-data; name="a"; filename="b.txt"'
const getHeaderParam = (headerValue: string, paramName: string): string | undefined => {
	const matching: RegExpMatchArray | null = headerValue.match(
		new RegExp(`(?:^|;)\\s*${ paramName }\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i')
	);

	return matching !== null
		? matching[1] ?? matching[2]
		: undefined;
};

interface MultipartDelimiter {
	index: number; // index of '--boundary'
	isClose: boolean; // '--boundary--'
	nextIndex: number; // part body starts here (after CRLF), only for not close delimiter
}

// find delimiter line (RFC 2046) from fromIndex
// delimiter should be at the beginning of a line,
// and followed by '--' (close delimiter) or optional whitespaces (transport padding) & CRLF
// returns undefined if not found
const findMultipartDelimiter = (body: Buffer, boundary: string, fromIndex: number): MultipartDelimiter | undefined => {
	const dashBoundary: Buffer = Buffer.from('--' + boundary);

	let index: number = body.indexOf(dashBoundary, fromIndex);

	while (index >= 0) {
		const isLineStart: boolean = index === 0
			|| (index >= 2 && body[index - 2] === 0x0D && body[index - 1] === 0x0A); // CR LF

		if (isLineStart) {
			let cursor: number = index + dashBoundary.byteLength;

			if (body[cursor] === 0x2D && body[cursor + 1] === 0x2D) { // '--'
				return {
					index,
					isClose: true,
					nextIndex: -1
				};
			}

			// skip transport padding
			while (body[cursor] === 0x20 || body[cursor] === 0x09) { // SP, HTAB
				cursor++;
			}

			if (body[cursor] === 0x0D && body[cursor + 1] === 0x0A) {
				return {
					index,
					isClose: false,
					nextIndex: cursor + 2
				};
			}
		}

		// not a delimiter, just same bytes in content
		index = body.indexOf(dashBoundary, index + 1);
	}

	return undefined;
};

// parse multipart/form-data body (RFC 7578), works on Buffer to keep binary data
// preamble before the first delimiter and epilogue after the close delimiter are ignored (RFC 2046)
// throws 'Bad Request' on malformed body
export const parseMultipart = (body: Buffer, boundary: string): MultipartPart[] => {
	const CRLF: string = '\r\n';

	const parts: MultipartPart[] = [];

	let delimiter: MultipartDelimiter | undefined = findMultipartDelimiter(body, boundary, 0);

	if (delimiter === undefined) {
		throw new HttpError(400);
	}

	while (!delimiter.isClose) {
		const partStartIndex: number = delimiter.nextIndex;
		const nextDelimiter: MultipartDelimiter | undefined = findMultipartDelimiter(body, boundary, partStartIndex);

		if (nextDelimiter === undefined) {
			// no close delimiter
			throw new HttpError(400);
		}

		// CRLF before delimiter belongs to delimiter
		const part: Buffer = body.subarray(partStartIndex, Math.max(partStartIndex, nextDelimiter.index - CRLF.length));
		const headerEndIndex: number = part.indexOf(CRLF + CRLF);

		if (headerEndIndex < 0) {
			throw new HttpError(400);
		}

		const headers: Record<string, string> = {};

		part.subarray(0, headerEndIndex)
			.toString()
			.split(CRLF)
			.forEach((line: string): void => {
				const colonIndex: number = line.indexOf(':');

				if (colonIndex > 0) {
					headers[line.slice(0, colonIndex).trim().toLowerCase()] = line.slice(colonIndex + 1).trim();
				}
			});

		const disposition: string | undefined = headers['content-disposition'];
		const name: string | undefined = disposition !== undefined
			? getHeaderParam(disposition, 'name')
			: undefined;

		// part without name can't be a parameter, skip it
		if (name !== undefined) {
			parts.push({
				name,
				filename: getHeaderParam(disposition as string, 'filename'),
				contentType: headers['content-type'],
				data: part.subarray(headerEndIndex + (CRLF + CRLF).length)
			});
		}

		delimiter = nextDelimiter;
	}

	return parts;
};
