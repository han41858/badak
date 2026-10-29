import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import * as node_path from 'node:path';
import * as querystring from 'node:querystring';

import {
	BadakOption,
	CheckedParamTypes,
	NoBodyParamTypes,
	NoBodyRouteFunction,
	ParamTypes,
	ParamContext,
	MiddlewareFunction,
	RouteFunction,
	RouteHandler,
	RouteFunctionObj,
	RouteOption,
	RouteRule,
	StaticCache,
	StaticOption,
	StaticRule,
	TypedObject
} from './interfaces.js';
import {
	DEFAULT_BODY_LIMIT,
	MAX_TIMER_DELAY,
	METHOD
} from './constants.js';
import { HttpError, isHttpError } from './http-error.js';
import { ClientAbortError, convertParam, parseRequestBody } from './body-parser.js';
import { sendErrorResponse, sendRouteResult } from './response.js';
import { checkStaticOption, loadStaticRule, sendStaticFile } from './static.js';
import { encodeLiteralPath } from './route-segment.js';
import {
	checkUriDuplication,
	cloneRouteRule,
	findRoute,
	findRouteFunction,
	mergeRouteRule,
	refineRouteRule,
	removeRouteRule,
	splitUrl,
	toOriginForm
} from './router.js';
import {
	checkAbsolutePath,
	checkAbsoluteUri,
	isExistFile,
	isFolder,
	isResponseStarted,
	isValidBodyLimit
} from './util.js';

// responses of a running server not closed yet, see Badak.stop()
interface HttpState {
	// with the connection, IncomingMessage has it even for a pipelined request
	responses: Map<ServerResponse, Socket>;
	// the number of responses not closed yet by the connection, more than 1 : pipelined requests
	connections: Map<Socket, number>;
	// responses 'Connection: close' is set to by stop()
	closing: Set<ServerResponse>;
	stopping: boolean;
}

const closeWhenIdle = (server: Server, res: ServerResponse): void => {
	res.once('finish', (): void => {
		server.closeIdleConnections();
	});
};

// close the keep-alive connection after the response, for stop()
const closeAfterResponse = (server: Server, state: HttpState, res: ServerResponse, socket: Socket): void => {
	if (!res.headersSent && state.connections.get(socket) === 1) {
		// Node.js closes the connection after this response
		res.setHeader('Connection', 'close');
		state.closing.add(res);

		return;
	}

	// 'Connection: keep-alive' is sent already, or pipelined requests are on the connection
	// 'Connection: close' drops the responses of the requests after it, Node.js closes the connection
	// close the connection when it becomes idle, after the last response
	closeWhenIdle(server, res);

	// a pipelined request is received after 'Connection: close' is set to the response before it, not sent yet
	state.responses.forEach((other: Socket, otherRes: ServerResponse): void => {
		if (other === socket && otherRes !== res && state.closing.has(otherRes) && !otherRes.headersSent) {
			otherRes.removeHeader('Connection');
			state.closing.delete(otherRes);

			closeWhenIdle(server, otherRes);
		}
	});
};

export class Badak {
	private _http: Server | undefined;

	// responses of the running server not closed yet, and stop() is called or not, see stop()
	private _httpState: HttpState | undefined;

	// auth hook
	private _authFnc: MiddlewareFunction | undefined;

	// before & after hooks
	private _middlewaresBefore: MiddlewareFunction[] = [];
	private _middlewaresAfter: MiddlewareFunction[] = [];

	private _routeRule: RouteRule = {};

	private _staticRules: StaticRule[] = [];
	private _staticCache: StaticCache[] = [];
	// static routes merged by the last listen(), removed in the next listen()
	private _staticRouteRule: RouteRule | undefined;

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

	private _routeAbbrValidator (address: string, fnc: RouteHandler): void {
		if (address === undefined) {
			throw new Error('no address');
		}

		if (fnc === undefined) {
			throw new Error('no function');
		}

		if (typeof fnc !== 'function') {
			throw new Error('route function should be Function');
		}
	}

	// route abbreviation
	async get<T extends CheckedParamTypes<T, false> = NoBodyParamTypes> (address: string, fnc: NoBodyRouteFunction<T>, option?: RouteOption): Promise<void> {
		// request body is not parsed for GET, declaring body is rejected by NoBodyRouteFunction
		this._routeAbbrValidator(address, fnc as RouteHandler);

		// assign to route rule
		this._assignRule({
			[address]: {
				[METHOD.GET]: {
					fnc: fnc as RouteHandler,
					option: option
				}
			}
		});
	}

