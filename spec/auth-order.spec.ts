import { Agent, IncomingMessage, request as httpRequest } from 'node:http';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { ParamContext } from '../src/interfaces';
import { HttpError } from '../src/http-error';
import { TestPort } from './test-util';


describe('auth() runs before receiving the request body', () => {
	let app: Badak;
	let routeFncRunFlag: boolean = false;

	beforeEach(() => {
		app = new Badak({
			catchErrorLog: false
		});

		routeFncRunFlag = false;
	});

	afterEach(() => {
		return app.isRunning()
			? app.stop(0)
			: Promise.resolve();
	});

	const routeFnc = (ctx: ParamContext): unknown => {
		routeFncRunFlag = true;
		return ctx.body;
	};

	it('responds before the client sends the rest of the body', async () => {
		await app.auth((): void => {
			throw new HttpError(401);
		});

		await app.post('/upload', routeFnc, { bodyLimit: 10 * 1024 * 1024 });
		await app.listen(TestPort);

		// send only a part of the declared body, and wait for the response
		const status: number | undefined = await new Promise((resolve, reject): void => {
			const req = httpRequest({
				port: TestPort,
				method: 'POST',
				path: '/upload',
				headers: {
					'content-type': 'application/octet-stream',
					'content-length': 10 * 1024 * 1024
				}
			}, (res: IncomingMessage): void => {
				res.resume();
				resolve(res.statusCode);
				req.destroy();
			});

			req.on('error', (err: Error): void => {
				// destroyed after the response
				if (!req.destroyed) {
					reject(err);
				}
			});

			req.write(Buffer.alloc(1024));
		});

		expect(status).to.be.eql(401);
		expect(routeFncRunFlag).to.be.false;
	});

	it('401 instead of 413 for unauthenticated request over bodyLimit', async () => {
		await app.config('bodyLimit', 100);

		await app.auth((): void => {
			throw new HttpError(401);
		});

		await app.post('/test', routeFnc);
		await app.listen(TestPort);

		await request(app.getHttpServer())
			.post('/test')
			.set('Content-Type', 'application/json')
			.send({ a: 'x'.repeat(1000) })
			.expect(401);
	});

	it('401 instead of 400 for unauthenticated request with malformed JSON', async () => {
		await app.auth((): void => {
			throw new HttpError(401);
		});

		await app.post('/test', routeFnc);
		await app.listen(TestPort);

		await request(app.getHttpServer())
			.post('/test')
			.set('Content-Type', 'application/json')
			.send('{ invalid')
			.expect(401);
	});

	it('auth() responds by itself, the body is not parsed', async () => {
		await app.auth((req: IncomingMessage, res): void => {
			res.statusCode = 403;
			res.end('no');
		});

		await app.post('/test', routeFnc);
		await app.listen(TestPort);

		await request(app.getHttpServer())
			.post('/test')
			.set('Content-Type', 'application/json')
			.send('{ invalid')
			.expect(403, 'no');

		expect(routeFncRunFlag).to.be.false;
	});

	it('authenticated request : body is parsed as before', async () => {
		await app.auth((): void => {
			// pass
		});

		await app.post('/test', routeFnc);
		await app.listen(TestPort);

		await request(app.getHttpServer())
			.post('/test')
			.set('Content-Type', 'application/json')
			.send({ a: 1 })
			.expect(200, { a: 1 });
	});

	it('async auth() : body is parsed after it resolves', async () => {
		await app.auth(async (): Promise<void> => {
			await new Promise((resolve) => setTimeout(resolve, 30));
		});

		await app.post('/test', routeFnc);
		await app.listen(TestPort);

		await request(app.getHttpServer())
			.post('/test')
			.set('Content-Type', 'application/json')
			.send({ a: 'x'.repeat(50 * 1024) })
			.expect(200)
			.then((res): void => {
				expect(res.body.a.length).to.be.eql(50 * 1024);
			});
	});

	it('keep-alive connection is usable after the unread body is discarded', async () => {
		let authCount: number = 0;

		await app.auth((): void => {
			if (++authCount === 1) {
				throw new HttpError(401);
			}
		});

		await app.post('/test', routeFnc);
		await app.listen(TestPort);

		const agent: Agent = new Agent({ keepAlive: true, maxSockets: 1 });
		const sockets: Set<unknown> = new Set();

		const post = (body: string): Promise<{ status?: number, body: string }> => {
			return new Promise((resolve, reject): void => {
				const req = httpRequest({
					port: TestPort,
					method: 'POST',
					path: '/test',
					agent,
					headers: {
						'content-type': 'application/json',
						'content-length': Buffer.byteLength(body)
					}
				}, (res: IncomingMessage): void => {
					sockets.add(res.socket);

					let resBody: string = '';

					res.on('data', (chunk: Buffer): void => {
						resBody += chunk.toString();
					});

					res.on('end', (): void => resolve({ status: res.statusCode, body: resBody }));
				});

				req.on('error', reject);
				req.end(body);
			});
		};

		try {
			expect((await post(JSON.stringify({ a: 'x'.repeat(10 * 1024) }))).status).to.be.eql(401);
			expect(await post(JSON.stringify({ b: 2 }))).to.be.eql({ status: 200, body: '{"b":2}' });
			expect(sockets.size).to.be.eql(1);
		}
		finally {
			agent.destroy();
		}
	});

	it('auth: false route : body is parsed without auth()', async () => {
		let authRunFlag: boolean = false;

		await app.auth((): void => {
			authRunFlag = true;
			throw new HttpError(401);
		});

		await app.post('/public', routeFnc, { auth: false });
		await app.listen(TestPort);

		await request(app.getHttpServer())
			.post('/public')
			.set('Content-Type', 'application/json')
			.send({ a: 1 })
			.expect(200, { a: 1 });

		expect(authRunFlag).to.be.false;
	});

	describe('body read by a middleware function responds 500, not hang', () => {
		const readBody = (req: IncomingMessage): Promise<void> => {
			return new Promise((resolve): void => {
				req.resume();
				req.on('end', resolve);
			});
		};

		it('auth()', async () => {
			await app.auth(readBody);
			await app.post('/test', routeFnc);
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.post('/test')
				.set('Content-Type', 'application/json')
				.send({ a: 1 })
				.timeout(500)
				.expect(500);

			expect(routeFncRunFlag).to.be.false;
		});

		it('before()', async () => {
			await app.before(readBody);
			await app.post('/test', routeFnc);
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.post('/test')
				.set('Content-Type', 'application/json')
				.send({ a: 1 })
				.timeout(500)
				.expect(500);
		});
	});
});
