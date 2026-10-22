import { IncomingMessage, ServerResponse } from 'node:http';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response as SuperTestResponse } from 'supertest';

import { Badak, HttpError, isHttpError } from '../src';
import { TestPort } from './test-util';


describe('HttpError', () => {
	let app: Badak;

	beforeEach(() => {
		app = new Badak({
			catchErrorLog: false
		});
	});

	afterEach(() => {
		return app.isRunning()
			? app.stop()
			: Promise.resolve();
	});

	describe('constructor', () => {
		it('status & status text', () => {
			const err: HttpError = new HttpError(403);

			expect(err).to.be.instanceOf(Error);
			expect(err.status).to.be.eql(403);
			expect(err.message).to.be.eql('Forbidden');
			expect(err.name).to.be.eql('HttpError');
		});

		it('cause', () => {
			const cause: Error = new Error('original');

			expect(new HttpError(500, { cause }).cause).to.be.eql(cause);
		});

		[200, 302, 399, 600, 403.5, NaN].forEach((status: number): void => {
			it(`invalid status : ${ status }`, () => {
				expect(() => new HttpError(status)).to.throw(TypeError);
			});
		});
	});

	describe('isHttpError()', () => {
		it('HttpError instance', () => {
			expect(isHttpError(new HttpError(404))).to.be.true;
		});

		it('other values', () => {
			expect(isHttpError(new Error('Not Found'))).to.be.false;
			expect(isHttpError({ status: 404 })).to.be.false;
			expect(isHttpError(null)).to.be.false;
			expect(isHttpError('HttpError')).to.be.false;
		});

		it('fake brand with invalid properties', () => {
			const brand: symbol = Symbol.for('badak.HttpError');

			expect(isHttpError({ [brand]: true, status: 'x' })).to.be.false;
			expect(isHttpError({ [brand]: true, status: 200 })).to.be.false;
			expect(isHttpError({ [brand]: true, status: 404, headers: 5 })).to.be.false;
		});

		it('HttpError from another module instance (ESM & CJS)', () => {
			const fromOtherInstance: object = { [Symbol.for('badak.HttpError')]: true, status: 404 };

			expect(isHttpError(fromOtherInstance)).to.be.true;
		});
	});

	describe('response', () => {
		it('status text as body by default', async () => {
			await app.get('/test', (): never => {
				throw new HttpError(403);
			});

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/test')
				.expect(403, 'Forbidden')
				.expect('content-type', 'text/plain; charset=utf-8');
		});

		it('status code not in the old message mapping (418)', async () => {
			await app.get('/test', (): never => {
				throw new HttpError(418);
			});

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/test')
				.expect(418, 'I\'m a Teapot');
		});

		it('object body is sent as JSON', async () => {
			await app.post('/test', (): never => {
				throw new HttpError(422, { body: { field: 'email', reason: 'invalid' } });
			});

			await app.listen(TestPort);

			const res: SuperTestResponse = await request(app.getHttpServer())
				.post('/test')
				.expect(422)
				.expect('content-type', 'application/json');

			expect(res.body).to.be.eql({ field: 'email', reason: 'invalid' });
		});

		it('string body', async () => {
			await app.get('/test', (): never => {
				throw new HttpError(409, { body: '이미 존재합니다' });
			});

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/test')
				.expect(409, '이미 존재합니다');
		});

		it('headers', async () => {
			await app.get('/test', (): never => {
				throw new HttpError(429, { headers: { 'Retry-After': 60 } });
			});

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/test')
				.expect(429, 'Too Many Requests')
				.expect('retry-after', '60');
		});

		it('content-type in headers is kept', async () => {
			await app.get('/test', (): never => {
				throw new HttpError(400, {
					body: '{"problem":"x"}',
					headers: { 'Content-Type': 'application/problem+json' }
				});
			});

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/test')
				.expect(400)
				.expect('content-type', 'application/problem+json');
		});

		it('5xx with status text, internal message is not exposed', async () => {
			await app.get('/test', (): never => {
				throw new HttpError(503, { cause: new Error('db password=secret') });
			});

			await app.listen(TestPort);

			const res: SuperTestResponse = await request(app.getHttpServer())
				.get('/test')
				.expect(503, 'Service Unavailable');

			expect(res.text).not.to.include('secret');
		});

		it('async route function', async () => {
			await app.get('/test', async (): Promise<never> => {
				throw new HttpError(404, { body: { id: 'not found' } });
			});

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/test')
				.expect(404, { id: 'not found' });
		});
	});

	describe('body that res.end() can\'t send directly', () => {
		let unhandledCount: number = 0;

		const onUnhandled = (): void => {
			++unhandledCount;
		};

		beforeEach(() => {
			unhandledCount = 0;
			process.on('unhandledRejection', onUnhandled);
		});

		afterEach(async () => {
			// server should be still alive
			await request(app.getHttpServer())
				.get('/alive')
				.expect(200, 'alive');

			await new Promise((resolve) => setImmediate(resolve));
			process.off('unhandledRejection', onUnhandled);

			expect(unhandledCount).to.be.eql(0);
		});

		const listen = async (fnc: () => never): Promise<void> => {
			await app.get('/test', fnc);
			await app.get('/alive', (): string => 'alive');
			await app.listen(TestPort);
		};

		([
			[123, '123'],
			[false, 'false'],
			[[1, 2], '[1,2]']
		] as [number | boolean | number[], string][]).forEach(([body, expected]: [number | boolean | number[], string]): void => {
			it(`${ JSON.stringify(body) } is sent as JSON`, async () => {
				await listen((): never => {
					throw new HttpError(400, { body });
				});

				await request(app.getHttpServer())
					.get('/test')
					.expect(400)
					.expect('content-type', 'application/json')
					.then((res: SuperTestResponse): void => {
						expect(res.text).to.be.eql(expected);
					});
			});
		});

		it('null : status text', async () => {
			await listen((): never => {
				throw new HttpError(400, { body: null });
			});

			await request(app.getHttpServer())
				.get('/test')
				.expect(400, 'Bad Request');
		});

		it('circular reference : status text', async () => {
			await listen((): never => {
				const body: Record<string, unknown> = {};
				body.self = body;

				throw new HttpError(400, { body });
			});

			await request(app.getHttpServer())
				.get('/test')
				.expect(400, 'Bad Request');
		});

		it('Buffer', async () => {
			await listen((): never => {
				throw new HttpError(400, { body: Buffer.from('binary') });
			});

			await request(app.getHttpServer())
				.get('/test')
				.expect(400)
				.then((res: SuperTestResponse): void => {
					expect(res.text).to.be.eql('binary');
				});
		});

		it('thrown number (not HttpError) responds 500 with JSON', async () => {
			await listen((): never => {
				throw 123;
			});

			await request(app.getHttpServer())
				.get('/test')
				.expect(500)
				.expect('content-type', 'application/json')
				.then((res: SuperTestResponse): void => {
					expect(res.text).to.be.eql('123');
				});
		});

		it('invalid header value closes the connection, server keeps running', async () => {
			await listen((): never => {
				throw new HttpError(400, { headers: { 'X-Invalid': 'line\nbreak' } });
			});

			let failed: boolean = false;

			await request(app.getHttpServer())
				.get('/test')
				.catch((): void => {
					failed = true;
				});

			expect(failed).to.be.true;
		});
	});

	describe('middleware', () => {
		it('before()', async () => {
			let routeFncRunFlag: boolean = false;

			await app.before((): void => {
				throw new HttpError(403);
			});

			await app.get('/test', (): string => {
				routeFncRunFlag = true;
				return 'ok';
			});

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/test')
				.expect(403);

			expect(routeFncRunFlag).to.be.false;
		});

		it('auth() keeps the status code, not 401', async () => {
			await app.auth((): void => {
				throw new HttpError(403, { body: 'admin only' });
			});

			await app.get('/test', (): string => 'ok');
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/test')
				.expect(403, 'admin only');
		});

		it('after() receives the response body', async () => {
			let afterResponseBody: unknown;

			await app.after((req: IncomingMessage, res: ServerResponse, responseBody?: unknown): void => {
				afterResponseBody = responseBody;
			});

			await app.get('/test', (): never => {
				throw new HttpError(404);
			});

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/test')
				.expect(404);

			expect(afterResponseBody).to.be.eql('Not Found');
		});
	});

	// 5.0.0 : removed, use HttpError
	['Bad Request', 'Unauthorized', 'Unauthenticated', 'Forbidden', 'Not Found', 'no rule', 'Method Not Allowed', 'Not Acceptable', 'Payload Too Large'].forEach((message: string): void => {
		it(`Error('${ message }') is not mapped to a status code : 500`, async () => {
			await app.get('/test', (): never => {
				throw new Error(message);
			});

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/test')
				.expect(500, 'Internal Server Error');

			await app.stop();
		});
	});
});
