import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { Server } from 'net';

import * as node_path from 'path';
import * as fs from 'fs';
import { Stats } from 'fs';

import { BadakOption, MiddlewareFunction, RouteFunction, RouteRule, RouteRuleSeed, StaticCache, StaticRule } from './interfaces';
import { Method } from './constants';

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

export class Badak {
	private _http : Server = null;

	// auth hook
	private _authFnc : MiddlewareFunction = null;

	// before & after hooks
	private _middlewaresBefore : MiddlewareFunction[] = [];
	private _middlewaresAfter : MiddlewareFunction[] = [];

	private _routeRule : RouteRule[] = [];

	private _staticRules : StaticRule[] = [];
	private _staticCache : StaticCache[] = [];

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
	private _refineRouteRule (rule : RouteRule | RouteRuleSeed) {
		if (rule === undefined) {
			throw new Error('no rule');
		}

		const keyArr = Object.keys(rule);

		if (keyArr.length === 0) {
			throw new Error('no rule in rule object');
		}

		const refinedRuleObj : RouteRule = {};

		// called recursively
		keyArr.forEach(uri => {
			// slash is permitted only '/', for others remove slash
			if (uri === '/') {
				refinedRuleObj['/'] = this._refineRouteRule(rule[uri]);
			} else {
				if (uri.includes('//')) {
					throw new Error('invalid double slash');
				}

				// make array for uri abbreviation
				const uriArr : string[] = uri.includes('/') ?
					uri.split('/').filter(uriFrag => uriFrag !== '') :
					[uri];

				let targetObj : RouteRule | RouteRuleSeed = refinedRuleObj;

				uriArr.forEach((uriFrag, i, arr) => {
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
								targetObj[uriFrag] = this._refineRouteRule(rule[uri]);
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
			}
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

		this._checkUriDuplication(this._routeRule, refinedRule);

		this._routeRule.push(refinedRule);
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
	async get (address : string, fnc : RouteFunction) : Promise<void> {
		this._routeAbbrValidator(address, fnc);

		// assign to route rule
		this._assignRule({
			[address] : {
				[Method.GET] : fnc
			}
		});
	}

	async post (address : string, fnc : RouteFunction) : Promise<void> {
		this._routeAbbrValidator(address, fnc);

		// assign to route rule
		this._assignRule({
			[address] : {
				[Method.POST] : fnc
			}
		});
	}

	async put (address : string, fnc : RouteFunction) : Promise<void> {
		this._routeAbbrValidator(address, fnc);

		// assign to route rule
		this._assignRule({
			[address] : {
				[Method.PUT] : fnc
			}
		});
	}

	async delete (address : string, fnc : RouteFunction) : Promise<void> {
		this._routeAbbrValidator(address, fnc);

		// assign to route rule
		this._assignRule({
			[address] : {
				[Method.DELETE] : fnc
			}
		});
	}

	// parameter can be Object of string because request has string
	private _paramConverter (param : Object) : Object {

		// convert if number string
		// if not number string, return itself
		function convertNumberStr (param : any) : any {
			let result : any = param;

			if (!isNaN(+param)) {
				result = +param;
			}

			return result;
		}

		// convert if date string
		// if not date string, return itself
		function convertDateStr (param : any) : any {
			let result : any = param;

			// only work for ISO 8601 date format
			const dateExps : RegExp[] = [
				/^(\d){4}-(\d){2}-(\d){2}$/, // date : '2018-06-20'
				/^(\d){4}-(\d){2}-(\d){2}T(\d){2}:(\d){2}:(\d){2}\+(\d){2}:(\d){2}$/, // combined date and time in UTC : '2018-06-20T21:22:09+00:00'
				/^(\d){4}-(\d){2}-(\d){2}T(\d){2}:(\d){2}:(\d){2}(.(\d){3})?Z$/, // combined date and time in UTC : '2018-06-20T21:22:09Z', '2018-06-20T22:00:30.296Z'
				/^(\d){8}T(\d){6}Z$/, // combined date and time in UTC : '20180620T212209Z'
				/^(\d){4}-W(\d){2}$/, // week : '2018-W25'
				/^(\d){4}-W(\d){2}-(\d){1}$/, // date with week number : '2018-W25-3'
				/^--(\d){2}-(\d){2}$/, // date without year : '--06-20'
				/^(\d){4}-(\d){3}$/ // ordinal dates : '2018-171'
			];

			if (dateExps.some(dateExp => {
				return dateExp.test(param);
			})) {
				result = new Date(param);
			}

			return result;
		}

		Object.keys(param).forEach((key) => {
			// only work for string param
			if (typeof param[key] === 'string') {
				if (this._config.parseNumber) {
					param[key] = convertNumberStr(param[key]);
				}
				if (this._config.parseDate) {
					param[key] = convertDateStr(param[key]);
				}
			}
		});

		return param;
	}

	// for POST, PUT
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

								paramObj[key] = value;
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

									paramObj[key] = value;
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

	async static (uri : string, path : string) : Promise<void> {
		if (!uri) {
			throw new Error('no uri');
		}

		if (!uri.startsWith('/')) {
			throw new Error('uri should be start with slash(/)');
		}

		if (!path) {
			throw new Error('no path');
		}

		if (!node_path.isAbsolute(path)) {
			throw new Error('path should be absolute');
		}

		if (!await this._isFolder(path)) {
			throw new Error('target should be a folder');
		}

		// not assign to route rule
		if (!this._staticRules) {
			this._staticRules = [{ uri, path }];
		} else {
			this._staticRules.push({ uri, path });
		}
	}

	async route (rule : RouteRule) : Promise<void> {
		this._assignRule(rule);
	}

	async _isFolder (path : string) : Promise<boolean> {
		return new Promise<boolean>((resolve, reject) => {
			fs.stat(path, (err : Error, stats : Stats) => {
				if (!err) {
					resolve(stats.isDirectory());
				} else {
					reject(new Error(`_isFolder() failed : ${ path }`));
				}
			});
		});
	}

	async _loadFolder (uri : string, path : string) : Promise<StaticCache[]> {
		const foldersAndFiles : string[] = await new Promise<string[]>(async (resolve, reject) => {
			fs.readdir(path, (err : Error, _foldersAndFiles : string[]) => {
				if (!err) {
					resolve(_foldersAndFiles);
				} else {
					reject(new Error(`_loadFolder() failed : ${ path }`));
				}
			});
		});

		const cache : StaticCache[] = [];

		const allFileData : StaticCache[][] = await Promise.all(foldersAndFiles.map(async (folderOrFileName : string) : Promise<StaticCache[]> => {
			const fullPath : string = node_path.join(path, folderOrFileName);

			let cacheSet : StaticCache[];

			if (await this._isFolder(fullPath)) {
				console.log('folder');
			} else {
				const matchArr : RegExpMatchArray = fullPath.match(/(\.[\w\d]+)?\.[\w\d]+$/);

				let mime : string = 'application/octet-stream'; // default

				if (!!matchArr) {
					const extension : string = matchArr[0];

					const mimeMap = {
						['.bmp'] : 'image/bmp',
						['.css'] : 'text/css',
						['.gif'] : 'image/gif',
						['.htm'] : 'text/html',
						['.html'] : 'text/html',
						['.jpeg'] : 'image/jpeg',
						['.jpg'] : 'image/jpeg',
						['.js'] : 'text/javascript',
						['.json'] : 'application/json',
						['.pdf'] : 'application/pdf',
						['.png'] : 'image/png',
						['.txt'] : 'text/plain',
						['.text'] : 'text/plain',
						['.tif'] : 'image/tiff',
						['.tiff'] : 'image/tiff',
						['.xls'] : 'application/vnd.ms-excel',
						['.xlsx'] : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
					};

					if (!!mimeMap[extension]) {
						mime = mimeMap[extension];
					}
				}

				cacheSet = [{
					uri : node_path
						.join(uri, folderOrFileName)
						.replace(/\\/g, '/'), // path \\ changed to /
					mime : mime,
					fileData : await this._loadFile(fullPath)
				}];
			}

			return cacheSet;
		}));

		allFileData.forEach((oneFileData, i) => {
			cache.push(...oneFileData);
		});

		return cache;
	}

	async _loadFile (path : string) : Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			fs.readFile(path, (err : Error, data : Buffer) => {
				if (!err) {
					resolve(data);
				} else {
					reject(new Error(`_loadFile() failed : ${ path }`));
				}
			});
		});
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
				return this._loadFolder(staticRule.uri, staticRule.path);
			}));

