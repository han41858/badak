import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import * as node_path from 'node:path';
import * as querystring from 'node:querystring';
import { Readable } from 'node:stream';

import {
	BadakOption,
	MiddlewareFunction,
	RouteFunction,
	RouteFunctionObj,
	RouteOption,
	RouteRule,
	StaticCache,
	StaticOption,
	StaticRule,
	TypedObject
} from './interfaces.js';
import {
	CONTENT_TYPE,
	DEFAULT_BODY_LIMIT,
	DEFAULT_STATIC_CACHE_CONTROL,
	HEADER_KEY,
	MAX_TIMER_DELAY,
	METHOD
} from './constants.js';
import { HttpError, isHttpError } from './http-error.js';
import { convertParam, parseRequestBody } from './body-parser.js';
import { checkUriDuplication, findRoute, findRouteFunction, mergeRouteRule, refineRouteRule, splitUrl } from './router.js';
import {
	checkAbsolutePath,
	checkAbsoluteUri,
	isExistFile,
	isFolder,
	isNotModified,
	isResponseStarted,
	isValidBodyLimit,
	loadFolder,
	SerializedBody,
	serializeBody,
	toContentTypeHeader
} from './util.js';

const checkStaticOption = (option: unknown): void => {
	if (option === undefined) {
		return;
	}

	if (typeof option !== 'object' || option === null || Array.isArray(option)) {
		throw new Error('static option should be an object');
	}

	const unknownKeys: string[] = Object.keys(option).filter((key: string): boolean => key !== 'cacheControl');

	if (unknownKeys.length > 0) {
		throw new Error(`unknown static option : ${ unknownKeys.join(', ') }`);
	}

	const { cacheControl } = option as StaticOption;

	if (
		cacheControl !== undefined
		&& cacheControl !== false
		&& (typeof cacheControl !== 'string' || cacheControl.trim() === '' || /[\r\n]/.test(cacheControl))
	) {
		throw new Error(`invalid cacheControl : ${ String(cacheControl) }`);
	}
};

export class Badak {
	private _http: Server | undefined;

	// auth hook
	private _authFnc: MiddlewareFunction | undefined;

	// before & after hooks
	private _middlewaresBefore: MiddlewareFunction[] = [];
	private _middlewaresAfter: MiddlewareFunction[] = [];

	private _routeRule: RouteRule = {};

	private _staticRules: StaticRule[] = [];
	private _staticCache: StaticCache[] = [];

	private _spaRoot: string | undefined;

	private _config: BadakOption = {
		catchErrorLog: true,
		preventError: true,

		defaultMethod: undefined,

		parseNumber: false,
		parseDate: false,

		bodyLimit: DEFAULT_BODY_LIMIT
	};

	constructor (option?: Partial<BadakOption>) {
		if (option) {
			for (const [key, value] of Object.entries(option)) {
				// undefined means not set (Partial<BadakOption>)
				if (value !== undefined) {
					this._setOption(key, value);
				}
			}
		}
	}


	private _assignRule (rule: RouteRule): void {
		const refinedRule: RouteRule = refineRouteRule(rule, this._config.defaultMethod);

		checkUriDuplication(this._routeRule, refinedRule);

		mergeRouteRule(this._routeRule, refinedRule);
	}

	// auth
	async auth (fnc: MiddlewareFunction): Promise<void> {
		if (fnc === undefined) {
			throw new Error('no auth function');
		}

		if (typeof fnc !== 'function') {
			throw new Error('auth param should be Function');
		}

		this._authFnc = fnc;
	}

	async before (middleware: MiddlewareFunction): Promise<void> {
		if (this.isRunning()) {
			throw new Error('server is started already, this function should be called before listen()');
		}

		if (middleware === undefined) {
			throw new Error('middleware function should be passed');
		}

		if (typeof middleware !== 'function') {
			throw new Error('middleware should be function');
		}

		this._middlewaresBefore.push(middleware);
	}

	async after (middleware: MiddlewareFunction): Promise<void> {
		if (this.isRunning()) {
			throw new Error('server is started already, this function should be called before listen()');
		}

		if (middleware === undefined) {
			throw new Error('middleware function should be passed');
		}

		if (typeof middleware !== 'function') {
			throw new Error('middleware should be function');
		}

		this._middlewaresAfter.push(middleware);
	}

