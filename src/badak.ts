import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import * as node_path from 'node:path';
import * as querystring from 'node:querystring';

import {
	BadakOption,
	MiddlewareFunction,
	RouteFunction,
	RouteFunctionObj,
	RouteOption,
	RouteRule,
	RouteRuleSeed,
	StaticCache,
	StaticRule,
	TypedObject
} from './interfaces.js';
import { CONTENT_TYPE, DEFAULT_BODY_LIMIT, HEADER_KEY, MAX_TIMER_DELAY, METHOD } from './constants.js';
import { isHttpError } from './http-error.js';
import {
	checkAbsolutePath,
	checkAbsoluteUri,
	convertDateStr,
	convertNumberStr,
	decodeUriFrag,
	getContentType,
	getMultipartBoundary,
	isExistFile,
	isFolder,
	isResponseStarted,
	loadFolder,
	MultipartPart,
	parseMultipart,
	SerializedBody,
	serializeBody,
	sift,
	toContentTypeHeader
} from './util.js';

/**
 * rule format, reserved keyword is 4-methods in upper cases
 * example)
 * {
 *     'users' : {
 *         'GET' : getUserList,
 *         'POST' : addUser,
 *
 *         ':id' : {
 *             'GET' : getUser,
 *             'PUT' : updateUser,
 *             'DELETE' : deleteUser
 *         }
 *     }
 * }
 */

