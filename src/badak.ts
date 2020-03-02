import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { Server } from 'net';
import * as node_path from 'path';

import {
	BadakOption,
	MiddlewareFunction,
	RouteFunction,
	RouteFunctionObj,
	RouteOption,
	RouteRule,
	RouteRuleSeed,
	StaticCache,
	StaticRule
} from './interfaces';
import { Method } from './constants';
import { checkAbsolutePath, checkAbsoluteUri, convertDateStr, convertNumberStr, isArray, isExistFile, isFolder, loadFolder } from './util';

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

enum LoopControl {
	Break,
	Continue
}

export class Badak {
	private _http : Server = null;

	// auth hook
	private _authFnc : MiddlewareFunction = null;

	// before & after hooks
	private _middlewaresBefore : MiddlewareFunction[] = [];
	private _middlewaresAfter : MiddlewareFunction[] = [];

	private _routeRules : RouteRule[] = [];

	private _staticRules : StaticRule[] = [];
	private _staticCache : StaticCache[] = [];

	private _spaRoot : string;

	private _config : BadakOption = {
		catchErrorLog : true,
		preventError : true,

		defaultMethod : null,

		parseNumber : false,
		parseDate : false
	};

	constructor (option? : Partial<BadakOption>) {
		if (!!option) {
			Object.keys(option).forEach((key : Extract<keyof BadakOption, never>) => {
				this._config[key] = option[key];
			});
		}
	}

	// refine route rule, this function can be called recursively
	private _refineRouteRule (rule : RouteRule | RouteRuleSeed, isRoot : boolean = true) {
		if (rule === undefined) {
			throw new Error('no rule');
		}

		const keys = Object.keys(rule);

		if (keys.length === 0) {
			throw new Error('no rule in rule object');
		}

		// check validation
		keys.forEach(uri => {
			if (uri.includes('//')) {
				throw new Error('invalid double slash');
			}

			let uriArr : string[];

			if (uri === '/') {
				uriArr = ['/'];
			} else {
				uriArr = uri
					.split('/')
					.filter(uriFrag => !!uriFrag);
			}

			if (uriArr.length === 0) {
				throw new Error('empty rule');
			}

			uriArr.forEach(uriFrag => {
				if (uriFrag.trim() !== uriFrag) {
					throw new Error('uri include space');
				}

				if (uriFrag.trim() === '') {
					throw new Error('empty uri frag');
				}

				if (uriFrag.includes(':') && !uriFrag.startsWith(':')) {
					throw new Error('invalid colon route');
				}

				if (uriFrag.includes('?') && uriFrag.startsWith('?')) {
					throw new Error('invalid question route');
				}

				if (uriFrag.includes('+') && uriFrag.startsWith('+')) {
					throw new Error('invalid plus route');
				}
			});
		});


		const refinedRuleObj : RouteRule = {};

		// called recursively
		keys.forEach(uri => {
			// make array for uri abbreviation
			const uriArr : string[] = [
				isRoot ? '/' : '', // start from root
				...uri.split('/')
			]
				.filter(uriFrag => uriFrag !== '');

			let targetObj : RouteRule | RouteRuleSeed = refinedRuleObj;

			uriArr.forEach((uriFrag, i, arr) => {
				if (Object.values(Method).includes(uriFrag)) {
					const method : string = uriFrag; // re-assign for readability

					targetObj[method] = rule[method];
				} else {
					if (i < arr.length - 1) {
						// unzip abbreviation path
						if (!targetObj[uriFrag]) {
							targetObj[uriFrag] = {};
						}

						targetObj = targetObj[uriFrag];
					} else {
						// last uri frag
						if (typeof rule[uri] === 'object') {
							targetObj[uriFrag] = this._refineRouteRule(rule[uri], false);
						} else if (typeof rule[uri] === 'function') {
							if (!!this._config.defaultMethod) {
								targetObj[uriFrag] = {
									[this._config.defaultMethod] : rule[uri]
								};
							} else {
								throw new Error('invalid rule or defaultMethod not set');
							}
						}
					}
				}
			});
		});

		return refinedRuleObj;
	}

	// call recursively
	private getUriKeyArr (routeRule : RouteRule | RouteRuleSeed) : string[][] {
		const allKeys : string[] = Object.keys(routeRule);

		const result : string[][] = [];

		allKeys.forEach((key) => {
			if (typeof routeRule[key] === 'object') {
				this.getUriKeyArr(routeRule[key]).forEach((one : string[]) => {
					result.push([key, ...one]);
				});
			} else {
				result.push([key]);
			}
		});

		return result;
	}

