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

	// TODO: route abbreviation, get, post, put, delete
	// async get (rule : RouteRule) : Promise<void> {
	//
	// }

	async route (rule : RouteRule) : Promise<void> {
		if (rule === undefined) {
			throw new Error('route rule should be passed');
		}

		if (typeof rule !== 'object') {
			throw new Error('route rule should be object');
		}

		return this._checkRouteRule(rule)
			.then((routeRule : RouteRule) => {
				this._routeRule = routeRule;
			});
	}

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
				this._http = http.createServer(async (req : IncomingMessage, res : ServerResponse) => {
					// find route rule
					const uri = req.url;
					const uriArr = uri.split('/').filter(frag => frag !== '');

					if (!uriArr.every(uriFrag => uriFrag.length > 0)) {
						throw new Error('invalid uri');
					}

					let targetRouteObj : RouteRule | RouteRuleSeed = this._routeRule;

					if(targetRouteObj !== null){
						let targetFnc : Function = undefined;

						// TODO: static files

						uriArr.forEach((uriFrag, i, arr) => {
							targetRouteObj = targetRouteObj[uriFrag];

							if (targetRouteObj !== undefined) {
								if (i === arr.length - 1) {
									if (!!req.method && !!targetRouteObj[req.method]) {
										targetFnc = targetRouteObj[req.method];
									}
								}
							}
						});

						if (targetFnc === undefined) {
							res.statusCode = 404;
							res.end();
						}
						else {
							this._middleware.forEach(async (middleware : Function) => {
								await middleware();
							});

							// TODO: split with each 4-methods

							let param : any = undefined;

							if (req.method === 'PUT' || req.method === 'POST') {
								param = await new Promise((_resolve, _reject) => {
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
								})
									.catch(async (err : Error) => {
										console.error(err);

										res.statusCode = 500;
										res.end();
									});
							}

							const resObj = await targetFnc(param);

							if (!!resObj) {
								// TODO: response type
								res.statusCode = 200; // default 200

								// check result is json
								if (typeof resObj === 'object') {
									let isJson = false;

									try {
										JSON.stringify(resObj);
										isJson = true;
									}
									catch (err) {
										// no json
									}

									if (isJson) {
										res.setHeader('Content-Type', 'application/json');
									}
								}

								// res.writeHead(200, {
								// 	'Content-Type': 'application/json'
								// });
								res.end(JSON.stringify(resObj));
							}
							else {
								res.end();
							}
						}
					}
					else {
						res.statusCode = 404;
						res.end();
					}
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