enum LOOP_CONTROL {
	BREAK = 'B',
	CONTINUE = 'C'
}

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

	// refine route rule, this function can be called recursively
	private _refineRouteRule (rule: RouteRule | RouteRuleSeed, isRoot: boolean = true): RouteRule {
		if (rule === undefined) {
			throw new Error('no rule');
		}

		const keys: string[] = Object.keys(rule);

		if (keys.length === 0) {
			throw new Error('no rule in rule object');
		}

		const refinedRuleObj: RouteRule = {};

		// called recursively
		for (const [uri, value] of Object.entries(rule)) {
			if (uri.includes('//')) {
				throw new Error('invalid double slash');
			}

			// make array for uri abbreviation
			const uriArr: string[] = [
				isRoot ? '/' : '', // start from root
				...uri.split('/')
			]
				.filter((uriFrag: string): boolean => uriFrag !== '');

			let targetObj: RouteRule = refinedRuleObj;

			uriArr.forEach((uriFrag: string, i: number, arr: string[]): void => {
				if (uriFrag.trim() === '') {
					throw new Error('empty uri frag');
				}

				if (uriFrag.includes(' ')) {
					throw new Error('uri include space');
				}

				if (uriFrag.includes(':') && !uriFrag.startsWith(':')) {
					throw new Error('invalid colon route');
				}

				if (uriFrag.includes('?')) {
					if (uriFrag === '?') {
						throw new Error('invalid question character');
					}
				}

				if (uriFrag.includes('?') && uriFrag.startsWith('?')) {
					throw new Error('invalid question route');
				}

				if (uriFrag.includes('+') && uriFrag.startsWith('+')) {
					throw new Error('invalid plus route');
				}

				if (Object.values(METHOD).includes(uriFrag as METHOD)) {
					const method: METHOD = uriFrag as METHOD; // re-assign for readability

					targetObj[method] = rule[method] as RouteRuleSeed;
				}
				else {
					if (i < arr.length - 1) {
						// unzip abbreviation path
						if (!targetObj[uriFrag]) {
							targetObj[uriFrag] = {};
						}

						targetObj = targetObj[uriFrag] as RouteRule;
					}
					else {
						interface AnyRuleObj {
							[key: string]: RouteRuleSeed | RouteFunction;
						}

						// last uri frag
						const ruleAsAny: AnyRuleObj = rule as AnyRuleObj;

						if (typeof value === 'object') {
							targetObj[uriFrag] = this._refineRouteRule(value, false);
						}
						else if (typeof ruleAsAny[uri] === 'function') {
							if (this._config.defaultMethod) {
								targetObj[uriFrag] = {
									[this._config.defaultMethod]: ruleAsAny[uri]
								};
							}
							else {
								throw new Error('invalid rule or defaultMethod not set');
							}
						}
					}
				}
			});
		}

		return refinedRuleObj;
	}

	// check uri duplication among sibling uri fragments (same parent), call recursively
	private _checkUriDuplication (currentRouteRule: RouteRule, newRouteRule: RouteRule): void {
		const isMethodKey = (key: string): boolean => Object.values(METHOD).includes(key as METHOD);

		this._checkSiblingUriKeys(
			sift([
				...Object.keys(currentRouteRule),
				...Object.keys(newRouteRule)
			])
				.filter((key: string): boolean => !isMethodKey(key))
		);

		// current rule is checked already, so go deeper along new rule only
		for (const [key, newChild] of Object.entries(newRouteRule)) {
			if (isMethodKey(key) || typeof newChild !== 'object') {
				continue;
			}

			const currentChild: RouteRule | RouteRuleSeed | RouteFunction | undefined = currentRouteRule[key];

			this._checkUriDuplication(
				typeof currentChild === 'object'
					? currentChild as RouteRule
					: {},
				newChild as RouteRule
			);
		}
	}

	private _checkSiblingUriKeys (targetKeys: string[]): void {
		// colon routing
		const colonRouteArr: string[] = targetKeys.filter((uri: string): boolean => uri.startsWith(':'));
		if (colonRouteArr.length > 1) {
			throw new Error('duplicated colon routing');
		}

		// question routing
		const questionRouteArr: string[] = targetKeys.filter((uri: string): boolean => uri.includes('?'));
		if (questionRouteArr.length > 0) {
			const targetUris: string[] = targetKeys.filter((uri: string): boolean => !questionRouteArr.includes(uri));

			const matchingResult: string | undefined = questionRouteArr.find((regSrc: string): boolean => {
				// anchor to match whole uri fragment
				return targetUris.some((uri: string): boolean => new RegExp(`^(?:${ regSrc })$`).test(uri));
			});

			if (matchingResult !== undefined) {
				throw new Error('duplicated question routing');
			}
		}

		// plus routing
		const plusRouteArr: string[] = targetKeys.filter((uri: string): boolean => uri.includes('+'));
		if (plusRouteArr.length > 0) {
			plusRouteArr.forEach((plusUri: string): void => {
				// same as request matching, match whole uri fragment
				const plusRegExp: RegExp = new RegExp(`^(?:${ plusUri })$`);

				const isDuplicated: boolean = targetKeys
					.filter((uri: string): boolean => {
						// other special routings are checked by themselves
						return uri !== plusUri
							&& !uri.startsWith(':')
							&& !uri.includes('?')
							&& !uri.includes('*');
					})
					// for other plus uri, compare with its shortest matching uri : 'abc+' -> 'abc'
					.map((uri: string): string => uri.replace(/\+/g, ''))
					.some((uri: string): boolean => plusRegExp.test(uri));

				if (isDuplicated) {
					throw new Error('duplicated plus routing');
				}
			});
		}

		// asterisk routing
		const asteriskRouteArr: string[] = targetKeys.filter((uri: string): boolean => uri.includes('*'));

		if (asteriskRouteArr.length > 1) {
			throw new Error('duplicated asterisk routing');
		}
	}

	private _mergeRouteRule (a: RouteRule, b: RouteRule): RouteRule {
		Object.entries(b).forEach(([key, value]) => {
			if (a[key] === undefined) {
				a[key] = {};
			}

			if (typeof value === 'object') {
				this._mergeRouteRule((a ?? {})[key] as RouteRule, b[key] as RouteRule);
			}
			else {
				a[key] = b[key];
			}
		});

		return a;
	}


	private _assignRule (rule: RouteRule): void {
		const refinedRule: RouteRule = this._refineRouteRule(rule);

		this._checkUriDuplication(this._routeRule, refinedRule);

		this._mergeRouteRule(this._routeRule, refinedRule);
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
				// bytes, positive integer or Infinity (no limit)
				// NaN or decimal is rejected, NaN disables every size comparison
				if (
					typeof value !== 'number'
					|| value <= 0
					|| (!Number.isInteger(value) && value !== Infinity)
				) {
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

	// convert string by parseDate & parseNumber options
	// a string can't be both date and number format, so apply one of them
	private _convertStr (value: string): unknown {
		if (this._config.parseDate) {
			const dateConverted: string | Date = convertDateStr(value);

			if (dateConverted instanceof Date) {
				return dateConverted;
			}
		}

		if (this._config.parseNumber) {
			return convertNumberStr(value);
		}

		return value;
	}

	// parameter can be object of string because request has string
	// only work for string param
	private _paramConverter (param: TypedObject<unknown>): TypedObject<unknown> {
		if (Array.isArray(param)) {
			const paramAsArray: unknown[] = param as unknown[];

			paramAsArray.forEach((value: unknown, i: number, arr: unknown[]): void => {
				if (!value) {
					// null, undefined
					arr[i] = value;
				}
				else if (typeof value === 'object') {
					// call recursively
					arr[i] = this._paramConverter(value as TypedObject<unknown>);
				}
				else if (typeof value === 'string') {
					arr[i] = this._convertStr(value);
				}
			});
		}
		else {
			for (const [key, value] of Object.entries(param)) {
				if (!value) {
					// null, undefined
					param[key] = value;
				}
				else if (typeof value === 'object') {
					// call recursively
					param[key] = this._paramConverter(value as TypedObject<unknown>);
				}
				else if (typeof value === 'string') {
					param[key] = this._convertStr(value);
				}
			}
		}

		return param;
	}

	// parse request body by content-type
	// throws on malformed body, caller should handle it
	private _parseBody (req: IncomingMessage, bodyBuffer: Buffer): TypedObject<unknown> | undefined {
		let param: TypedObject<unknown> | undefined;

		const contentTypeInHeader: string = req.headers[HEADER_KEY.CONTENT_TYPE] as string;

		if (contentTypeInHeader) {
			const [contentType] = contentTypeInHeader
				.split(';')
				.map((s: string): string => s.trim());

			if (bodyBuffer.byteLength > 0) {
				switch (contentType) {
					case 'multipart/form-data': {
						const boundary: string | undefined = getMultipartBoundary(contentTypeInHeader);

						if (boundary === undefined) {
							// boundary is mandatory for multipart/form-data
							throw new Error('Bad Request');
						}

						parseMultipart(bodyBuffer, boundary).forEach((part: MultipartPart): void => {
							let value: string | Buffer;

							if (part.filename === undefined) {
								// normal field
								value = part.data.toString();
							}
							else {
								// file, text/plain is default by RFC 7578
								const fileContentType: string = (part.contentType ?? CONTENT_TYPE.TEXT_PLAIN).toLowerCase();

								value = fileContentType.startsWith(CONTENT_TYPE.TEXT_PLAIN)
									? part.data.toString()
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
						if (bodyBuffer.byteLength > 0) {
							try {
								param = JSON.parse(bodyBuffer.toString());
							}
							catch (e: unknown) {
								// malformed JSON is client's fault
								throw new Error('Bad Request', { cause: e });
							}
						}
						// no payload, but ok
						break;

					case CONTENT_TYPE.APPLICATION_WWW_FORM_URLENCODED:
						if (bodyBuffer.byteLength > 0) {
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
						}

						// no payload, but ok
						break;
				}

				if (param) {
					param = this._paramConverter(param);
				}
			}
		}

		return param;
	}

	// for POST, PUT
	// not support array of objects : 'multipart/form-data', 'application/x-www-form-urlencoded'
	private async _paramParser (req: IncomingMessage): Promise<TypedObject<unknown> | undefined> {
		return new Promise<TypedObject<unknown> | undefined>((resolve, reject): undefined => {
			const bodyLimit: number = this._config.bodyLimit;

			// reject before receiving body if declared size is over the limit
			const contentLength: number = Number(req.headers['content-length']);

			if (contentLength > bodyLimit) {
				// discard the body to keep the connection (keep-alive) usable
				req.resume();

				reject(new Error('Payload Too Large'));
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

					reject(new Error('Payload Too Large'));
					return;
				}

				bodyBufferPool.push(stream);
			});

			req.on('error', (err: Error): void => {
				reject(err);
			});

			req.on('end', (): void => {
				if (limitExceeded) {
					return;
				}

				try {
					resolve(this._parseBody(req, Buffer.concat(bodyBufferPool)));
				}
				catch (e: unknown) {
					reject(e);
				}
			});
		});
	}

	private async _static (uri: string, path: string): Promise<void> {
		// not assign to route rule
		if (!this._staticRules) {
			this._staticRules = [{ uri, path }];
		}
		else {
			this._staticRules.push({ uri, path });
		}
	}

	async static (uri: string, path: string): Promise<void> {
		await checkAbsoluteUri(uri);

		await checkAbsolutePath(path);

		if (!await isFolder(path)) {
			throw new Error(`target should be a folder : ${ path }`);
		}

		await this._static(uri, path);
	}

	async route (rule: RouteRule): Promise<void> {
		this._assignRule(rule);
	}

	// add folder to static & add route rule for Single Page Application
	async setSPARoot (uri: string, path: string): Promise<void> {
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

		await this._static(uri, path);

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
		if (
			!!this._staticRules
			&& this._staticRules.length > 0
		) {
			const allCache: StaticCache[][] = await Promise.all<StaticCache[]>(
				this._staticRules.map(async (staticRule: StaticRule): Promise<StaticCache[]> => {
					return loadFolder(staticRule.uri, staticRule.path);
				})
			);

			allCache.forEach((oneCacheSet: StaticCache[]): void => {
				oneCacheSet.forEach((oneCache: StaticCache): void => {
					this._staticCache.push(oneCache);

					this.get(
						oneCache.uri,
						async (param: unknown, req: IncomingMessage, res: ServerResponse): Promise<void> => {
							res.setHeader(HEADER_KEY.CONTENT_TYPE, toContentTypeHeader(oneCache.mime));
							// explicit content-length for HEAD, same as GET
							res.setHeader(HEADER_KEY.CONTENT_LENGTH, oneCache.fileData.byteLength);
							res.end(oneCache.fileData);
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
							const resFileObj: {
								mime: string;
								fileData: Uint8Array;
							} = {
								mime: targetCache.mime,
								fileData: targetCache.fileData
							};

							res.setHeader(HEADER_KEY.CONTENT_TYPE, toContentTypeHeader(resFileObj.mime));
							// explicit content-length for HEAD, same as GET
							res.setHeader(HEADER_KEY.CONTENT_LENGTH, resFileObj.fileData.byteLength);
							res.end(resFileObj.fileData);
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
						throw new Error('no rule');
					}


					if (!req.method) {
						throw new Error('no method');
					}

					const method: string = req.method.toUpperCase();
					const uri: string = req.url as string;

					let uriSanitized: string;
					let queryStr: string | undefined;

					if (uri.includes('?')) {
						const firstQuestionMarkIndex: number = uri.indexOf('?');

						uriSanitized = uri.substring(0, firstQuestionMarkIndex);
						queryStr = uri.substring(firstQuestionMarkIndex + 1);
					}
					else {
						uriSanitized = uri;
					}

					let targetFncObj: RouteFunction | RouteFunctionObj | undefined;
					let param: TypedObject<unknown> | undefined;

					let checkTargetRule: RouteRule | undefined = this._routeRule;

					// normal routing
					const uriArr: string[] = [
						'/', // start from root
						...uriSanitized.split('/')
					]
						.filter((frag: string): boolean => {
							return frag !== '';
						});

					// find target function
					// use 'for' instead of 'forEach' to break
					for (let depthIter: number = 0; depthIter < uriArr.length; depthIter++) {
						let loopControl: LOOP_CONTROL | undefined;

						const routeRuleKeyArr: string[] = Object.keys(checkTargetRule);

						const uriFrag: string = uriArr[depthIter];


						// normal routing
						if (checkTargetRule[uriFrag] !== undefined) {
							checkTargetRule = checkTargetRule[uriFrag] as RouteRule;

							loopControl = LOOP_CONTROL.CONTINUE;
						}

						if (!loopControl) {
							// colon routing
							const colonParam: string | undefined = routeRuleKeyArr.find((_uriFrag: string): boolean => {
								return _uriFrag.startsWith(':');
							});

							if (colonParam !== undefined) {
								checkTargetRule = checkTargetRule[colonParam] as RouteRule;

								if (param === undefined) {
									param = {};
								}

								// if (param.matcher === undefined) {
								// 	param.matcher = [];
								// }

								// param.matcher.push(colonParam);
								param[colonParam.replace(':', '')] = decodeUriFrag(uriFrag);

								loopControl = LOOP_CONTROL.CONTINUE;
							}
						}

						if (!loopControl) {
							// question routing
							const questionKeyArr: string[] = routeRuleKeyArr.filter((routeRuleKey: string): boolean => {
								return !!routeRuleKey.match(/.+\?/);
							});

							const targetQuestionKey: string | undefined = questionKeyArr.find((questionKey: string): boolean => {
								const questionKeyIndex: number = questionKey.indexOf('?');

								const optionalCharacter: string = questionKey.substring(
									questionKeyIndex - 1,
									questionKeyIndex
								);

								const mandatoryKey: string = questionKey.substring(0, questionKeyIndex - 1);
								const restKey: string = questionKey.substring(questionKeyIndex + 1);

								return new RegExp(`^${ mandatoryKey }${ optionalCharacter }?${ restKey }$`).test(uriFrag);
							});

							if (targetQuestionKey !== undefined) {
								checkTargetRule = checkTargetRule[targetQuestionKey] as RouteRule;

								if (param === undefined) {
									param = {};
								}

								// if (param.matcher === undefined) {
								// 	param.matcher = [];
								// }

								// param.matcher.push(targetQuestionKey);
								param[targetQuestionKey] = decodeUriFrag(uriFrag);

								loopControl = LOOP_CONTROL.CONTINUE;
							}
						}

						if (!loopControl) {
							// plus routing
							const plusKeyArr: string[] = routeRuleKeyArr.filter((routeRuleKey: string): boolean => {
								return routeRuleKey.includes('+');
							});

							const targetPlusKey: string | undefined = plusKeyArr.find((plusKey: string): boolean => {
								// anchor to match whole uri fragment
								return new RegExp(`^(?:${ plusKey })$`).test(uriFrag);
							});

							if (targetPlusKey !== undefined) {
								checkTargetRule = checkTargetRule[targetPlusKey] as RouteRule;

								if (param === undefined) {
									param = {};
								}

								// if (param.matcher === undefined) {
								// 	param.matcher = [];
								// }

								// param.matcher.push(targetPlusKey);
								param[targetPlusKey] = decodeUriFrag(uriFrag);

								loopControl = LOOP_CONTROL.CONTINUE;
							}
						}

						if (!loopControl) {
							// asterisk routing
							if (routeRuleKeyArr.includes('*')) {
								checkTargetRule = checkTargetRule['*'] as RouteRule;

								if (param === undefined) {
									param = {};
								}

								param['*'] = decodeUriFrag(uriFrag);

								loopControl = LOOP_CONTROL.CONTINUE;
							}
						}

						if (!loopControl) {
							// partial asterisk routing
							const targetAsteriskKey: string | undefined = routeRuleKeyArr
								.filter((routeRuleKey: string): boolean => {
									// 'ab*cd', 'user1*', not '**'
									return routeRuleKey !== '**' && /.\*/.test(routeRuleKey);
								})
								.find((asteriskKey: string): boolean => {
									// replace 'b*' to '.*', anchor to match whole uri fragment
									return new RegExp(
										`^(?:${ asteriskKey.replace(/.\*/, '.*') })$`
									).test(uriFrag);
								});


							if (targetAsteriskKey !== undefined) {
								checkTargetRule = checkTargetRule[targetAsteriskKey] as RouteRule;

								if (param === undefined) {
									param = {};
								}

								// if (param.matcher === undefined) {
								// 	param.matcher = [];
								// }

								// param.matcher.push(targetAsteriskKey);
								param[targetAsteriskKey] = decodeUriFrag(uriFrag);

								loopControl = LOOP_CONTROL.CONTINUE;
							}
						}


						// * / ** asterisk child routing
						const childRouteRuleKeyArr: string[] = Object.keys(checkTargetRule);

						if (depthIter === uriArr.length - 1 // for urls like '/something/'
							&& childRouteRuleKeyArr.includes('*')) {
							checkTargetRule = checkTargetRule['*'] as RouteRule;

							if (param === undefined) {
								param = {};
							}

							param['*'] = decodeUriFrag(uriFrag);

							loopControl = LOOP_CONTROL.BREAK;
						}
						else if (routeRuleKeyArr.includes('**') || childRouteRuleKeyArr.includes('**')) {
							checkTargetRule = checkTargetRule['**'] as RouteRule;

							if (param === undefined) {
								param = {};
							}

							param['**'] = decodeUriFrag(uriFrag);

							// ignore after uriFrag
							loopControl = LOOP_CONTROL.BREAK;
						}

						// use if/else instead of switch to break for loop
						if (
							loopControl === LOOP_CONTROL.BREAK
							|| uriFrag === '' // last frag with query string param
						) {
							break;
						}
						else if (loopControl === undefined) {
							// not found
							checkTargetRule = undefined;
							break;
						}
						// loopControl === LoopControl.Continue : continue
					}

					// HEAD is handled by GET route function, Node.js doesn't send the body for HEAD
					const ruleMethod: string = method === 'HEAD'
						? METHOD.GET
						: method;

					if (checkTargetRule && checkTargetRule[ruleMethod]) {
						targetFncObj = checkTargetRule[ruleMethod] as RouteFunctionObj;
					}

					if (targetFncObj === undefined) {
						// path exists, but not for this method : 405 with allowed methods
						const allowedMethods: string[] = checkTargetRule !== undefined
							? Object.values(METHOD).filter((one: METHOD): boolean => {
								return (checkTargetRule as RouteRule)[one] !== undefined;
							})
							: [];

						if (allowedMethods.length > 0) {
							// HEAD is handled by GET
							if (allowedMethods.includes(METHOD.GET)) {
								allowedMethods.splice(allowedMethods.indexOf(METHOD.GET) + 1, 0, 'HEAD');
							}

							res.setHeader('Allow', allowedMethods.join(', '));

							throw new Error('Method Not Allowed');
						}

						throw new Error('no rule');
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
							this._paramConverter({ ...querystring.parse(queryStr) })
						);
					}

					// request body
					switch (method) {
						case METHOD.PUT:
						case METHOD.POST:
						case METHOD.PATCH: {
							const bodyParam: TypedObject<unknown> | undefined = await this._paramParser(req);

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

					if (
						this._authFnc
						&& typeof this._authFnc === 'function'
						&& (targetFncObj as RouteFunctionObj)?.option?.auth !== false
					) {
						// can be normal or async function
						try {
							await this._authFnc(req, res);
						}
						catch (e: unknown) {
							// HttpError keeps its own status code, e.g. 403
							if (isHttpError(e)) {
								throw e;
							}

							throw new Error('Unauthorized', { cause: e });
						}

						if (isResponseStarted(res)) {
							// auth function responded already (e.g. 401), skip route function
							return;
						}
					}


					const responseData: unknown = typeof targetFncObj === 'function'
						? await targetFncObj(param, req, res)
						: await (targetFncObj as RouteFunctionObj).fnc(param, req, res);


					if (isResponseStarted(res)) {
						// route function started (res.writeHead(), res.write()) or ended (res.end()) response by itself,
						// ignore returned value and leave ending the response to the route function (e.g. streaming)
					}
					else if (responseData) {
						const contentType: CONTENT_TYPE = getContentType(responseData);

						if (!res.getHeader(HEADER_KEY.CONTENT_TYPE)) {
							res.setHeader(HEADER_KEY.CONTENT_TYPE, toContentTypeHeader(contentType));
						}

						function _convertBufferToBase64<T extends object> (value: T): T {
							Object.entries(value).forEach(([key, innerValue]) => {
								if (innerValue === undefined
									|| innerValue === null) {
									// do nothing
								}
								else if (innerValue instanceof Buffer) {
									(value as TypedObject<string>)[key] = innerValue.toString('base64');
								}
								else if (typeof innerValue === 'object') {
									// call recursively
									(value as TypedObject<object>)[key] = _convertBufferToBase64(innerValue);
								}
							});

							return value;
						}

						switch (contentType) {
							case CONTENT_TYPE.APPLICATION_JSON:
								responseBody = JSON.stringify(
									_convertBufferToBase64(responseData)
								);
								break;

							default:
								responseBody = responseData;

						}

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

					if (this._config.catchErrorLog) {
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
