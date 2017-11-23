import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { Server } from 'net';

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

export interface RouteRule {
	[uri : string] : RouteRule | RouteRuleSeed
}

export interface RouteRuleSeed {
	GET? : Function;
	POST? : Function;
	PUT? : Function;
	DELETE? : Function;
}

export class Badak {
	private _http : Server = null;
	private _middleware : Function[] = [];
	private _routeRule : RouteRule = null;

	// check & refine route rule
	private async _checkRouteRule (rule : RouteRule | RouteRuleSeed) : Promise<RouteRule | RouteRuleSeed> {
		if (rule === undefined) {
			throw new Error('no rule');
		}

		const keyArr = Object.keys(rule);
		if (keyArr.length === 0) {
			throw new Error('no rule in rule object');
		}

		const promiseArr = [];

		const refinedRuleObj = {}; // for abbreviation
		const resultRuleObj = {};

		// check colon routing count
		const colonRouting : string[] = keyArr.filter(key => key.includes(':') && key.indexOf(':') === 0);
		if (colonRouting.length > 1) {
			throw new Error('duplicated colon routing');
		}

		// refine : remove '/', unzip abbreviation route path
		keyArr.forEach(key => {
			let refinedKey : string = null;
			let uriArr : string[] = null;

			// slash is permitted only '/', for others remove slash
			if (key === '/') {
				refinedKey = key;
				uriArr = [key];
			}
			else {
				refinedKey = key.replace(/^\/|\/$/gi, '');
				uriArr = refinedKey.split('/');

				if (!uriArr.every(uriFrag => uriFrag.length > 0)) {
					throw new Error('empty uri included');
				}

				if (!uriArr.every(uriFrag => uriFrag.includes(':') ? uriFrag.indexOf(':') === 0 : true)) {
					throw new Error('invalid colon route');
				}
			}

			if (uriArr.length == 1) {
				refinedRuleObj[refinedKey] = rule[key];

			}
			else if (uriArr.length > 1) {

				// convert abbreviation to recursive object
				let abbrObj = {};
				let targetObj = abbrObj;
				uriArr.forEach((uriFrag, i, arr) => {
					// skip first fragment, it used first key
					if (i > 0) {
						if (i === arr.length - 1) {
							// last one

							targetObj[uriFrag] = rule[key];
						}
						else {
							if (targetObj[uriFrag] === undefined) {
								targetObj[uriFrag] = {};
							}

							targetObj = targetObj[uriFrag]; // for recursive
						}
					}
				});

				if (refinedRuleObj[uriArr[0]] === undefined) {
					refinedRuleObj[uriArr[0]] = {};
				}

				Object.keys(abbrObj).forEach(key => {
					refinedRuleObj[uriArr[0]][key] = abbrObj[key];
				});
			}
		});

		// check RoueRuleSeed format
		Object.keys(refinedRuleObj).forEach((key) => {
			promiseArr.push(
				(async () => {
					const value = refinedRuleObj[key];

					if (key.includes('?')) {
						if (key.indexOf('?') === 0) {
							throw new Error('uri can\'t start \'?\'');
						}

						// count ? character
						if ((key.match(/\?/g) || []).length >= 2) {
							throw new Error('multiple \'?\' in route uri');
						}
					}

					if (value === undefined) {
						throw new Error('route function should be passed');
					}

					if (typeof value === 'object' && !!value) {
						// check before-last depth
						const beforeLastDepth : boolean = Object.keys(value).every(key => {
							return value[key].constructor.name !== 'Object';
						});

						if (beforeLastDepth) {
							const objKeyArr : string[] = Object.keys(rule);
							const methodArr : string[] = ['GET', 'POST', 'PUT', 'DELETE'];

							// RouteRuleSeed should have one more of 4-methods
							const hasRouteRuleSeed = objKeyArr.some(objKey => {
								return methodArr.some(method => {
									return Object.keys(rule[objKey]).includes(method);
								});
							});

							if (!hasRouteRuleSeed) {
								throw new Error('route rule should have any of "GET", "POST", "PUT", "DELETE"');
							}
						}

						// call recursively
						resultRuleObj[key] = await this._checkRouteRule(value);
					}
					else {
						// last depth seed function
						if (!(value instanceof Function)) {
							throw new Error('route function is not Function');
						}

						resultRuleObj[key] = value;
					}

					return resultRuleObj;
				})()
			);
		});

		const rules = await Promise.all(promiseArr);

		return rules[0]; // rule object is in 0 index
	}

