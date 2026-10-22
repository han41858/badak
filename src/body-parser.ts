import { IncomingMessage } from 'node:http';

import { TypedObject } from './interfaces.js';
import { CONTENT_TYPE, HEADER_KEY } from './constants.js';
import { HttpError } from './http-error.js';


// options to convert string params, same as BadakOption
export interface ParamConvertOption {
	parseNumber: boolean;
	parseDate: boolean;
}

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

// convert string by parseDate & parseNumber options
// a string can't be both date and number format, so apply one of them
const convertStr = (value: string, option: ParamConvertOption): unknown => {
	if (option.parseDate) {
		const dateConverted: string | Date = convertDateStr(value);

		if (dateConverted instanceof Date) {
			return dateConverted;
		}
	}

	if (option.parseNumber) {
		return convertNumberStr(value);
	}

	return value;
};

// objects made by JSON.parse(), querystring and the form parsers, converted recursively
// other objects (e.g. Buffer of a multipart file) are kept as they are
const isPlainContainer = (value: object): boolean => {
	if (Array.isArray(value)) {
		return true;
	}

	const prototype: unknown = Object.getPrototypeOf(value);

	return prototype === Object.prototype || prototype === null;
};

// parameter can be object of string because request has string
// only work for string param
export const convertParam = (param: TypedObject<unknown>, option: ParamConvertOption): TypedObject<unknown> => {
	if (!option.parseNumber && !option.parseDate) {
		// nothing to convert
		return param;
	}

	if (!isPlainContainer(param)) {
		return param;
	}

	if (Array.isArray(param)) {
		const paramAsArray: unknown[] = param as unknown[];

		paramAsArray.forEach((value: unknown, i: number, arr: unknown[]): void => {
			if (value !== null && typeof value === 'object') {
				// call recursively
				arr[i] = convertParam(value as TypedObject<unknown>, option);
			}
			else if (typeof value === 'string') {
				arr[i] = convertStr(value, option);
			}
		});
	}
	else {
		for (const [key, value] of Object.entries(param)) {
			if (value !== null && typeof value === 'object') {
				// call recursively
				param[key] = convertParam(value as TypedObject<unknown>, option);
			}
			else if (typeof value === 'string') {
				param[key] = convertStr(value, option);
			}
		}
	}

	return param;
};

// charset of 'text/*' : UTF-8 if not specified, a badak policy (docs : README, request body)
// 'utf-8' and 'utf8' (case-insensitive, quoted or not), other charsets are not decoded
const isUtf8Charset = (contentTypeHeader: string): boolean => {
	const charset: string | undefined = getHeaderParam(contentTypeHeader, 'charset');

	return charset === undefined || ['utf-8', 'utf8'].includes(charset.trim().toLowerCase());
};

// strict UTF-8 decoding, malformed UTF-8 is client's fault (400), not replaced with U+FFFD
const decodeUtf8 = (buffer: Buffer): string => {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
	}
	catch (e: unknown) {
		throw new HttpError(400, { cause: e });
	}
};

const mediaTypeOf = (contentTypeHeader: string): string => {
	return contentTypeHeader.split(';')[0].trim().toLowerCase();
};

// text decoded as UTF-8 if the charset is UTF-8 or not specified, otherwise the original bytes
const textOrBuffer = (buffer: Buffer, contentTypeHeader: string): string | Buffer => {
	return isUtf8Charset(contentTypeHeader)
		? decodeUtf8(buffer)
		: buffer;
};

