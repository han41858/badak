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

		// refine : remove '/', unzip abbreviation route path
		keyArr.forEach(key => {
			// TODO: root routing
			const refinedKey = key.replace(/^\/|\/$/gi, '');

			const uriArr = refinedKey.split('/');

			if (uriArr.length == 1) {
				refinedRuleObj[refinedKey] = rule[key];

			}
			else if (uriArr.length > 1) {
				if (!uriArr.every(uriFrag => uriFrag.length > 0)) {
					throw new Error('abbreviation valid failed');
				}

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
							targetObj[uriFrag] = {};

							targetObj = targetObj[uriFrag]; // for recursive
						}
					}
				});

				refinedRuleObj[uriArr[0]] = abbrObj;
			}
		});

		// check RoueRuleSeed format
		Object.keys(refinedRuleObj).forEach((key) => {
			promiseArr.push(
				(async () => {
					const value = refinedRuleObj[key];

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
						// check function is async
						if (value.constructor.name !== 'AsyncFunction') {
							throw new Error('route function should be async');
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

		Object.keys(ruleObj).forEach(async key => {
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
		});
	}

	async _routeAbbrValidator (address : string, fnc : Function) : Promise<void> {
		if (address === undefined) {
			throw new Error('no address');
		}

		if (fnc === undefined) {
			throw new Error('no function');
		}

		if (fnc.constructor.name !== 'AsyncFunction') {
			throw new Error('function should be async');
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

		this._assignRule(routeRule);
	}

	async use (middleware : Function) : Promise<void> {
		if (middleware === undefined) {
			throw new Error('middleware function should be passed');
		}

		if (middleware.constructor.name !== 'AsyncFunction') {
			throw new Error('middleware function should be async');
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
						// find route rule
						const uri : string = req.url;
						const uriArr : string[] = uri.split('/').filter(frag => frag !== '');

						let targetRouteObj : RouteRule | RouteRuleSeed = this._routeRule;

						if (targetRouteObj === null) {
							// no rule assigned
							throw new Error('no rule');
						}

						let targetFnc : Function = undefined;
						let param : any = undefined;

						// TODO: static files

						// find target function
						uriArr.forEach((uriFrag, i, arr) => {
							if (targetRouteObj[uriFrag] !== undefined) {
								targetRouteObj = targetRouteObj[uriFrag];

								// check route param
								if (i === arr.length - 1) {
									if (!!req.method && !!targetRouteObj[req.method]) {
										targetFnc = targetRouteObj[req.method];
									}
								}
							}
							else {
								// find router param
								const colonParam : string = Object.keys(targetRouteObj).find(_uriFrag => _uriFrag.startsWith(':'));

								if (colonParam !== undefined) {
									targetRouteObj = targetRouteObj[colonParam];

									if (i === arr.length - 1) {
										if (!!req.method && !!targetRouteObj[req.method]) {
											targetFnc = targetRouteObj[req.method];

											if (param === undefined) {
												param = {
													matcher : colonParam,
													id : uriFrag
												};
											}
										}
									}
								}
							}
						});

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