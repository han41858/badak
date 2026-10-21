import { IncomingMessage, request as httpRequest } from 'node:http';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Test } from 'supertest';

import { Badak } from '../src/badak';
import { RouteFunction, RouteOption } from '../src/interfaces';
import { promiseFail, TestPort } from './test-util';


describe('bodyLimit of RouteOption', () => {
	let app: Badak;
	let routeFncRunFlag: boolean = false;

	const routeFnc: RouteFunction = (): string => {
		routeFncRunFlag = true;
		return 'ok';
	};

	// {"a":"xxx..."} : 8 bytes + size
	const jsonOfSize = (size: number): string => {
		return JSON.stringify({ a: 'x'.repeat(size - 8) });
	};

	const postJson = (uri: string, size: number, method: 'post' | 'put' | 'patch' = 'post'): Test => {
		return request(app.getHttpServer())[method](uri)
			.set('Content-Type', 'application/json')
			.send(jsonOfSize(size));
	};

	// chunked transfer encoding, no content-length
	const sendChunked = (uri: string, body: string): Promise<number | undefined> => {
		return new Promise((resolve, reject): void => {
			const req = httpRequest({
				port: TestPort,
				method: 'POST',
				path: uri,
				headers: {
					'content-type': 'application/json'
				}
			}, (res: IncomingMessage): void => {
				res.resume();
				res.on('end', (): void => resolve(res.statusCode));
			});

			req.on('error', reject);

			for (let i: number = 0; i < body.length; i += 1024) {
				req.write(body.slice(i, i + 1024));
			}

			req.end();
		});
	};

	beforeEach(() => {
		app = new Badak({
			catchErrorLog: false,
			bodyLimit: 100
		});

		routeFncRunFlag = false;
	});

	afterEach(() => {
		return app.isRunning()
			? app.stop()
			: Promise.resolve();
	});

	describe('larger than the app option', () => {
		beforeEach(async () => {
			await app.post('/upload', routeFnc, { bodyLimit: 10 * 1024 });
			await app.post('/other', routeFnc);
			await app.listen(TestPort);
		});

		it('route with bodyLimit accepts up to its limit', async () => {
			await postJson('/upload', 10 * 1024).expect(200, 'ok');

			expect(routeFncRunFlag).to.be.true;
		});

		it('route with bodyLimit responds 413 over its limit', async () => {
			await postJson('/upload', 10 * 1024 + 1).expect(413);

			expect(routeFncRunFlag).to.be.false;
		});

		it('other route keeps the app option', async () => {
			await postJson('/other', 101).expect(413);

			expect(routeFncRunFlag).to.be.false;
		});

		it('chunked request without content-length', async () => {
			expect(await sendChunked('/upload', jsonOfSize(5 * 1024))).to.be.eql(200);
			expect(await sendChunked('/upload', jsonOfSize(20 * 1024))).to.be.eql(413);
		});

		it('multipart/form-data file upload', async () => {
			await request(app.getHttpServer())
				.post('/upload')
				.attach('file', Buffer.alloc(5 * 1024, 'a'), 'a.txt')
				.expect(200, 'ok');

			await request(app.getHttpServer())
				.post('/other')
				.attach('file', Buffer.alloc(5 * 1024, 'a'), 'a.txt')
				.expect(413);
		});
	});

	it('smaller than the app option', async () => {
		await app.config('bodyLimit', 10 * 1024);
		await app.post('/small', routeFnc, { bodyLimit: 50 });
		await app.listen(TestPort);

		await postJson('/small', 50).expect(200);
		await postJson('/small', 51).expect(413);
	});

	it('Infinity : no limit for the route', async () => {
		await app.post('/unlimited', routeFnc, { bodyLimit: Infinity });
		await app.listen(TestPort);

		await postJson('/unlimited', 200 * 1024).expect(200);
	});

	it('PUT, PATCH', async () => {
		await app.put('/put', routeFnc, { bodyLimit: 1024 });
		await app.patch('/patch', routeFnc, { bodyLimit: 1024 });
		await app.listen(TestPort);

		await postJson('/put', 1024, 'put').expect(200);
		await postJson('/put', 1025, 'put').expect(413);
		await postJson('/patch', 1024, 'patch').expect(200);
		await postJson('/patch', 1025, 'patch').expect(413);
	});

	it('route() with RouteFunctionObj', async () => {
		await app.route({
			'/upload': {
				POST: {
					fnc: routeFnc,
					option: { bodyLimit: 1024 }
				}
			},
			'/other': {
				POST: routeFnc
			}
		});

		await app.listen(TestPort);

		await postJson('/upload', 1024).expect(200);
		await postJson('/upload', 1025).expect(413);
		await postJson('/other', 101).expect(413);
	});

	it('same path, different limit for each method', async () => {
		await app.route({
			'/items': {
				POST: {
					fnc: routeFnc,
					option: { bodyLimit: 1024 }
				},
				PUT: routeFnc
			}
		});

		await app.listen(TestPort);

		await postJson('/items', 1024, 'post').expect(200);
		await postJson('/items', 1024, 'put').expect(413);
	});

	it('auth() runs if only bodyLimit is set', async () => {
		let authRunFlag: boolean = false;

		await app.auth((): void => {
			authRunFlag = true;
		});

		await app.post('/upload', routeFnc, { bodyLimit: 1024 });
		await app.listen(TestPort);

		await postJson('/upload', 500).expect(200);

		expect(authRunFlag).to.be.true;
	});

	it('with auth: false', async () => {
		let authRunFlag: boolean = false;

		await app.auth((): void => {
			authRunFlag = true;
		});

		await app.post('/upload', routeFnc, { auth: false, bodyLimit: 1024 });
		await app.listen(TestPort);

		await postJson('/upload', 500).expect(200);

		expect(authRunFlag).to.be.false;
	});

	describe('invalid value', () => {
		[0, -1, NaN, 0.5, -Infinity, '1000', true, null].forEach((value: unknown): void => {
			it(`post() : ${ String(value) }`, () => {
				return promiseFail(
					app.post('/test', routeFnc, { bodyLimit: value } as unknown as RouteOption)
				);
			});

			it(`route() : ${ String(value) }`, () => {
				return promiseFail(
					app.route({
						'/test': {
							POST: {
								fnc: routeFnc,
								option: { bodyLimit: value } as unknown as RouteOption
							}
						}
					})
				);
			});
		});

		it('invalid route is not registered', async () => {
			await promiseFail(
				app.post('/test', routeFnc, { bodyLimit: 0 })
			);

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.post('/test')
				.expect(404);
		});
	});
});