	// validate & set an option, shared by constructor and config()
	private _setOption (key: string, value: unknown): void {
		switch (key) {
			// boolean keys
			case 'catchErrorLog':
			case 'preventError':
			case 'parseNumber':
			case 'parseDate':
				if (typeof value !== 'boolean') {
					throw new Error('invalid value');
				}

				this._config[key] = value;
				break;

			case 'bodyLimit':
				if (!isValidBodyLimit(value)) {
					throw new Error('invalid value');
				}

				this._config.bodyLimit = value;
				break;

			case 'defaultMethod':
				if (value !== null) {
					if (typeof value !== 'string') {
						throw new Error('invalid method parameter');
					}

					if (!Object.values(METHOD).some((method: string): boolean => {
						return value.toUpperCase() === method;
					})) {
						throw new Error('not defined method');
					}

					this._config.defaultMethod = value.toUpperCase() as METHOD;
				}
				else {
					// null is clearing
					delete this._config[key];
				}
				break;

			default:
				throw new Error('not defined option');
		}
	}

	async config (key: string, value: unknown): Promise<void> {
		this._setOption(key, value);
	}

	private _routeAbbrValidator (address: string, fnc: RouteFunction): void {
		if (address === undefined) {
			throw new Error('no address');
		}

		if (fnc === undefined) {
			throw new Error('no function');
		}

		if (typeof fnc !== 'function') {
			throw new Error('middleware should be Function');
		}
	}

	// route abbreviation
	async get (address: string, fnc: RouteFunction, option?: RouteOption): Promise<void> {
		this._routeAbbrValidator(address, fnc);

		// assign to route rule
		this._assignRule({
			[address]: {
				[METHOD.GET]: {
					fnc: fnc,
					option: option
				}
			}
		});
	}

	async post (address: string, fnc: RouteFunction, option?: RouteOption): Promise<void> {
		this._routeAbbrValidator(address, fnc);

		// assign to route rule
		this._assignRule({
			[address]: {
				[METHOD.POST]: {
					fnc: fnc,
					option: option
				}
			}
		});
	}

	async put (address: string, fnc: RouteFunction, option?: RouteOption): Promise<void> {
		this._routeAbbrValidator(address, fnc);

		// assign to route rule
		this._assignRule({
			[address]: {
				[METHOD.PUT]: {
					fnc: fnc,
					option: option
				}
			}
		});
	}

	async patch (address: string, fnc: RouteFunction, option?: RouteOption): Promise<void> {
		this._routeAbbrValidator(address, fnc);

		// assign to route rule
		this._assignRule({
			[address]: {
				[METHOD.PATCH]: {
					fnc: fnc,
					option: option
				}
			}
		});
	}

	async delete (address: string, fnc: RouteFunction, option?: RouteOption): Promise<void> {
		this._routeAbbrValidator(address, fnc);

		// assign to route rule
		this._assignRule({
			[address]: {
				[METHOD.DELETE]: {
					fnc: fnc,
					option: option
				}
			}
		});
	}

	private async _static (uri: string, path: string, option?: StaticOption): Promise<void> {
		checkStaticOption(option);

		// not assign to route rule
		if (!this._staticRules) {
			this._staticRules = [{ uri, path, option }];
		}
		else {
			this._staticRules.push({ uri, path, option });
		}
	}

	async static (uri: string, path: string, option?: StaticOption): Promise<void> {
		await checkAbsoluteUri(uri);

		await checkAbsolutePath(path);

		if (!await isFolder(path)) {
			throw new Error(`target should be a folder : ${ path }`);
		}

		await this._static(uri, path, option);
	}

	async route (rule: RouteRule): Promise<void> {
		this._assignRule(rule);
	}

	// add folder to static & add route rule for Single Page Application
	async setSPARoot (uri: string, path: string, option?: StaticOption): Promise<void> {
		await checkAbsoluteUri(uri);

		await checkAbsolutePath(path);

		if (!await isFolder(path)) {
			throw new Error(`target should be a folder : ${ path }`);
		}

		// check index.file exists
		const indexExists: boolean = await isExistFile(node_path.join(path, 'index.html'));

		if (!indexExists) {
			throw new Error(`index.html not exists in : ${ path }`);
		}

		await this._static(uri, path, option);

		this._spaRoot = uri;
	}

	// send cached static file, 304 Not Modified if the client has the same file
	private _sendStaticFile (req: IncomingMessage, res: ServerResponse, cache: StaticCache): void {
		// validators and Cache-Control are sent with 304 too (RFC 9110 15.4.5)
		res.setHeader(HEADER_KEY.ETAG, cache.etag);
		res.setHeader(HEADER_KEY.LAST_MODIFIED, cache.lastModified);

		if (cache.cacheControl !== undefined) {
			res.setHeader(HEADER_KEY.CACHE_CONTROL, cache.cacheControl);
		}

		if (isNotModified(req, cache.etag, cache.lastModified)) {
			res.statusCode = 304;
			res.end();
			return;
		}

		res.setHeader(HEADER_KEY.CONTENT_TYPE, toContentTypeHeader(cache.mime));
		// explicit content-length for HEAD, same as GET
		res.setHeader(HEADER_KEY.CONTENT_LENGTH, cache.fileData.byteLength);
		res.end(cache.fileData);
	}

