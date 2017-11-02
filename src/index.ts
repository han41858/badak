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

		keyArr.forEach(key => {
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

		return Promise.all(promiseArr)
			.then(async rules => {
				return rules[0]; // rule object is in 0 index
			});
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
			return new Promise(resolve => {
				this._http = http.createServer((req : IncomingMessage, res : ServerResponse) => {

					// find route rule
					const uri = req.url;

					const uriArr = uri.split('/').filter(frag => frag !== '');

					if (!uriArr.every(uriFrag => uriFrag.length > 0)) {
						throw new Error('invalid uri');
					}

					let targetRouteObj : RouteRule | RouteRuleSeed = this._routeRule;
					let targetFnc : Function = null;

					uriArr.forEach((uriFrag, i, arr) => {
						targetRouteObj = targetRouteObj[uriFrag];

						if (i === arr.length - 1) {
							targetFnc = targetRouteObj[req.method];
						}
					});

					if (targetFnc === undefined) {
						throw new Error('not defined route function');
					}

					(async () => {
						this._middleware.forEach(async (middleware : Function) => {
							await middleware();
						});

						const resObj = await targetFnc();

						res.end(resObj);
					})();
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