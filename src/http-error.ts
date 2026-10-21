import { OutgoingHttpHeaders, STATUS_CODES } from 'node:http';


// brand to identify HttpError across module instances (ESM & CJS builds can be loaded together)
const HTTP_ERROR_BRAND: unique symbol = Symbol.for('badak.HttpError');

export interface HttpErrorOption {
	// response body, string or object (sent as JSON), status text of the code if omitted
	body?: unknown;
	// response headers, e.g. { 'Retry-After': 120 }
	headers?: OutgoingHttpHeaders;
	// original error, for logging
	cause?: unknown;
}

/**
 * Throw in route functions or middleware functions to respond with a specific status code.
 *
 * throw new HttpError(403);
 * throw new HttpError(422, { body: { field: 'email', reason: 'invalid' } });
 * throw new HttpError(429, { headers: { 'Retry-After': 60 } });
 */
export class HttpError extends Error {
	readonly [HTTP_ERROR_BRAND] = true as const;

	readonly status: number;
	readonly body: unknown;
	readonly headers: OutgoingHttpHeaders | undefined;

	constructor (status: number, option?: HttpErrorOption) {
		if (!Number.isInteger(status) || status < 400 || status > 599) {
			throw new TypeError(`HttpError status should be an integer from 400 to 599 : ${ status }`);
		}

		super(STATUS_CODES[status] ?? `HTTP Error ${ status }`, { cause: option?.cause });

		this.name = 'HttpError';
		this.status = status;
		this.body = option?.body;
		this.headers = option?.headers;
	}
}

export const isHttpError = (value: unknown): value is HttpError => {
	return typeof value === 'object'
		&& value !== null
		&& (value as Partial<Record<typeof HTTP_ERROR_BRAND, boolean>>)[HTTP_ERROR_BRAND] === true;
};