	// send Readable stream returned by route function
	// resolves when the response is finished or closed
	// rejects only if the stream fails before sending the response headers, to respond with an error status code
	private async _sendStream (req: IncomingMessage, res: ServerResponse, stream: Readable): Promise<void> {
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
					if (this._config.catchErrorLog) {
						console.error('badak stream failed after response :', err);
					}

					return;
				}

				if (res.headersSent) {
					// some data is sent already, close the connection so that the client can know the response is incomplete
					if (this._config.catchErrorLog) {
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
	}

	async listen (port: number): Promise<void> {
		if (port === undefined) {
			throw new Error('port should be passed');
		}

		if (this.isRunning()) {
			throw new Error('server is running already');
		}

		// load static files
		if (
			!!this._staticRules
			&& this._staticRules.length > 0
		) {
			const allCache: StaticCache[][] = await Promise.all<StaticCache[]>(
				this._staticRules.map(async (staticRule: StaticRule): Promise<StaticCache[]> => {
					const cacheSet: StaticCache[] = await loadFolder(staticRule.uri, staticRule.path);

					const cacheControlOption: string | false | undefined = staticRule.option?.cacheControl;
					const cacheControl: string | undefined = cacheControlOption === undefined
						? DEFAULT_STATIC_CACHE_CONTROL
						: (cacheControlOption || undefined);

					cacheSet.forEach((oneCache: StaticCache): void => {
						oneCache.cacheControl = cacheControl;
					});

					return cacheSet;
				})
			);

			allCache.forEach((oneCacheSet: StaticCache[]): void => {
				oneCacheSet.forEach((oneCache: StaticCache): void => {
					this._staticCache.push(oneCache);

					this.get(
						oneCache.uri,
						async (param: unknown, req: IncomingMessage, res: ServerResponse): Promise<void> => {
							this._sendStaticFile(req, res, oneCache);
						},
						{
							auth: false
						}
					);
				});
			});

			if (this._spaRoot) {
				const spaPathPrefix: string = this._spaRoot.endsWith('/')
					? this._spaRoot
					: this._spaRoot + '/';

				const spaRoutingUrl: string = spaPathPrefix + '**';

				await this.get(
					spaRoutingUrl,
					async (param: unknown, req: IncomingMessage, res: ServerResponse): Promise<void> => {
						// find index.html in static cache & return
						const indexHtmlUrl: string = spaPathPrefix + 'index.html';

						const targetCache: StaticCache | undefined = this._staticCache.find((cache: StaticCache): boolean => {
							return cache.uri === indexHtmlUrl;
						});

						if (targetCache) {
							this._sendStaticFile(req, res, targetCache);
						}
						else {
							res.end();
						}
					},
					{
						auth: false
					}
				);
			}
		}

		// use new Promise for http.listen() callback
		await new Promise<void>((resolve, reject): void => {
			this._http = createServer(async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
				let responseBody: unknown;

				try {
					// run before middleware functions in parallel
					// before functions can't modify parameters
					// if one of them throws, route function is not executed and the error is handled below like route errors
					await Promise.all(
						this._middlewaresBefore.map((middlewareFnc: MiddlewareFunction): void | Promise<void> => {
							return middlewareFnc(req, res);
						})
					);

					if (isResponseStarted(res)) {
						// before() middleware responded already (e.g. 429), skip routing
						return;
					}

					if (this._staticRules === null) {
						// no rule assigned
						throw new HttpError(404);
					}


					if (!req.method) {
						throw new HttpError(400);
					}

					const method: string = req.method.toUpperCase();
					const { path: uriSanitized, queryStr } = splitUrl(req.url as string);

					const { rule: matchedRule, param: routeParam } = findRoute(this._routeRule, uriSanitized);
					let param: TypedObject<unknown> | undefined = routeParam;

					const { targetFncObj, allowedMethods } = findRouteFunction(matchedRule, method);

					if (targetFncObj === undefined) {
						if (allowedMethods.length > 0) {
							// path exists, but not for this method
							res.setHeader('Allow', allowedMethods.join(', '));

							throw new HttpError(405);
						}

						throw new HttpError(404);
					}

					if (
						this._authFnc
						&& typeof this._authFnc === 'function'
						&& (targetFncObj as RouteFunctionObj)?.option?.auth !== false
					) {
						// before receiving the request body, so that unauthenticated requests are not received up to bodyLimit
						// the unread body is discarded by Node.js after the response
						// can be normal or async function
						try {
							await this._authFnc(req, res);
						}
						catch (e: unknown) {
							// HttpError keeps its own status code, e.g. 403
							if (isHttpError(e)) {
								throw e;
							}

							// general Error from auth function is logged (e.g. DB failure in auth), responds 401
							throw new Error('Unauthorized', { cause: e });
						}

						if (isResponseStarted(res)) {
							// auth function responded already (e.g. 401), skip route function
							return;
						}
					}

					// params are merged in this order, the latter wins for the same key :
					// route param (e.g. colon routing) -> query string -> request body

					// query string, for every method
					if (
						queryStr !== undefined
						&& queryStr !== ''
					) {
						// convert by parseNumber & parseDate options, same as request body
						param = Object.assign(
							param ?? {},
							convertParam({ ...querystring.parse(queryStr) }, this._config)
						);
					}

					// request body
					switch (method) {
						case METHOD.PUT:
						case METHOD.POST:
						case METHOD.PATCH: {
							// bodyLimit of the route option overrides the app option
							const bodyLimit: number = (targetFncObj as RouteFunctionObj)?.option?.bodyLimit
								?? this._config.bodyLimit;

							const bodyParam: TypedObject<unknown> | undefined = await parseRequestBody(req, bodyLimit, this._config);

							if (bodyParam !== undefined) {
								if (
									param !== undefined
									&& typeof bodyParam === 'object'
									&& bodyParam !== null
									&& !Array.isArray(bodyParam)
								) {
									param = Object.assign(param, bodyParam);
								}
								else {
									// array or primitive JSON body can't be merged, passed as it is
									param = bodyParam;
								}
							}
							break;
						}
					}

					const responseData: unknown = typeof targetFncObj === 'function'
						? await targetFncObj(param, req, res)
						: await (targetFncObj as RouteFunctionObj).fnc(param, req, res);


					if (isResponseStarted(res)) {
						// route function started (res.writeHead(), res.write()) or ended (res.end()) response by itself,
						// ignore returned value and leave ending the response to the route function (e.g. streaming)
					}
					else if (responseData instanceof Readable) {
						await this._sendStream(req, res, responseData);
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
				}
				catch (e) {
					const err: Error | TypedObject<unknown> = e as Error | TypedObject<unknown>;

					// HttpError of 4xx is an intended client error response, not logged
					// 5xx and other errors (including Error('Forbidden')) are logged
					if (
						this._config.catchErrorLog
						&& !(isHttpError(err) && err.status < 500)
					) {
						console.error('badak catch error : %o', err);
					}

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
							res.end(responseBody);
						}
					}
					catch (responseError: unknown) {
						if (this._config.catchErrorLog) {
							console.error('badak failed to write error response :', responseError);
						}

						// can't respond properly, close the connection
						res.destroy();
					}

					if (!this._config.preventError) {
						throw err;
					}
				}
				finally {
					// run after middleware functions
					try {
						await Promise.all(
							this._middlewaresAfter.map((middlewareFnc: MiddlewareFunction): void | Promise<void> => {
								return middlewareFnc(req, res, responseBody);
							})
						);
					}
					catch (err) {
						// catch middleware exception
						if (this._config.catchErrorLog) {
							console.error('badak after() middleware failed :', err);
						}
					}
				}
			});

			this._http.on('error', (err: Error): void => {
				reject(err);
			});

			this._http.listen(port, (): void => {
				resolve();
			});
		});
	}

	isRunning (): boolean {
		return this._http !== undefined;
	}

	getHttpServer (): Server | undefined {
		if (!this.isRunning()) {
			throw new Error('server is not started');
		}

		return this._http;
	}

	// stop accepting new connections, and wait for in-flight requests to finish (graceful)
	// timeout (ms) : close remaining connections forcibly after this time, e.g. long polling or SSE
	//   integer from 0 to MAX_TIMER_DELAY, or Infinity (wait without limit, same as undefined)
	// note : upgraded connections (e.g. WebSocket) are not closed by closeAllConnections(),
	//   badak doesn't handle 'upgrade' now so Node.js destroys them, but they need their own handling if supported
	async stop (timeout?: number): Promise<void> {
		if (this._http === undefined) {
			throw new Error('server is not running, call listen() before stop()');
		}

		if (
			timeout !== undefined
			&& timeout !== Infinity
			&& (
				typeof timeout !== 'number'
				|| !Number.isInteger(timeout)
				|| timeout < 0
				// larger delay is set to 1ms by Node.js, closes connections immediately
				|| timeout > MAX_TIMER_DELAY
			)
		) {
			throw new Error('invalid timeout');
		}

		const server: Server = this._http;

		return new Promise<void>((resolve): void => {
			let forceCloseTimer: NodeJS.Timeout | undefined;

			server.close((): void => {
				if (forceCloseTimer !== undefined) {
					clearTimeout(forceCloseTimer);
				}

				delete this._http;

				resolve();
			});

			// idle keep-alive connections, server.close() does it by itself since Node.js 19
			server.closeIdleConnections();

			if (timeout !== undefined && timeout !== Infinity) {
				forceCloseTimer = setTimeout((): void => {
					server.closeAllConnections();
				}, timeout);
			}
		});
	}
}
