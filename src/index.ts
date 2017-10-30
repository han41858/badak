import * as http from 'http';
import { Server } from 'net';

export class Badak {
	private _http : Server = null;
	private _middleware : Promise<Function>[] = [];

	// async route (rule : []) : Promise<void> {
	//
	// }

	async use (middleware : Promise<Function>) : Promise<void> {
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
			// todo: check route rule

			return new Promise((resolve) => {
				this._http = http.createServer((req, res) => {
					res.end('ok');
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