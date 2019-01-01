import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { Server } from 'net';

import { MiddlewareFunction, RouteFunction, RouteRule, RouteRuleSeed } from './interfaces';
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

// rule format, reserved keyword is 4-methods

export class Badak {
	private _http : Server = null;

	// auth hook
	private _authFnc : MiddlewareFunction = null;

	// before & after hooks
	private _middlewaresBefore : MiddlewareFunction[] = [];
	private _middlewaresAfter : MiddlewareFunction[] = [];

	private _routeRule : RouteRule = null;

	private _config : {
		[key : string] : any
	} = {
		defaultMethod : null, // can be ['GET', 'POST', 'PUT', 'DELETE', null] or lower cases, if set, can assign routing rule object without method
		/**
		 * before rule :
		 * {
		 *     '/users' : {
		 *         GET : getUserList
		 *     }
		 * }
		 *
		 * after set app.config('defaultMethod', 'GET') :
		 * {
		 *     '/users' : getUserList
		 * }
		 */

		parseNumber : false, // default false, if true, convert number string to Number
		parseDate : false // default false, if true, convert date string to Date object
	};

	// refine route rule, this function can be called recursively
	private _refineRouteRule (rule : RouteRule | RouteRuleSeed) {
		if (rule === undefined) {
			throw new Error('no rule');
		}

		const keyArr = Object.keys(rule);

		if (keyArr.length === 0) {
			throw new Error('no rule in rule object');
		}

		keyArr.forEach(key => {
			if (!key) {
				throw new Error('empty rule in rule object');
			}
		});

		const refinedRuleObj = {};

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

				let targetObj = refinedRuleObj;
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

					this._checkUriDuplication(Object.keys(targetObj));
				});
			}
		});

		return refinedRuleObj;
	}

	private _checkUriDuplication (uriKeys : string[]) : void {
		// sift keys, uriKeys can have duplicated item
		const uris : string[] = uriKeys.filter((key, i, arr) => {
			return i === arr.indexOf(key);
		});

		if (uris.length > 1) {
			// colon routing
			const colonRouteArr : string[] = uris.filter(uri => uri.startsWith(':'));
			if (colonRouteArr.length > 1) {
				throw new Error('duplicated colon routing');
			}

			// question routing
			const questionRouteArr : string[] = uris.filter(uri => uri.includes('?'));
			if (questionRouteArr.length > 0) {
				const targetUris : string[] = uris.filter(uri => !questionRouteArr.includes(uri));

				const matchingResult : string = questionRouteArr.find(regSrc => {
					return targetUris.some(uri => new RegExp(regSrc).test(uri));
				});

				if (matchingResult !== undefined) {
					throw new Error('duplicated question routing');
				}
			}

			// plus routing
			const plusRouteArr : string[] = uris.filter(uri => uri.includes('+'));
			if (plusRouteArr.length > 0) {
				const plusUrisSanitized : string[] = [...uris]; // start with all keys
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
		}
	}


	// divided with _assignRule for nested object, can be called recursively
	// Object.assign() overwrite existing tree, do this manually
	// param type is any, not RouteRule, different methods can be merged
	private _getMergedRule (currentRule : any, newRule : any) : RouteRule {
		if (newRule === undefined) {
			throw new Error('no newRule to merge');
		}

		const resultRule : RouteRule = Object.assign({}, currentRule);

		this._checkUriDuplication([
			...Object.keys(resultRule),
			...Object.keys(newRule)]
		);

		Object.keys(newRule).forEach(newRuleKey => {
			// assign
			if (!!resultRule[newRuleKey] && !Object.keys(Method).includes(newRuleKey)) {
				resultRule[newRuleKey] = this._getMergedRule(resultRule[newRuleKey], newRule[newRuleKey]);
			} else {
				resultRule[newRuleKey] = newRule[newRuleKey];
			}
		});

		return resultRule;
	}

	private _assignRule (rule : RouteRule) : void {
		const refinedRule : RouteRule = this._refineRouteRule(rule);

		this._routeRule = this._getMergedRule(this._routeRule, refinedRule);
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
					if (typeof value !== 'string') {
						throw new Error('invalid method parameter');
					}

					if (!Object.values(Method).some(method => {
						return method === value;
					})) {
						throw new Error('not defined method');
					}

					this._config[key] = value;
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
		return new Promise((_resolve, _reject) => {
			const bodyBuffer : Buffer[] = [];
			let bodyStr : string = null;

			req.on('data', (stream : Buffer) => {
				bodyBuffer.push(stream);
			});

			req.on('error', (err) => {
				_reject(err);
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

					_resolve(paramObj);
				} else {
					// no content-type, but ok
					_resolve();
				}
			});
		});

	}

	async route (rule : RouteRule) : Promise<void> {
		this._assignRule(rule);
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

		// use new Promise for http.listen() callback
		await new Promise<void>((resolve, reject) => {
			this._http = http.createServer((req : IncomingMessage, res : ServerResponse) => {
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
					}

					let targetFnc : RouteFunction;
					let param : any;

					let targetRouteObj : RouteRule | RouteRuleSeed = this._routeRule;

					if (targetRouteObj === null) {
						// no rule assigned
						throw new Error('no rule');
					}

					// find route rule
					const uri : string = req.url;

					if (uri === '/') {
						if (!!req.method && !!targetRouteObj['/'] && !!targetRouteObj['/'][req.method]) {
							targetFnc = targetRouteObj['/'][req.method.toUpperCase()];
						}
					} else {
						const uriArr : string[] = uri.split('/').filter(frag => frag !== '');

						// TODO: static files

						let ruleFound : boolean = false;

						// find target function
						uriArr.forEach((uriFrag, i, arr) => {
							ruleFound = false;

							const routeRuleKeyArr : string[] = Object.keys(targetRouteObj);

							if (targetRouteObj[uriFrag] !== undefined) {
								targetRouteObj = targetRouteObj[uriFrag];

								ruleFound = true;
							}

							if (!ruleFound) {
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

									ruleFound = true;
								}
							}

							if (!ruleFound) {
								// find question routing

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

									ruleFound = true;
								}
							}

							if (!ruleFound) {
								// find plus routing
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

									ruleFound = true;
								}
							}

							if (!ruleFound) {
								// find asterisk routing
								const asteriskKeyArr : string[] = routeRuleKeyArr.filter(routeRuleKey => {
									return routeRuleKey.includes('*');
								});

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

									ruleFound = true;
								}
							}

							if (i === arr.length - 1) {
								if (ruleFound && !!req.method && !!targetRouteObj && !!targetRouteObj[req.method]) {
									targetFnc = targetRouteObj[req.method.toUpperCase()];
								}
							}
						});
					}

					if (targetFnc === undefined) {
						throw new Error('no rule');
					}

					switch (req.method.toUpperCase()) {
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
								JSON.stringify(resObj);

								res.setHeader('Content-Type', 'application/json');

								res.end(JSON.stringify(resObj));
							} catch (err) {
								// no json

								res.setHeader('Content-Type', 'text/plain');
								res.end(resObj);
							}
						} else {
							res.setHeader('Content-Type', 'text/plain');
							res.end(resObj);
						}
					} else {
						res.end();
					}
				})()
					.catch(async (err : any) => {
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
									if (err instanceof Object) {
										res.setHeader('Content-Type', 'application/json');
										res.end(JSON.stringify(err));
									} else {
										res.end(err);
									}
								} else {
									res.end();
								}
								break;
						}
					})
					.then(async () => {
						// run after middleware functions
						try {
							await Promise.all(this._middlewaresAfter.map((middlewareFnc : MiddlewareFunction) => {
								return middlewareFnc(req, res);
							}));
						} catch (err) {
							// catch middleware exception
						}
					});
			});

			// this._http.on('error', (err : Error) => {
			// 	reject(err);
			// });

			this._http.listen(port, (err : Error) => {
				if (!err) {
					resolve();
				} else {
					reject(err);
				}
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