	private async _assignRule (ruleObj : RouteRule | RouteRuleSeed, parentObj? : RouteRule | RouteRuleSeed) : Promise<void> {
		if (this._routeRule === null) {
			this._routeRule = {};
		}

		const targetObj : RouteRule | RouteRuleSeed = parentObj === undefined ? this._routeRule : parentObj;

		const targetObjKeyArr : string[] = Object.keys(targetObj);
		const ruleObjKeyArr : string[] = Object.keys(ruleObj);

		// use promise array to catch error in forEach loop
		const promiseArr : Promise<void>[] = [];

		Object.keys(ruleObj).forEach((key : string) => {
			promiseArr.push((async () => {
				if (typeof ruleObj[key] === 'object') {
					// RouteRule
					switch (key) {
						case 'GET':
						case 'POST':
						case 'PUT':
						case 'DELETE':
							targetObj[key] = ruleObj[key];
							break;

						default:
							// 	check duplicated param routing

							// find colon routing
							const colonRouteArr : string[] = [...targetObjKeyArr, ...ruleObjKeyArr]
								.filter(_key => _key.includes(':') && _key.indexOf(':') === 0);

							if (colonRouteArr.length > 1) {
								throw new Error('duplicated colon routing');
							}

							// find question routing
							const existingQuestionRouteArr : string[] = [...targetObjKeyArr]
								.filter(_key => _key.includes('?'));

							// check current routed rule is duplicated
							if (existingQuestionRouteArr.length > 0) {

								const matchingQuestionUri : string = existingQuestionRouteArr.find(questionKey => {
									return ruleObjKeyArr.some(ruleKey => {
										return new RegExp(questionKey).test(ruleKey);
									});
								});

								if (matchingQuestionUri !== undefined) {
									throw new Error('duplicated question routing');
								}
							}

							// check new route rule is duplicated
							const newQuestionRouteArr : string[] = [...ruleObjKeyArr]
								.filter(_key => _key.includes('?'));

							if (newQuestionRouteArr.length > 0) {
								const matchingQuestionUri : string = newQuestionRouteArr.find(questionKey => {
									return targetObjKeyArr.some(ruleKey => {
										return new RegExp(questionKey).test(ruleKey);
									});
								});

								if (matchingQuestionUri !== undefined) {
									throw new Error('duplicated question routing');
								}
							}

							// call recursively
							if (targetObj[key] === undefined) {
								targetObj[key] = {};
							}

							await this._assignRule(ruleObj[key], targetObj[key]);
							break;
					}

				}
				else {
					// RouteRuleSeed
					switch (key) {
						case 'GET':
						case 'POST':
						case 'PUT':
						case 'DELETE':
							targetObj[key] = ruleObj[key];
							break;

						default:
							throw new Error('invalid rule in RouteRuleSeed');
					}
				}
			})());
		});

		return Promise.all(promiseArr)
			.then(() => {
				// returns nothing
			})
			.catch((err : Error) => {
				throw err;
			});
	}