			allCache.forEach(oneCacheSet => [
				this._staticCache.push(...oneCacheSet)
			]);
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
						(!this._routeRule || this._routeRule.length === 0)
						&& this._staticRules === null
					) {
						// no rule assigned
						throw new Error('no rule');
					}

					const isStaticCase : boolean = method === Method.GET
						&& !!this._staticCache
						&& !!this._staticCache.find(one => {
							return one.uri === uri;
						});

					if (isStaticCase) {
						// static case
						const targetCache : StaticCache = this._staticCache.find(one => {
							return one.uri === uri;
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
					} else {
						let targetFnc : RouteFunction;
						let param : any;

						let routeRuleLength : number = this._routeRule.length;

						let targetRouteObj : RouteRule | RouteRuleSeed;

						for (let i = 0; i < routeRuleLength; i++) {
							targetRouteObj = this._routeRule[i];

							if (uri === '/') {
								if (!!targetRouteObj['/'] && !!targetRouteObj['/'][method]) {
									targetFnc = targetRouteObj['/'][method];
								}
							} else {
								// normal routing
								const uriArr : string[] = uri.split('/').filter(frag => frag !== '');
								const uriArrLength : number = uriArr.length;

								// find target function
								// use 'for' instead of 'forEach' to break
								for (let i = 0; i < uriArrLength; i++) {
									const uriFrag : string = uriArr[i];
									const routeRuleKeyArr : string[] = Object.keys(targetRouteObj);

									if (targetRouteObj[uriFrag] !== undefined) {
										targetRouteObj = targetRouteObj[uriFrag];

										continue;
									}

									// colon routing
									const colonParam : string = Object.keys(targetRouteObj).find(_uriFrag => _uriFrag.startsWith(':'));

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

										continue;
									}

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

										continue;
									}

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

										continue;
									}

									// asterisk routing
									const asteriskKeyArr : string[] = routeRuleKeyArr.filter(routeRuleKey => {
										return routeRuleKey.includes('*');
									});

									if (asteriskKeyArr.includes('**')) {
										targetRouteObj = targetRouteObj['**'];

										if (param === undefined) {
											param = {};
										}

										param['**'] = uriFrag;

										// ignore after uri
										break;
									} else if (asteriskKeyArr.includes('*')) {
										targetRouteObj = targetRouteObj['*'];

										if (param === undefined) {
											param = {};
										}

										param['*'] = uriFrag;

										// continue after uri
										continue;
									} else {
										const targetAsteriskKey : string = asteriskKeyArr.find(asteriskKey => {
											// replace '*' to '\\w*'
											return new RegExp(asteriskKey.replace('*', '\\w*')).test(uriFrag);
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

											continue;
										}
									}

									// not found
									targetRouteObj = null;
									break;
								}
							}

							if (!!targetRouteObj && !!targetRouteObj[method]) {
								targetFnc = targetRouteObj[method];

								break;
							}
						}

						if (targetFnc === undefined) {
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

						if (!!this._authFnc) {
							// can be normal or async function
							try {
								await this._authFnc(req, res);
							} catch (e) {
								// create new error instance
								throw new Error('auth failed');
							}
						}

						const resObj : any = await targetFnc(param, req, res);

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