	private _checkUriDuplication (currentRouteRule : RouteRule[], newRouteRule : RouteRule) : void {
		const allUriKeys : string[][] = [];

		currentRouteRule.forEach(oneRouteRule => {
			allUriKeys.push(...this.getUriKeyArr(oneRouteRule));
		});

		allUriKeys.push(...this.getUriKeyArr(newRouteRule));

		const maxDepthLength : number = allUriKeys.reduce((maxLength : number, cur : string[]) => {
			return maxLength > cur.length ? maxLength : cur.length;
		}, 0);

		for (let i = 0; i < maxDepthLength; i++) {
			const targetKeys : string[] = allUriKeys
				.map(oneTree => oneTree[i])
				.filter(frag => !!frag); // for different depth

			// colon routing
			const colonRouteArr : string[] = targetKeys.filter(uri => uri.startsWith(':'));
			if (colonRouteArr.length > 1) {
				throw new Error('duplicated colon routing');
			}

			// question routing
			const questionRouteArr : string[] = targetKeys.filter(uri => uri.includes('?'));
			if (questionRouteArr.length > 0) {
				const targetUris : string[] = targetKeys.filter(uri => !questionRouteArr.includes(uri));

				const matchingResult : string = questionRouteArr.find(regSrc => {
					return targetUris.some(uri => new RegExp(regSrc).test(uri));
				});

				if (matchingResult !== undefined) {
					throw new Error('duplicated question routing');
				}
			}

			// plus routing
			const plusRouteArr : string[] = targetKeys.filter(uri => uri.includes('+'));
			if (plusRouteArr.length > 0) {
				const plusUrisSanitized : string[] = [...targetKeys]; // start with all keys
				plusRouteArr.forEach(uri => {
					const plusIncluded : string = uri.replace('+', '');
					const plusExcluded : string = uri.replace(/.\+/, '');

					if (plusUrisSanitized.includes(plusIncluded) || plusUrisSanitized.includes(plusExcluded)) {
						throw new Error('duplicated plus routing');
					} else {
						plusUrisSanitized.push(plusIncluded, plusExcluded);
					}
				});
			}

			// TODO: asterisk routing
		}
	}

	private _assignRule (rule : RouteRule) : void {
		const refinedRule : RouteRule = this._refineRouteRule(rule);

		this._checkUriDuplication(this._routeRules, refinedRule);

		this._routeRules.push(refinedRule);
	}

	// auth
	async auth (fnc : MiddlewareFunction) : Promise<void> {
		if (fnc === undefined) {
			throw  new Error('no auth function');
		}

		if (!(fnc instanceof Function)) {
			throw new Error('auth param should be Function');
		}

		this._authFnc = fnc;
	}

	async before (middleware : MiddlewareFunction) : Promise<void> {
		if (this.isRunning()) {
			throw new Error('server is started already, this function should be called before listen()');
		}

		if (middleware === undefined) {
			throw new Error('middleware function should be passed');
		}

		if (!(middleware instanceof Function)) {
			throw new Error('middleware should be function');
		}

		this._middlewaresBefore.push(middleware);
	}

	async after (middleware : MiddlewareFunction) : Promise<void> {
		if (this.isRunning()) {
			throw new Error('server is started already, this function should be called before listen()');
		}

		if (middleware === undefined) {
			throw new Error('middleware function should be passed');
		}

		if (!(middleware instanceof Function)) {
			throw new Error('middleware should be function');
		}

		this._middlewaresAfter.push(middleware);
	}