	async post<T extends CheckedParamTypes<T> = ParamTypes> (address: string, fnc: RouteFunction<T>, option?: RouteOption): Promise<void> {
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

	async put<T extends CheckedParamTypes<T> = ParamTypes> (address: string, fnc: RouteFunction<T>, option?: RouteOption): Promise<void> {
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

	async patch<T extends CheckedParamTypes<T> = ParamTypes> (address: string, fnc: RouteFunction<T>, option?: RouteOption): Promise<void> {
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

	async delete<T extends CheckedParamTypes<T, false> = NoBodyParamTypes> (address: string, fnc: NoBodyRouteFunction<T>, option?: RouteOption): Promise<void> {
		// request body is not parsed for DELETE, declaring body is rejected by NoBodyRouteFunction
		this._routeAbbrValidator(address, fnc as RouteHandler);

		// assign to route rule
		this._assignRule({
			[address]: {
				[METHOD.DELETE]: {
					fnc: fnc as RouteHandler,
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

	async listen (port: number): Promise<void> {
		if (port === undefined) {
			throw new Error('port should be passed');
		}

		if (this.isRunning()) {
			throw new Error('server is running already');
		}

		// load static files
		// all static file routes and the SPA fallback are one rule object, checked and merged at once (docs/routing-spec-5.0.0.md 7.)
		// if a route conflicts, listen() rejects and nothing is changed : route tree, static cache
		if (
			!!this._staticRules
			&& this._staticRules.length > 0
		) {
			const allCache: StaticCache[][] = await Promise.all<StaticCache[]>(
				this._staticRules.map((staticRule: StaticRule): Promise<StaticCache[]> => {
					return loadStaticRule(staticRule);
				})
			);

			const staticCache: StaticCache[] = allCache.flat();
			const staticRouteRule: RouteRule = {};

			allCache.forEach((oneCacheSet: StaticCache[], ruleIndex: number): void => {
				// uri of the static rule is a routing path given by the user, kept as it is
				const ruleUri: string = this._staticRules[ruleIndex].uri;

				oneCacheSet.forEach((oneCache: StaticCache): void => {
					// file names are literal, not routing syntax, e.g. 'a+b.txt', '한글.txt', '100%.txt'
					const routeUri: string = oneCache.uri.startsWith(ruleUri)
						? ruleUri + encodeLiteralPath(oneCache.uri.slice(ruleUri.length))
						: encodeLiteralPath(oneCache.uri);

					// the same file path in different static folders : the latter wins, same as registering again
					staticRouteRule[routeUri] = {
						[METHOD.GET]: {
							fnc: async (param: unknown, req: IncomingMessage, res: ServerResponse): Promise<void> => {
								sendStaticFile(req, res, oneCache);
							},
							option: {
								auth: false
							}
						}
					};
				});
			});

			if (this._spaRoot) {
				const spaPathPrefix: string = this._spaRoot.endsWith('/')
					? this._spaRoot
					: this._spaRoot + '/';

				const indexHtmlUrl: string = spaPathPrefix + 'index.html';

				staticRouteRule[spaPathPrefix + '**'] = {
					[METHOD.GET]: {
						fnc: async (param: unknown, req: IncomingMessage, res: ServerResponse): Promise<void> => {
							// find index.html in static cache & return
							const targetCache: StaticCache | undefined = this._staticCache.find((cache: StaticCache): boolean => {
								return cache.uri === indexHtmlUrl;
							});

							if (targetCache) {
								sendStaticFile(req, res, targetCache);
							}
							else {
								res.end();
							}
						},
						option: {
							auth: false
						}
					}
				};
			}

			// the route tree with the static routes of this listen() call, replaced only if there is no conflict
			// static routes of the previous listen() call are removed : files deleted after stop() are not served
			const nextRouteRule: RouteRule = cloneRouteRule(this._routeRule);

			if (this._staticRouteRule !== undefined) {
				removeRouteRule(nextRouteRule, this._staticRouteRule);
			}

			let refinedStaticRule: RouteRule;

			try {
				refinedStaticRule = refineRouteRule(staticRouteRule, this._config.defaultMethod);

				checkUriDuplication(nextRouteRule, refinedStaticRule);
				mergeRouteRule(nextRouteRule, refinedStaticRule);
			}
			catch (e: unknown) {
				const folders: string = this._staticRules
					.map((staticRule: StaticRule): string => `  ${ staticRule.uri } : ${ staticRule.path }`)
					.join('\n');

				throw new Error(`${ (e as Error).message }\nstatic files :\n${ folders }`, { cause: e });
			}

			this._routeRule = nextRouteRule;
			this._staticRouteRule = refinedStaticRule;

			// replaced, not appended : listen() after stop() loads the files again
			this._staticCache = staticCache;
		}

		// use new Promise for http.listen() callback
		await new Promise<void>((resolve, reject): void => {
			const httpState: HttpState = { responses: new Map(), connections: new Map(), closing: new Set(), stopping: false };

			this._httpState = httpState;

			const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
				const socket: Socket = req.socket;

				httpState.responses.set(res, socket);
				httpState.connections.set(socket, (httpState.connections.get(socket) ?? 0) + 1);

				res.once('close', (): void => {
					httpState.responses.delete(res);
					httpState.closing.delete(res);

					const count: number = (httpState.connections.get(socket) ?? 1) - 1;

					if (count > 0) {
						httpState.connections.set(socket, count);
					}
					else {
						httpState.connections.delete(socket);
					}
				});

				// a request on a keep-alive connection after stop()
				if (httpState.stopping) {
					closeAfterResponse(server, httpState, res, socket);
				}

				let responseBody: unknown;

				const setResponseBody = (body: unknown): void => {
					responseBody = body;
				};

				try {
					// run before middleware functions in parallel
					// before functions can't modify parameters
					// all of them are called and settled before routing or the error response, even if one of them throws synchronously
					// if one of them throws, route function is not executed,
					// and the first error in registration order is handled below like route errors
					const beforeResults: PromiseSettledResult<void>[] = await Promise.allSettled(
						this._middlewaresBefore.map((middlewareFnc: MiddlewareFunction): Promise<void> => {
							// called synchronously like before, a synchronous throw rejects
							return new Promise<void>((resolveMiddleware): void => {
								resolveMiddleware(middlewareFnc(req, res));
							});
						})
					);

					const beforeFailure: PromiseSettledResult<void> | undefined = beforeResults.find((result: PromiseSettledResult<void>): boolean => {
						return result.status === 'rejected';
					});

					if (beforeFailure !== undefined && beforeFailure.status === 'rejected') {
						throw beforeFailure.reason;
					}

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
					const { path: uriSanitized, queryStr } = splitUrl(toOriginForm(req.url as string));

					const { rule: matchedRule, param: routeParam } = findRoute(this._routeRule, uriSanitized, method);
					const params: Record<string, string> = (routeParam ?? {}) as Record<string, string>;
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
							if (this._config.catchErrorLog) {
								console.error('badak catch error : %o', e);
							}

							throw new HttpError(401, { cause: e });
						}

						if (isResponseStarted(res)) {
							// auth function responded already (e.g. 401), skip route function
							return;
						}
					}

					// Keep route params, query string and request body separate.
					// Route params are always strings; parseNumber/parseDate apply to query and body.
					const query: Record<string, unknown> = queryStr !== undefined && queryStr !== ''
						? convertParam({ ...querystring.parse(queryStr) }, this._config)
						: {};

					let body: unknown;

					switch (method) {
						case METHOD.PUT:
						case METHOD.POST:
						case METHOD.PATCH: {
							const bodyLimit: number = (targetFncObj as RouteFunctionObj)?.option?.bodyLimit
								?? this._config.bodyLimit;

							body = await parseRequestBody(req, bodyLimit, this._config);
							break;
						}
					}

					const ctx: ParamContext = { params, query, body };

					const responseData: unknown = typeof targetFncObj === 'function'
						? await targetFncObj(ctx, req, res)
						: await (targetFncObj as RouteFunctionObj).fnc(ctx, req, res);


					await sendRouteResult(req, res, responseData, this._config.catchErrorLog, setResponseBody);
				}
				catch (e) {
					const err: Error | TypedObject<unknown> = e as Error | TypedObject<unknown>;

					// the client closed the connection while sending the request body (classified in receiveBody())
					// nothing can be responded, not a server error : not logged, not passed to Node.js
					// after() functions still run, the response is not completed (res.writableEnded is false)
					if (err instanceof ClientAbortError) {
						return;
					}

					// HttpError of 4xx is an intended client error response, not logged
					// 5xx and other errors (including Error('Forbidden'), it is 500) are logged
					if (
						this._config.catchErrorLog
						&& !(isHttpError(err) && err.status < 500)
					) {
						console.error('badak catch error : %o', err);
					}

					// the connection is closed already, don't respond
					if (!res.destroyed) {
						sendErrorResponse(res, err, this._config.catchErrorLog, setResponseBody);
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

			this._http = server;

			server.on('error', (err: Error): void => {
				reject(err);
			});

			server.listen(port, (): void => {
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
		const httpState: HttpState | undefined = this._httpState;

		return new Promise<void>((resolve): void => {
			let forceCloseTimer: NodeJS.Timeout | undefined;

			server.close((): void => {
				if (forceCloseTimer !== undefined) {
					clearTimeout(forceCloseTimer);
				}

				delete this._http;
				delete this._httpState;

				resolve();
			});

			// in-flight requests : their keep-alive connections become idle after the response,
			// and server.close() waits for them until keepAliveTimeout or the client closes them
			if (httpState !== undefined) {
				httpState.stopping = true;

				httpState.responses.forEach((socket: Socket, res: ServerResponse): void => {
					closeAfterResponse(server, httpState, res, socket);
				});
			}

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