	async _routeAbbrValidator (address : string, fnc : Function) : Promise<void> {
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
	async get (address : string, fnc : Function) : Promise<void> {
		await this._routeAbbrValidator(address, fnc);

		// check rule validation
		const routeRule : RouteRule | RouteRuleSeed = await this._checkRouteRule({
			[address] : {
				'GET' : fnc
			}
		});

		// assign to route rule
		await this._assignRule(routeRule);
	}

	async post (address : string, fnc : Function) : Promise<void> {
		await this._routeAbbrValidator(address, fnc);

		// check rule validation
		const routeRule : RouteRule | RouteRuleSeed = await this._checkRouteRule({
			[address] : {
				'POST' : fnc
			}
		});

		// assign to route rule
		await this._assignRule(routeRule);
	}

	async put (address : string, fnc : Function) : Promise<void> {
		await this._routeAbbrValidator(address, fnc);

		// check rule validation
		const routeRule : RouteRule | RouteRuleSeed = await this._checkRouteRule({
			[address] : {
				'PUT' : fnc
			}
		});

		// assign to route rule
		await this._assignRule(routeRule);
	}

	async delete (address : string, fnc : Function) : Promise<void> {
		await this._routeAbbrValidator(address, fnc);

		// check rule validation
		const routeRule : RouteRule | RouteRuleSeed = await this._checkRouteRule({
			[address] : {
				'DELETE' : fnc
			}
		});

		// assign to route rule
		await this._assignRule(routeRule);
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
				let paramObj = undefined;

				const contentTypeInHeader : string = req.headers['content-type'] as string;

				if (!!contentTypeInHeader) {
					const contentTypeStrArr : string[] = contentTypeInHeader.split(';');
					const contentType = contentTypeStrArr[0].trim();

					bodyStr = Buffer.concat(bodyBuffer).toString().replace(/\s/g, '');

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
									return one.includes('Content-Disposition:form-data') && one.includes('name=');
								})
								.map(one => {
									// multipart/form-data has redundant '--', remove it
									return one.substr(0, one.length - 2);
								});

							// validation
							const fieldPrefixStr = 'Content-Disposition:form-data;name=';
							fieldArr.forEach((str) => {
								if (!str.includes(fieldPrefixStr)) {
									throw new Error('invalid data : Content-Disposition');
								}
							});

							paramObj = {};

							fieldArr.forEach(field => {
								const [prefix, key, value] = field.split('"');
								paramObj[key] = value;
							});

							break;

						case 'application/json':
							paramObj = JSON.parse(bodyStr);
							break;

						case 'application/x-www-form-urlencoded':
							paramObj = {};

							fieldArr = bodyStr.split('&');

							fieldArr.forEach(field => {
								const [key, value] = field.split('=');
								paramObj[key] = value;
							});
							break;
					}
				}

				_resolve(paramObj);
			});
		});

	}

	async route (rule : RouteRule) : Promise<void> {
		if (rule === undefined) {
			throw new Error('route rule should be passed');
		}

		if (typeof rule !== 'object') {
			throw new Error('route rule should be object');
		}

		const routeRule : RouteRule | RouteRuleSeed = await this._checkRouteRule(rule);

		await this._assignRule(routeRule);
	}

	async use (middleware : Function) : Promise<void> {
		if (middleware === undefined) {
			throw new Error('middleware function should be passed');
		}

		if (!(middleware instanceof Function)) {
			throw new Error('middleware should be function');
		}

		this._middleware.push(middleware);
	}

	async listen (port : number) : Promise<any> {
		if (port === undefined) {
			throw new Error('port should be passed');
		}

		if (typeof port !== 'number') {
			throw new Error('port should be number type');
		}

		if (this._http !== null) {
			throw new Error('server is running already');
		}
		else {
			// use new Promise for http.listen() callback
			return new Promise(resolve => {
				this._http = http.createServer((req : IncomingMessage, res : ServerResponse) => {
					// new Promise loop to catch error
					(async () => {
						let targetFnc : Function = undefined;
						let param : any = undefined;

						let targetRouteObj : RouteRule | RouteRuleSeed = this._routeRule;

						if (targetRouteObj === null) {
							// no rule assigned
							throw new Error('no rule');
						}

						// find route rule
						const uri : string = req.url;

						if (uri === '/') {
							if (!!req.method && !!targetRouteObj['/'][req.method]) {
								targetFnc = targetRouteObj['/'][req.method];
							}
						}
						else {
							const uriArr : string[] = uri.split('/').filter(frag => frag !== '');

							// TODO: static files

							// find target function
							uriArr.forEach((uriFrag, i, arr) => {
								if (targetRouteObj[uriFrag] !== undefined) {
									targetRouteObj = targetRouteObj[uriFrag];
								}
								else {
									// find router param

									// colon routing
									const colonParam : string = Object.keys(targetRouteObj).find(_uriFrag => _uriFrag.startsWith(':'));

									if (colonParam !== undefined) {
										targetRouteObj = targetRouteObj[colonParam];

										if (param === undefined) {
											param = {};
										}

										if (param.matcher === undefined) {
											param.matcher = [];
										}

										param.matcher.push(colonParam);
										param[colonParam.replace(':', '')] = uriFrag;
									}
									else {
										// find question routing
										const routeRuleKeyArr : string[] = Object.keys(targetRouteObj);

										const questionKeyArr : string[] = routeRuleKeyArr.filter(routeRuleKey => {
											return routeRuleKey.includes('?') && routeRuleKey.indexOf('?') !== 0;
										});

										const targetQuestionKey : string = questionKeyArr.find(questionKey => {
											const optionalCharacter : string = questionKey.substr(questionKey.indexOf('?') - 1, 1);
											const mandatoryKey : string = questionKey.substr(0, questionKey.indexOf(optionalCharacter + '?'));
											const restKey : string = questionKey.substr(questionKey.indexOf(optionalCharacter + '?') + optionalCharacter.length + 1);

											return new RegExp(`^${mandatoryKey}${optionalCharacter}?${restKey}$`).test(uriFrag);
										});

										if (targetQuestionKey !== undefined) {
											targetRouteObj = targetRouteObj[targetQuestionKey];

											if (param === undefined) {
												param = {};
											}

											if (param.matcher === undefined) {
												param.matcher = [];
											}

											param.matcher.push(targetQuestionKey);
											param[targetQuestionKey] = uriFrag;
										}
										else {
											// find plus routing
											const routeRuleKeyArr : string[] = Object.keys(targetRouteObj);

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

												if (param.matcher === undefined) {
													param.matcher = [];
												}

												param.matcher.push(targetPlusKey);
												param[targetPlusKey] = uriFrag;
											}
										}
									}
								}

								if (i === arr.length - 1) {
									if (!!req.method && !!targetRouteObj[req.method]) {
										targetFnc = targetRouteObj[req.method];
									}
								}
							});
						}

						if (targetFnc === undefined) {
							throw new Error('no rule');
						}

						switch (req.method) {
							case 'PUT':
							case 'POST':
								if (param === undefined) {
									param = {};
								}

								param.data = await this._paramParser(req)
									.catch(async (err : Error) => {
										console.error(err);

										throw new Error('parsing parameter error');
									});
								break;
						}

						this._middleware.forEach(async (middleware : Function) => {
							await middleware();
						});

						const resObj : any = await targetFnc(param);

						if (!!resObj) {
							// check result is json
							if (typeof resObj === 'object') {

								try {
									JSON.stringify(resObj);

									res.setHeader('Content-Type', 'application/json');

									res.end(JSON.stringify(resObj));
								}
								catch (err) {
									// no json

									res.setHeader('Content-Type', 'text/plain');
									res.end(resObj);
								}
							}
							else {
								res.setHeader('Content-Type', 'text/plain');
								res.end(resObj);
							}
						}
						else {
							res.end();
						}
					})()
						.catch((err : Error) => {
							switch (err.message) {
								case 'no rule':
									res.statusCode = 404;
									res.end();
									break;

								case 'parsing parameter error':
									res.statusCode = 500;
									res.end();
									break;

								default:
									console.error(err.message);
									res.statusCode = 500;
									res.end();
									break;
							}
						});
				});

				this._http.listen(port, () => {
					resolve();
				});
			});
		}
	}

	isRunning () : boolean {
		return this._http !== null;
	}

	getHttpServer () : Server {
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
		})
	}
}