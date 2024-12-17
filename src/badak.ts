import * as http from 'node:http';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Server } from 'node:net';
import * as node_path from 'node:path';

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
} from './interfaces';
import { CONTENT_TYPE, HEADER_KEY, METHOD } from './constants';
import {
	checkAbsolutePath,
	checkAbsoluteUri,
	convertDateStr,
	convertNumberStr,
	getContentType,
	isExistFile,
	isFolder,
	loadFolder
} from './util';

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

	private _routeRules: RouteRule[] = [];

	private _staticRules: StaticRule[] = [];
	private _staticCache: StaticCache[] = [];

	private _spaRoot: string | undefined;

	private _config: BadakOption = {
		catchErrorLog: true,
		preventError: true,

		defaultMethod: undefined,

		parseNumber: false,
		parseDate: false
	};

	constructor (option?: Partial<BadakOption>) {
		if (option) {
			for (const [key, value] of Object.entries(option)) {
				this._config[key] = value;
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
					throw new Error('uri include space');
				}

				if (uriFrag.trim() === '') {
					throw new Error('empty uri frag');
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

	// call recursively
	private getUriKeyArr (routeRule: RouteRule | RouteRuleSeed): string[][] {
		const result: string[][] = [];

		for (const [key, value] of Object.entries(routeRule)) {
			if (typeof value === 'object') {
				this.getUriKeyArr(value).forEach((one: string[]): void => {
					// filter out route option
					if (one[one.length - 2] && one[one.length - 2] !== 'option') {
						result.push([key, ...one]);
					}
				});
			}
			else {
				result.push([key]);
			}
		}

		return result;
	}

	private _checkUriDuplication (currentRouteRule: RouteRule[], newRouteRule: RouteRule): void {
		const allUriKeys: string[][] = [];

		currentRouteRule.forEach((oneRouteRule: RouteRule): void => {
			allUriKeys.push(...this.getUriKeyArr(oneRouteRule));
		});

		allUriKeys.push(...this.getUriKeyArr(newRouteRule));

		const maxDepthLength: number = allUriKeys.reduce((maxLength: number, cur: string[]): number => {
			return maxLength > cur.length
				? maxLength
				: cur.length;
		}, 0);

		for (let i: number = 0; i < maxDepthLength; i++) {
			const targetKeys: string[] = allUriKeys
				.map((oneTree: string[]): string => oneTree[i])
				.filter((frag: string): frag is string => !!frag); // for different depth

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
					return targetUris.some((uri: string): boolean => new RegExp(regSrc).test(uri));
				});

				if (matchingResult !== undefined) {
					throw new Error('duplicated question routing');
				}
			}

			// plus routing
			const plusRouteArr: string[] = targetKeys.filter((uri: string): boolean => uri.includes('+'));
			if (plusRouteArr.length > 0) {
				const plusUrisSanitized: string[] = [...targetKeys]; // start with all keys
				plusRouteArr.forEach((uri: string): void => {
					const plusIncluded: string = uri.replace('+', '');
					const plusExcluded: string = uri.replace(/.\+/, '');

					if (plusUrisSanitized.includes(plusIncluded) || plusUrisSanitized.includes(plusExcluded)) {
						throw new Error('duplicated plus routing');
					}
					else {
						plusUrisSanitized.push(plusIncluded, plusExcluded);
					}
				});
			}

			// asterisk routing
			const asteriskRouteArr: string[] = targetKeys.filter((uri: string): boolean => uri.includes('*'));

			if (asteriskRouteArr.length > 1) {
				throw new Error('duplicated asterisk routing');
			}
		}
	}

	private _assignRule (rule: RouteRule): void {
		const refinedRule: RouteRule = this._refineRouteRule(rule);

		this._checkUriDuplication(this._routeRules, refinedRule);

		this._routeRules.push(refinedRule);
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

	async config (key: string, value: unknown): Promise<void> {
		if (Object.keys(this._config).includes(key)) {
			switch (key) {
				// boolean keys
				case 'parseNumber':
				case 'parseDate':
					if (typeof value !== 'boolean') {
						throw new Error('invalid value');
					}

					this._config[key] = value;
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
			}
		}
		else {
			throw new Error('not defined option');
		}
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
					if (this._config.parseNumber) {
						arr[i] = convertNumberStr(value);
					}
					if (this._config.parseDate) {
						arr[i] = convertDateStr(value);
					}
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
					if (this._config.parseNumber) {
						param[key] = convertNumberStr(value);
					}
					if (this._config.parseDate) {
						param[key] = convertDateStr(value);
					}
				}
			}
		}

		return param;
	}

	// for POST, PUT
	// not support array of objects : 'multipart/form-data', 'application/x-www-form-urlencoded'
	private async _paramParser (req: IncomingMessage): Promise<TypedObject<unknown> | undefined> {
		return new Promise<TypedObject<unknown> | undefined>((resolve, reject): undefined => {
			const bodyBuffer: Uint8Array[] = [];
			let bodyStr: string | undefined;

			req.on('data', (stream: Uint8Array): void => {
				bodyBuffer.push(stream);
			});

			req.on('error', (err: Error): void => {
				reject(err);
			});

			req.on('end', async (): Promise<void> => {
				let param: TypedObject<unknown> | undefined;

				const contentTypeInHeader: string = req.headers[HEADER_KEY.CONTENT_TYPE] as string;

				if (contentTypeInHeader) {
					const contentTypeStrArr: string[] = contentTypeInHeader.split(';');
					const contentType: string = contentTypeStrArr[0].trim();

					bodyStr = Buffer.concat(bodyBuffer).toString();


					switch (contentType) {
						case 'multipart/form-data': {
							const boundaryStrArr: string[] = contentTypeStrArr[1].split('=');
							const boundaryStr: string = boundaryStrArr[1].trim();

							if (!boundaryStr) {
								throw new Error('invalid content-type');
							}

							bodyStr.split(boundaryStr)
								.filter((one: string): boolean => {
									return one.includes('Content-Disposition')
										&& one.includes('form-data')
										&& one.includes('name=');
								})
								.map((one: string): string => {
									return one
										.replace(/\r\n--/, '') // multipart/form-data has redundant '--', remove it
										.replace(/\r\n/g, ''); // trim '\r\n'
								})
								.forEach((field: string): void => {
									// prefix, key, value
									const [, key, value] = field.split('"');

									if (!param) {
										param = {} as TypedObject<unknown>;
									}

									if (key.endsWith('[]')) {
										// array
										const arrayName: string = key.replace(/\[]$/g, '');

										if (param[arrayName]) {
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
						}

						case CONTENT_TYPE.APPLICATION_JSON:
							if (bodyStr) {
								try {
									param = JSON.parse(bodyStr);
								}
								catch (e: unknown) {
									let errStr: string = 'parsing parameter failed';

									if ((e as Error)?.message) {
										errStr += `: ${ (e as Error).message }`;
									}

									throw new Error(errStr);
								}
							}
							// no payload, but ok
							break;

						case CONTENT_TYPE.APPLICATION_WWW_FORM_URLENCODED:
							if (bodyStr) {
								bodyStr
									.split('&')
									.forEach((field: string): void => {
										const [key, value] = field.split('=');

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

					resolve(param);
				}
				else {
					// no content-type, but ok
					resolve(undefined);
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
		if (!!this._staticRules && this._staticRules.length > 0) {
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
							res.setHeader(HEADER_KEY.CONTENT_TYPE, oneCache.mime);
							res.write(oneCache.fileData);
							res.end();
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

							res.setHeader(HEADER_KEY.CONTENT_TYPE, resFileObj.mime);
							res.write(resFileObj.fileData);
						}

						res.end();
					},
					{
						auth: false
					}
				);
			}
		}

		// use new Promise for http.listen() callback
		await new Promise<void>((resolve, reject): void => {
			this._http = http.createServer((req: IncomingMessage, res: ServerResponse): void => {
				let responseBody: unknown;

				// new Promise loop to catch error
				(async (): Promise<void> => {
					// run before middleware functions in parallel
					// before functions can't modify parameters
					// use try {} to run route function
					try {
						await Promise.all(
							this._middlewaresBefore.map((middlewareFnc: MiddlewareFunction): void | Promise<void> => {
								return middlewareFnc(req, res);
							})
						);
					}
					catch (err) {
						// catch middleware exception
						if (this._config.catchErrorLog) {
							console.error('badak before() middleware failed :', err);
						}
					}

					if (
						(!this._routeRules || this._routeRules.length === 0)
						&& this._staticRules === null
					) {
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
						queryStr = uri.substring(firstQuestionMarkIndex);
					}
					else {
						uriSanitized = uri;
					}

					let targetFncObj: RouteFunction | RouteFunctionObj | undefined;
					let param: TypedObject<unknown> | undefined;

					const routeRuleLength: number = this._routeRules.length;

					let checkTargetRule: RouteRule | undefined;

					// don't use for-in/for-of here, checkTargetRule is not flat flow
					for (let parallelIter: number = 0; parallelIter < routeRuleLength; parallelIter++) {
						checkTargetRule = this._routeRules[parallelIter];

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
									param[colonParam.replace(':', '')] = uriFrag;

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
									param[targetQuestionKey] = uriFrag;

									loopControl = LOOP_CONTROL.CONTINUE;
								}
							}

							if (!loopControl) {
								// plus routing
								const plusKeyArr: string[] = routeRuleKeyArr.filter((routeRuleKey: string): boolean => {
									return routeRuleKey.includes('+');
								});

								const targetPlusKey: string | undefined = plusKeyArr.find((plusKey: string): boolean => {
									return new RegExp(plusKey).test(uriFrag);
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
									param[targetPlusKey] = uriFrag;

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

									param['*'] = uriFrag;

									loopControl = LOOP_CONTROL.CONTINUE;
								}
							}

							if (!loopControl) {
								// partial asterisk routing
								const targetAsteriskKey: string | undefined = routeRuleKeyArr
									.filter((routeRuleKey: string): boolean => {
										return /.\*./.test(routeRuleKey);
									})
									.find((asteriskKey: string): boolean => {
										// replace '*' to '(.)*'
										return new RegExp(
											asteriskKey.replace('*', '(.)*')
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
									param[targetAsteriskKey] = uriFrag;

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

								param['*'] = uriFrag;

								loopControl = LOOP_CONTROL.BREAK;
							}
							else if (routeRuleKeyArr.includes('**') || childRouteRuleKeyArr.includes('**')) {
								checkTargetRule = checkTargetRule['**'] as RouteRule;

								if (param === undefined) {
									param = {};
								}

								param['**'] = uriFrag;

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

						if (checkTargetRule && checkTargetRule[method]) {
							targetFncObj = checkTargetRule[method] as RouteFunctionObj;
							break;
						}
					}

					if (targetFncObj === undefined) {
						throw new Error('no rule');
					}

					switch (method) {
						case METHOD.GET: {
							// parse query string param
							if (queryStr !== undefined
								&& queryStr !== '') {
								const paramStrPairs: string[] = queryStr
									.replace(/^\?/, '') // remove starting ?
									.split('&')
									.filter((str: string): boolean => str !== '');

								if (param === undefined) {
									param = {};
								}

								for (const pairStr of paramStrPairs) {
									if (pairStr.includes('=')) {
										const [key, value]: string[] = pairStr.split('=');

										if (param[key] === undefined) {
											param[key] = decodeURIComponent(value);
										}
										else if (typeof param[key] === 'string') {
											// change to array
											param[key] = [param[key], value];
										}
										else {
											// array already
											(param[key] as string[]).push(value);
										}
									}
									else {
										param[pairStr] = null;
									}
								}
							}
							break;
						}

						case METHOD.PUT:
						case METHOD.POST:
							if (param) {
								// TODO: overwrite? uri param & param object
								param = Object.assign(param, await this._paramParser(req));
							}
							else {
								param = await this._paramParser(req);
							}
							break;
					}

					if (this._authFnc
						&& typeof this._authFnc === 'function'
						&& (targetFncObj as RouteFunctionObj)?.option?.auth !== false
					) {
						// can be normal or async function
						try {
							await this._authFnc(req, res);
						}
						catch (e: unknown) {
							// create new error instance
							let errStr: string = 'auth failed';

							if ((e as Error)?.message) {
								errStr += `: ${ (e as Error).message }`;
							}

							throw new Error(errStr);
						}
					}


					const responseData: unknown = typeof targetFncObj === 'function'
						? await targetFncObj(param, req, res)
						: await (targetFncObj as RouteFunctionObj).fnc(param, req, res);

					if (responseData) {
						const contentType: CONTENT_TYPE = getContentType(responseData);

						res.setHeader(HEADER_KEY.CONTENT_TYPE, contentType);

						switch (contentType) {
							case CONTENT_TYPE.APPLICATION_JSON:
								responseBody = JSON.stringify(responseData);
								break;

							default:
								responseBody = responseData;

						}

						res.end(responseBody);
					}
					else {
						res.end();
					}
				})()
					.catch(async (err: Error | TypedObject<unknown>): Promise<void> => {
						if (this._config.catchErrorLog) {
							console.error('badak catch error : %o', err);
						}

						switch (err.message) {
							case 'auth failed':
								res.statusCode = 401; // Unauthorized, Unauthenticated

								res.end();
								break;

							case 'no rule':
								res.statusCode = 404; // not found

								res.end();
								break;

							// internal errors
							case 'parsing parameter failed':
								res.statusCode = 500; // Internal Server Error

								res.end();
								break;

							default:
								res.statusCode = 500; // Internal Server Error

								if (err) {
									if (err instanceof Error) {
										responseBody = err.message;
										res.setHeader(HEADER_KEY.CONTENT_TYPE, CONTENT_TYPE.TEXT_PLAIN);
									}
									else {
										const contentType: CONTENT_TYPE = getContentType(err);

										res.setHeader(HEADER_KEY.CONTENT_TYPE, contentType);

										switch (contentType) {
											case CONTENT_TYPE.APPLICATION_JSON:
												responseBody = JSON.stringify(err);
												break;

											default:
												responseBody = err;
										}
									}

									res.end(responseBody);
								}
								else {
									res.end();
								}
								break;
						}

						if (!this._config.preventError) {
							throw err;
						}
					})
					.then(async (): Promise<void> => {
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
					});
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

	async stop (): Promise<void> {
		if (this._http === undefined) {
			throw new Error('server is not running, call listen() before stop()');
		}

		return new Promise<void>((resolve): void => {
			this._http?.close((): void => {
				delete this._http;

				resolve();
			});
		});
	}
}
