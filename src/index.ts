import * as http from 'http';
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

		if (keyArr.length <= 0) {
			throw new Error('no rule in rule object');
		}

		const promiseArr = [];
		const ruleObj = {};

		keyArr.forEach(key => {
			const refinedKey = key.replace(/^\/|\/$/gi, '');

			promiseArr.push(
				(async () => {
					const value = rule[key];

					if (value === undefined) {
						throw new Error('route function should be passed');
					}

					if (typeof value === 'object' && !!value) {
						// call recursively
						ruleObj[refinedKey] = await this._checkRouteRule(value);
					}
					else {
						// check function is async
						if (value.constructor.name !== 'AsyncFunction') {
							throw new Error('route function should be async');
						}

						ruleObj[refinedKey] = value;
					}

					return ruleObj;
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
				this._http = http.createServer((req, res) => {

					// find route rule
					// const uri = req.url;
					// console.log('uri : ', req.url);
					//
					// const uriArr = uri.split('/').filter(frag => frag !== '');
					// console.log('uriArr : ', uriArr);

					(async () => {
						this._middleware.forEach(async (middleware : Function) => {
							await middleware();
						});
					})()
						.then(() => {

							// run route rule logic
							res.end('ok');
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