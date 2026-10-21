import { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

import { TypedObject } from './interfaces.js';
import { CONTENT_TYPE, HEADER_KEY } from './constants.js';
import { isHttpError } from './http-error.js';
import { isResponseStarted, SerializedBody, serializeBody, toContentTypeHeader } from './util.js';


// send Readable stream returned by route function
// catchErrorLog : log stream errors after the response headers are sent
// resolves when the response is finished or closed
// rejects only if the stream fails before sending the response headers, to respond with an error status code
export const sendStream = async (req: IncomingMessage, res: ServerResponse, stream: Readable, catchErrorLog: boolean): Promise<void> => {
	if (!res.hasHeader(HEADER_KEY.CONTENT_TYPE)) {
		res.setHeader(HEADER_KEY.CONTENT_TYPE, CONTENT_TYPE.APPLICATION_OCTET_STREAM);
	}

	// HEAD has no body, don't read the stream
	if (req.method === 'HEAD') {
		stream.destroy();
		res.end();
		return;
	}

	return new Promise<void>((resolve, reject): void => {
		let settled: boolean = false;

		const settle = (err?: unknown): void => {
			if (settled) {
				return;
			}

			settled = true;

			if (err === undefined) {
				resolve();
			}
			else {
				reject(err);
			}
		};

		stream.on('error', (err: Error): void => {
			stream.unpipe(res);

			// release resources, a stream with autoDestroy: false is not destroyed by itself
			stream.destroy();

			if (settled) {
				// the response is finished or closed already, don't touch it
				if (catchErrorLog) {
					console.error('badak stream failed after response :', err);
				}

				return;
			}

			if (res.headersSent) {
				// some data is sent already, close the connection so that the client can know the response is incomplete
				if (catchErrorLog) {
					console.error('badak stream failed while sending response :', err);
				}

				res.destroy(err);
				settle();
			}
			else {
				// respond with an error status code
				settle(err);
			}
		});

		res.on('finish', (): void => settle());

		res.on('close', (): void => {
			// client aborted, stop reading the stream
			if (!res.writableFinished) {
				stream.destroy();
			}

			settle();
		});

		stream.pipe(res);
	});
};

// called with the response body as soon as it is decided, for after() middleware functions
export type ResponseBodySetter = (responseBody: unknown) => void;

// send the value returned by route function
export const sendRouteResult = async (
	req: IncomingMessage,
	res: ServerResponse,
	responseData: unknown,
	catchErrorLog: boolean,
	setResponseBody: ResponseBodySetter
): Promise<void> => {
	let responseBody: unknown;

	if (isResponseStarted(res)) {
		// route function started (res.writeHead(), res.write()) or ended (res.end()) response by itself,
		// ignore returned value and leave ending the response to the route function (e.g. streaming)
	}
	else if (responseData instanceof Readable) {
		await sendStream(req, res, responseData, catchErrorLog);
	}
	else if (responseData !== undefined) {
		// string as text, Buffer as binary, others (object, array, number, boolean, null) as JSON
		// only undefined (no return value) responds an empty body
		const serialized: SerializedBody | undefined = serializeBody(responseData);

		if (serialized === undefined) {
			// e.g. circular reference, BigInt
			throw new Error('returned value of route function can\'t be serialized', { cause: responseData });
		}

		if (!res.getHeader(HEADER_KEY.CONTENT_TYPE)) {
			res.setHeader(HEADER_KEY.CONTENT_TYPE, toContentTypeHeader(serialized.contentType));
		}

		responseBody = serialized.body;
		setResponseBody(responseBody);

		// explicit content-length, so that HEAD has the same headers as GET
		// (Node.js sets it by itself for GET only, because HEAD has no body)
		if (
			!res.hasHeader(HEADER_KEY.CONTENT_LENGTH)
			&& (typeof responseBody === 'string' || responseBody instanceof Uint8Array)
		) {
			res.setHeader(HEADER_KEY.CONTENT_LENGTH, Buffer.byteLength(responseBody));
		}

		res.end(responseBody);
	}
	else {
		res.end();
	}
};

// send error response for the error thrown in middleware or route functions
// never throws, closes the connection if the error response can't be written
export const sendErrorResponse = (
	res: ServerResponse,
	err: Error | TypedObject<unknown>,
	catchErrorLog: boolean,
	setResponseBody: ResponseBodySetter
): void => {
	let responseBody: unknown;

	interface HttpResStatusCode {
		code: number;
		message: string;
	}

	const statusCodes: HttpResStatusCode[] = [
		{ code: 400, message: 'Bad Request' },
		{ code: 401, message: 'Unauthorized' },
		{ code: 401, message: 'Unauthenticated' },
		{ code: 403, message: 'Forbidden' },
		{ code: 404, message: 'Not Found' },
		{ code: 404, message: 'no rule' },
		{ code: 405, message: 'Method Not Allowed' },
		{ code: 406, message: 'Not Acceptable' },
		{ code: 413, message: 'Payload Too Large' }
	];

	const foundResult: HttpResStatusCode | undefined = statusCodes.find((def: HttpResStatusCode): boolean => {
		return def.message == err.message;
	});

	// writing the error response must not throw again, it would escape the request handler
	try {
		if (isResponseStarted(res)) {
			// headersSent : status code and headers can't be changed anymore
			// writableEnded : response is completed already
			// just close the response if it is not completed
			if (!res.writableEnded) {
				res.end();
			}
		}
		else if (isHttpError(err)) {
			res.statusCode = err.status;

			if (err.headers !== undefined) {
				for (const [key, value] of Object.entries(err.headers)) {
					if (value !== undefined) {
						res.setHeader(key, value);
					}
				}
			}

			// status text (e.g. 'Forbidden') if body is not specified or not serializable
			const serialized: SerializedBody = (
				err.body !== undefined && err.body !== null
					? serializeBody(err.body)
					: undefined
			) ?? {
				body: err.message,
				contentType: CONTENT_TYPE.TEXT_PLAIN
			};

			if (!res.hasHeader(HEADER_KEY.CONTENT_TYPE)) {
				res.setHeader(HEADER_KEY.CONTENT_TYPE, toContentTypeHeader(serialized.contentType));
			}

			responseBody = serialized.body;
			setResponseBody(responseBody);
			res.end(responseBody);
		}
		else if (foundResult) {
			res.statusCode = foundResult.code;
			res.end();
		}
		else {
			res.statusCode = 500; // Internal Server Error

			// don't expose internal error message to client, it is logged by catchErrorLog
			// thrown non-Error value (e.g. throw { reason }) is sent as the body if serializable
			const serialized: SerializedBody = (
				!(err instanceof Error) && err !== undefined && err !== null
					? serializeBody(err)
					: undefined
			) ?? {
				body: 'Internal Server Error',
				contentType: CONTENT_TYPE.TEXT_PLAIN
			};

			res.setHeader(HEADER_KEY.CONTENT_TYPE, toContentTypeHeader(serialized.contentType));

			responseBody = serialized.body;
			setResponseBody(responseBody);
			res.end(responseBody);
		}
	}
	catch (responseError: unknown) {
		if (catchErrorLog) {
			console.error('badak failed to write error response :', responseError);
		}

		// can't respond properly, close the connection
		res.destroy();
	}
};