	async config (key : string, value : any) : Promise<void> {
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

						if (!Object.values(Method).some((method : string) => {
							return value.toUpperCase() === method;
						})) {
							throw new Error('not defined method');
						}

						this._config.defaultMethod = value.toUpperCase() as Method;
					} else {
						// null is clearing
						delete this._config[key];
					}
					break;
			}
		} else {
			throw new Error('not defined option');
		}
	}

	private _routeAbbrValidator (address : string, fnc : RouteFunction) : void {
		if (address === undefined) {
			throw new Error('no address');
		}

		if (fnc === undefined) {
			throw new Error('no function');
		}

		if (!(fnc instanceof Function)) {
			throw new Error('middleware should be Function');
		}
	}

	// route abbreviation
	async get (address : string, fnc : RouteFunction, option? : RouteOption) : Promise<void> {
		this._routeAbbrValidator(address, fnc);

		// assign to route rule
		this._assignRule({
			[address] : {
				[Method.GET] : {
					fnc : fnc,
					option : option
				}
			}
		});
	}

	async post (address : string, fnc : RouteFunction, option? : RouteOption) : Promise<void> {
		this._routeAbbrValidator(address, fnc);

		// assign to route rule
		this._assignRule({
			[address] : {
				[Method.POST] : {
					fnc : fnc,
					option : option
				}
			}
		});
	}

	async put (address : string, fnc : RouteFunction, option? : RouteOption) : Promise<void> {
		this._routeAbbrValidator(address, fnc);

		// assign to route rule
		this._assignRule({
			[address] : {
				[Method.PUT] : {
					fnc : fnc,
					option : option
				}
			}
		});
	}

	async delete (address : string, fnc : RouteFunction, option? : RouteOption) : Promise<void> {
		this._routeAbbrValidator(address, fnc);

		// assign to route rule
		this._assignRule({
			[address] : {
				[Method.DELETE] : {
					fnc : fnc,
					option : option
				}
			}
		});
	}

	// parameter can be object of string because request has string
	// only work for string param
	private _paramConverter (param : object) : object {
		if (isArray(param)) {
			const paramAsArray : any[] = param as any[];

			paramAsArray.forEach((value, i, arr) => {
				if (typeof value === 'object') {
					// call recursively
					arr[i] = this._paramConverter(value);
				} else if (typeof value === 'string') {
					if (this._config.parseNumber) {
						arr[i] = convertNumberStr(value);
					}
					if (this._config.parseDate) {
						arr[i] = convertDateStr(value);
					}
				}
			});
		} else {
			Object.keys(param).forEach((key : string) => {
				const childObj : any = param[key];

				if (typeof childObj === 'object') {
					// call recursively
					param[key] = this._paramConverter(param[key]);
				} else if (typeof param[key] === 'string') {
					if (this._config.parseNumber) {
						param[key] = convertNumberStr(param[key]);
					}
					if (this._config.parseDate) {
						param[key] = convertDateStr(param[key]);
					}
				}
			});
		}

		return param;
	}

	// for POST, PUT
	// not support array of objects : 'multipart/form-data', 'application/x-www-form-urlencoded'
	private async _paramParser (req : IncomingMessage) : Promise<any> {
		return new Promise((resolve, reject) => {
			const bodyBuffer : Buffer[] = [];
			let bodyStr : string = null;

			req.on('data', (stream : Buffer) => {
				bodyBuffer.push(stream);
			});

			req.on('error', (err) => {
				reject(err);
			});

			req.on('end', async () => {
				let paramObj;

				const contentTypeInHeader : string = req.headers['content-type'] as string;

				if (!!contentTypeInHeader) {
					const contentTypeStrArr : string[] = contentTypeInHeader.split(';');
					const contentType = contentTypeStrArr[0].trim();

					bodyStr = Buffer.concat(bodyBuffer).toString();

					let fieldArr : string[] = null;

					switch (contentType) {
						case 'multipart/form-data':
							const boundaryStrArr : string[] = contentTypeStrArr[1].split('=');
							const boundaryStr : string = boundaryStrArr[1].trim();

							if (!boundaryStr) {
								throw new Error('invalid content-type');
							}

							fieldArr = bodyStr.split(boundaryStr)
								.filter(one => {
									return one.includes('Content-Disposition')
										&& one.includes('form-data')
										&& one.includes('name=');
								})
								.map(one => {
									return one
										.replace(/\r\n--/, '') // multipart/form-data has redundant '--', remove it
										.replace(/\r\n/g, ''); // trim '\r\n'
								});

							paramObj = {};

							fieldArr.forEach(field => {
								const [prefix, key, value] = field.split('"');

								if (key.endsWith('[]')) {
									// array
									const arrayName : string = key.replace(/\[\]$/g, '');

									if (paramObj[arrayName] !== undefined) {
										paramObj[arrayName].push(value);
									} else {
										paramObj[arrayName] = [value];
									}
								} else {
									paramObj[key] = value;
								}
							});

							break;

						case 'application/json':
							if (!!bodyStr) {
								try {
									paramObj = JSON.parse(bodyStr);
								} catch (e) {
									throw new Error('parsing parameter failed');
								}
							}
							// no payload, but ok
							break;

						case 'application/x-www-form-urlencoded':
							if (!!bodyStr) {
								paramObj = {};

								fieldArr = bodyStr.split('&');

								fieldArr.forEach(field => {
									const [key, value] = field.split('=');

									if (key.endsWith('[]')) {
										// array
										const arrayName : string = key.replace(/\[\]$/g, '');

										if (paramObj[arrayName] !== undefined) {
											paramObj[arrayName].push(value);
										} else {
											paramObj[arrayName] = [value];
										}
									} else {
										paramObj[key] = value;
									}
								});
							}

							// no payload, but ok
							break;
					}

					if (!!paramObj) {
						paramObj = this._paramConverter(paramObj);
					}

					resolve(paramObj);
				} else {
					// no content-type, but ok
					resolve();
				}
			});
		});
	}

	private async _static (uri : string, path : string) : Promise<void> {
		// not assign to route rule
		if (!this._staticRules) {
			this._staticRules = [{ uri, path }];
		} else {
			this._staticRules.push({ uri, path });
		}
	}

	async static (uri : string, path : string) : Promise<void> {
		await checkAbsoluteUri(uri);

		await checkAbsolutePath(path);

		if (!await isFolder(path)) {
			throw new Error(`target should be a folder : ${ path }`);
		}

		this._static(uri, path);
	}

	async route (rule : RouteRule) : Promise<void> {
		this._assignRule(rule);
	}

	// add folder to static & add route rule for Single Page Application
	async setSPARoot (uri : string, path : string) : Promise<void> {
		await checkAbsoluteUri(uri);

		await checkAbsolutePath(path);

		if (!await isFolder(path)) {
			throw new Error(`target should be a folder : ${ path }`);
		}

		// check index.file exists
		const indexExists : boolean = await isExistFile(node_path.join(path, 'index.html'));

		if (!indexExists) {
			throw new Error(`index.html not exists in : ${ path }`);
		}

		await this._static(uri, path);

		this._spaRoot = uri;
	}

	async listen (port : number) : Promise<void> {
		if (port === undefined) {
			throw new Error('port should be passed');
		}

		if (typeof port !== 'number') {
			throw new Error('port should be number type');
		}

		if (this.isRunning()) {
			throw new Error('server is running already');
		}

		// load static files
		if (!!this._staticRules && this._staticRules.length > 0) {
			const allCache : StaticCache[][] = await Promise.all<StaticCache[]>(this._staticRules.map(async (staticRule : StaticRule) : Promise<StaticCache[]> => {
				return loadFolder(staticRule.uri, staticRule.path);
			}));

			allCache.forEach(oneCacheSet => {
				oneCacheSet.forEach(oneCache => {
					this._staticCache.push(oneCache);

					this.get(oneCache.uri, async (param, req, res) => {
						res.setHeader('Content-Type', oneCache.mime);
						res.write(oneCache.fileData);
						res.end();
					}, {
						auth : false
					});
				});
			});

			if (!!this._spaRoot) {
				const spaPathPrefix : string = (this._spaRoot.endsWith('/') ? this._spaRoot : this._spaRoot + '/');
				const spaRoutingUrl : string = spaPathPrefix + '**';

				this.get(spaRoutingUrl, async (param, req : IncomingMessage, res : ServerResponse) => {
					// find index.html in static cache & return
					const indexHtmlUrl : string = spaPathPrefix + 'index.html';

					const targetCache : StaticCache = this._staticCache.find(cache => {
						return cache.uri === indexHtmlUrl;
					});

					const resFileObj : {
						mime : string;
						fileData : any;
					} = {
						mime : targetCache.mime,
						fileData : targetCache.fileData
					};

					res.setHeader('Content-Type', resFileObj.mime);
					res.write(resFileObj.fileData);
					res.end();
				}, {
					auth : false
				});
			}
		}

		// use new Promise for http.listen() callback
		await new Promise<void>((resolve, reject) => {
			this._http = http.createServer((req : IncomingMessage, res : ServerResponse) => {
				let responseBody : string;

				// new Promise loop to catch error
				(async () => {
					// run before middleware functions in parallel
					// before functions can't modify parameters
					// use try {} to run route function
					try {
						await Promise.all(this._middlewaresBefore.map((middlewareFnc : MiddlewareFunction) => {
							return middlewareFnc(req, res);
						}));
					} catch (err) {
						// catch middleware exception
						if (this._config.catchErrorLog) {
							console.error('badak before() middleware failed :', err);
						}
					}

					if (!req.method) {
						throw new Error('no method');
					}

					const method : string = req.method.toUpperCase();
					const uri : string = req.url;

					if (
						(!this._routeRules || this._routeRules.length === 0)
						&& this._staticRules === null
					) {
						// no rule assigned
						throw new Error('no rule');
					}

					let targetFncObj : RouteFunction | RouteFunctionObj;
					let param : any;

					let routeRuleLength : number = this._routeRules.length;

					let targetRouteObj : RouteRule | RouteRuleSeed;

					for (let i = 0; i < routeRuleLength; i++) {
						targetRouteObj = this._routeRules[i];

						// normal routing
						const uriArr : string[] = [
							'/', // start from root
							...uri.split('/')
						]
							.filter(frag => frag !== '');
						const uriArrLength : number = uriArr.length;

						// find target function
						// use 'for' instead of 'forEach' to break
						for (let j = 0; j < uriArrLength; j++) {
							let loopControl : LoopControl;

							const routeRuleKeyArr : string[] = Object.keys(targetRouteObj);
							const uriFrag : string = uriArr[j];

							// normal routing
							if (targetRouteObj[uriFrag] !== undefined) {
								targetRouteObj = targetRouteObj[uriFrag];

								loopControl = LoopControl.Continue;
							}

							if (!loopControl) {
								// colon routing
								const colonParam : string = routeRuleKeyArr.find(_uriFrag => _uriFrag.startsWith(':'));

								if (colonParam !== undefined) {
									targetRouteObj = targetRouteObj[colonParam];

									if (param === undefined) {
										param = {};
									}

									// if (param.matcher === undefined) {
									// 	param.matcher = [];
									// }

									// param.matcher.push(colonParam);
									param[colonParam.replace(':', '')] = uriFrag;

									loopControl = LoopControl.Continue;
								}
							}

							if (!loopControl) {
								// question routing
								const questionKeyArr : string[] = routeRuleKeyArr.filter(routeRuleKey => {
									return routeRuleKey.includes('?') && routeRuleKey.indexOf('?') !== 0;
								});

								const targetQuestionKey : string = questionKeyArr.find(questionKey => {
									const optionalCharacter : string = questionKey.substr(questionKey.indexOf('?') - 1, 1);
									const mandatoryKey : string = questionKey.substr(0, questionKey.indexOf(optionalCharacter + '?'));
									const restKey : string = questionKey.substr(questionKey.indexOf(optionalCharacter + '?') + optionalCharacter.length + 1);

									return new RegExp(`^${ mandatoryKey }${ optionalCharacter }?${ restKey }$`).test(uriFrag);
								});

								if (targetQuestionKey !== undefined) {
									targetRouteObj = targetRouteObj[targetQuestionKey];

									if (param === undefined) {
										param = {};
									}

									// if (param.matcher === undefined) {
									// 	param.matcher = [];
									// }

									// param.matcher.push(targetQuestionKey);
									param[targetQuestionKey] = uriFrag;

									loopControl = LoopControl.Continue;
								}
							}

							if (!loopControl) {
								// plus routing
								const plusKeyArr : string[] = routeRuleKeyArr.filter(routeRuleKey => {
									return routeRuleKey.includes('+');
								});

								const targetPlusKey : string = plusKeyArr.find(plusKey => {
									return new RegExp(plusKey).test(uriFrag);
								});

								if (targetPlusKey !== undefined) {
									targetRouteObj = targetRouteObj[targetPlusKey];

									if (param === undefined) {
										param = {};
									}

									// if (param.matcher === undefined) {
									// 	param.matcher = [];
									// }

									// param.matcher.push(targetPlusKey);
									param[targetPlusKey] = uriFrag;

									loopControl = LoopControl.Continue;
								}
							}

							if (!loopControl) {
								if (routeRuleKeyArr.includes('*')) {
									targetRouteObj = targetRouteObj['*'];

									if (param === undefined) {
										param = {};
									}

									param['*'] = uriFrag;

									loopControl = LoopControl.Continue;
								}
							}

							if (!loopControl) {
								// partial asterisk routing
								const targetAsteriskKey : string = routeRuleKeyArr
									.filter(routeRuleKey => {
										return /.\*./.test(routeRuleKey);
									})
									.find(asteriskKey => {
										// replace '*' to '(.)*'
										return new RegExp(
											asteriskKey.replace('*', '(.)*')
										).test(uriFrag);
									});

								if (targetAsteriskKey !== undefined) {
									targetRouteObj = targetRouteObj[targetAsteriskKey];

									if (param === undefined) {
										param = {};
									}

									// if (param.matcher === undefined) {
									// 	param.matcher = [];
									// }

									// param.matcher.push(targetAsteriskKey);
									param[targetAsteriskKey] = uriFrag;

									loopControl = LoopControl.Continue;
								}
							}


							// * / ** asterisk child routing
							const childRouteRuleKeyArr : string[] = Object.keys(targetRouteObj);

							if (j === uriArrLength - 1 // for urls like '/something/'
								&& childRouteRuleKeyArr.includes('*')) {
								targetRouteObj = targetRouteObj['*'];

								if (param === undefined) {
									param = {};
								}

								param['*'] = uriFrag;

								loopControl = LoopControl.Break;
							} else if (routeRuleKeyArr.includes('**') || childRouteRuleKeyArr.includes('**')) {
								targetRouteObj = targetRouteObj['**'];

								if (param === undefined) {
									param = {};
								}

								param['**'] = uriFrag;

								// ignore after uri
								loopControl = LoopControl.Break;
							}

							// use if/else instead of switch to break for loop
							if (loopControl === LoopControl.Break) {
								break;
							} else if (loopControl === undefined) {
								// not found
								targetRouteObj = null;
								break;
							}
							// loopControl === LoopControl.Continue : continue
						}

						if (!!targetRouteObj && !!targetRouteObj[method]) {
							targetFncObj = targetRouteObj[method];

							break;
						}
					}

					if (targetFncObj === undefined) {
						throw new Error('no rule');
					}

					switch (method) {
						case Method.PUT:
						case Method.POST:
							if (param === undefined) {
								param = await this._paramParser(req);
							} else {
								// TODO: overwrite? uri param & param object
								param = Object.assign(param, await this._paramParser(req));
							}
							break;
					}

					if (!!this._authFnc
						&& (
							targetFncObj instanceof Function ||
							(!(targetFncObj as RouteFunctionObj).option || ((targetFncObj as RouteFunctionObj).option.auth !== false))
						)
					) {
						// can be normal or async function
						try {
							await this._authFnc(req, res);
						} catch (e) {
							// create new error instance
							throw new Error('auth failed');
						}
					}

					const resObj : any = targetFncObj instanceof Function ?
						await targetFncObj(param, req, res) :
						await (targetFncObj as RouteFunctionObj).fnc(param, req, res);

					if (!!resObj) {
						// check result is json
						if (typeof resObj === 'object') {
							try {
								// try to stringify()
								responseBody = JSON.stringify(resObj);

								res.setHeader('Content-Type', 'application/json');
								res.end(responseBody);
							} catch (err) {
								// no json
								responseBody = resObj;

								res.setHeader('Content-Type', 'text/plain');
								res.end(responseBody);
							}
						} else {
							responseBody = resObj;

							res.setHeader('Content-Type', 'text/plain');
							res.end(responseBody);
						}
					} else {
						res.end();
					}
				})()
					.catch(async (err : any) => {
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

								if (!!err) {
									if (err instanceof Error) {
										responseBody = err.message;
										res.setHeader('Content-Type', 'text/plain');
									} else if (err instanceof Object) {
										responseBody = JSON.stringify(err);
										res.setHeader('Content-Type', 'application/json');
									} else {
										responseBody = err;
										res.setHeader('Content-Type', 'text/plain');
									}

									res.end(responseBody);
								} else {
									res.end();
								}
								break;
						}

						if (this._config.preventError === false) {
							throw err;
						}
					})
					.then(async () => {
						// run after middleware functions
						try {
							await Promise.all(this._middlewaresAfter.map((middlewareFnc : MiddlewareFunction) => {
								return middlewareFnc(req, res, responseBody);
							}));
						} catch (err) {
							// catch middleware exception
							if (this._config.catchErrorLog) {
								console.error('badak after() middleware failed :', err);
							}
						}
					});
			});

			this._http.on('error', (err : Error) => {
				reject(err);
			});

			this._http.listen(port, () => {
				resolve();
			});
		});
	}

	isRunning () : boolean {
		return this._http !== null;
	}

	getHttpServer () : Server {
		if (!this.isRunning()) {
			throw new Error('server is not started');
		}

		return this._http;
	}

	async stop () : Promise<any> {
		if (this._http === null) {
			throw new Error('server is not running, call listen() before stop()');
		}

		return new Promise((resolve) => {
			this._http.close(() => {
				this._http = null;

				resolve();
			});
		});
	}
}