// parse request body by content-type (media type is case-insensitive, RFC 9110)
// - application/json, application/x-www-form-urlencoded, multipart/form-data : parsed, parseNumber & parseDate are applied
// - text/* : string (UTF-8), or Buffer for other charsets
// - other types, or no content-type : Buffer, the original bytes
// - empty body : undefined
// throws HttpError(400) on malformed body, caller should handle it
export const parseBody = (req: IncomingMessage, bodyBuffer: Buffer, option: ParamConvertOption): unknown => {
	if (bodyBuffer.byteLength === 0) {
		return undefined;
	}

	const contentTypeInHeader: string | undefined = req.headers[HEADER_KEY.CONTENT_TYPE];

	if (!contentTypeInHeader) {
		return bodyBuffer;
	}

	const contentType: string = mediaTypeOf(contentTypeInHeader);

	let param: TypedObject<unknown> | undefined;

	switch (contentType) {
		case 'multipart/form-data': {
			const boundary: string | undefined = getMultipartBoundary(contentTypeInHeader);

			if (boundary === undefined) {
				// boundary is mandatory for multipart/form-data
				throw new HttpError(400);
			}

			parseMultipart(bodyBuffer, boundary).forEach((part: MultipartPart): void => {
				let value: string | Buffer;

				if (part.filename === undefined) {
					// normal field
					value = part.data.toString();
				}
				else {
					// file, text/plain is default by RFC 7578
					// text/plain : string (UTF-8), or Buffer for other charsets, other files : Buffer
					const fileContentType: string = part.contentType ?? CONTENT_TYPE.TEXT_PLAIN;

					value = mediaTypeOf(fileContentType) === CONTENT_TYPE.TEXT_PLAIN
						? textOrBuffer(part.data, fileContentType)
						: part.data;
				}

				if (!param) {
					param = {} as TypedObject<unknown>;
				}

				if (part.name.endsWith('[]')) {
					// array
					const arrayName: string = part.name.replace(/\[]$/g, '');

					if (param[arrayName]) {
						(param[arrayName] as Array<unknown>).push(value);
					}
					else {
						param[arrayName] = [value];
					}
				}
				else {
					param[part.name] = value;
				}
			});
			break;
		}

		case CONTENT_TYPE.APPLICATION_JSON:
			try {
				param = JSON.parse(bodyBuffer.toString());
			}
			catch (e: unknown) {
				// malformed JSON is client's fault
				throw new HttpError(400, { cause: e });
			}
			break;

		case CONTENT_TYPE.APPLICATION_WWW_FORM_URLENCODED:
			// URLSearchParams decodes '+' and percent-encoding
			new URLSearchParams(bodyBuffer.toString())
				.forEach((value: string, key: string): void => {
					if (!param) {
						param = {} as TypedObject<unknown>;
					}

					if (key.endsWith('[]')) {
						// array
						const arrayName: string = key.replace(/\[]$/g, '');

						if (param[arrayName] !== undefined) {
							(param[arrayName] as Array<unknown>).push(value);
						}
						else {
							param[arrayName] = [value];
						}
					}
					else {
						param[key] = value;
					}
				});
			break;

		default:
			// not parsed, parseNumber & parseDate are not applied
			return contentType.startsWith('text/')
				? textOrBuffer(bodyBuffer, contentTypeInHeader)
				: bodyBuffer;
	}

	if (param) {
		param = convertParam(param, option);
	}

	return param;
};

// the client closed the connection before the whole request body was received
// not a server error : badak doesn't log it, respond, or pass it to Node.js (not exported)
export class ClientAbortError extends Error {
	constructor (cause?: unknown) {
		super('the client closed the connection while sending the request body', { cause });

		this.name = 'ClientAbortError';
	}
}

// receive request body up to bodyLimit, rejects with HttpError(413) if exceeded
export const receiveBody = (req: IncomingMessage, bodyLimit: number): Promise<Buffer> => {
	return new Promise<Buffer>((resolve, reject): undefined => {
		// the body is read by a middleware function already, 'end' event is not emitted again
		if (req.readableEnded) {
			reject(new Error('request body is read before badak parses it, don\'t read it in before() or auth()'));
			return;
		}

		// the connection is closed already (e.g. while async auth() runs), 'error' and 'end' are not emitted again
		if (req.destroyed) {
			reject(new ClientAbortError());
			return;
		}

		// reject before receiving body if declared size is over the limit
		const contentLength: number = Number(req.headers['content-length']);

		if (contentLength > bodyLimit) {
			// discard the body to keep the connection (keep-alive) usable
			req.resume();

			reject(new HttpError(413));
			return;
		}

		const bodyBufferPool: Uint8Array[] = [];
		let receivedSize: number = 0;
		let limitExceeded: boolean = false;

		req.on('data', (stream: Uint8Array): void => {
			if (limitExceeded) {
				// discard rest of the body to keep the connection (keep-alive) usable
				return;
			}

			receivedSize += stream.byteLength;

			// for chunked request without content-length, or wrong content-length
			if (receivedSize > bodyLimit) {
				limitExceeded = true;
				bodyBufferPool.length = 0;

				reject(new HttpError(413));
				return;
			}

			bodyBufferPool.push(stream);
		});

		req.on('error', (err: Error): void => {
			// Node.js destroys the request with ECONNRESET ('aborted') when the client closes the connection
			reject(
				req.destroyed && (err as { code?: unknown }).code === 'ECONNRESET'
					? new ClientAbortError(err)
					: err
			);
		});

		// closed without 'end' and without 'error', not to wait forever
		req.on('close', (): void => {
			if (!req.readableEnded) {
				reject(new ClientAbortError());
			}
		});

		req.on('end', (): void => {
			if (limitExceeded) {
				return;
			}

			resolve(Buffer.concat(bodyBufferPool));
		});
	});
};

// receive & parse request body, for POST, PUT, PATCH
// not support array of objects : 'multipart/form-data', 'application/x-www-form-urlencoded'
export const parseRequestBody = async (
	req: IncomingMessage,
	bodyLimit: number,
	option: ParamConvertOption
): Promise<unknown> => {
	const bodyBuffer: Buffer = await receiveBody(req, bodyLimit);

	// throws on malformed body
	return parseBody(req, bodyBuffer, option);
};


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
