import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak, HttpError } from '../src';
import { TestPort } from './test-util';


describe('catchErrorLog policy', () => {
	let app: Badak;

	const originalConsoleError: typeof console.error = console.error;
	let loggedCount: number = 0;

	beforeEach(() => {
		loggedCount = 0;

		console.error = (): void => {
			++loggedCount;
		};

		// catchErrorLog : true by default
		app = new Badak();
	});

	afterEach(async () => {
		console.error = originalConsoleError;

		if (app.isRunning()) {
			await app.stop();
		}
	});

	const requestWith = async (thrown: () => unknown, method: 'get' | 'post' = 'get'): Promise<void> => {
		await app[method]('/test', (): never => {
			throw thrown();
		});

		await app.listen(TestPort);

		await request(app.getHttpServer())[method]('/test');
	};

	describe('not logged : 4xx HttpError', () => {
		[400, 403, 404, 422, 429].forEach((status: number): void => {
			it(`HttpError(${ status })`, async () => {
				await requestWith(() => new HttpError(status));

				expect(loggedCount).to.be.eql(0);
			});
		});

		it('unmatched path (404)', async () => {
			await app.listen(TestPort);
			await request(app.getHttpServer()).get('/nothing').expect(404, 'Not Found');

			expect(loggedCount).to.be.eql(0);
		});

		it('method not allowed (405)', async () => {
			await app.post('/test', (): string => 'ok');
			await app.listen(TestPort);
			await request(app.getHttpServer()).get('/test').expect(405).expect('Allow', 'POST');

			expect(loggedCount).to.be.eql(0);
		});

		it('malformed JSON body (400)', async () => {
			await app.post('/test', (): string => 'ok');
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.post('/test')
				.set('Content-Type', 'application/json')
				.send('{invalid')
				.expect(400, 'Bad Request');

			expect(loggedCount).to.be.eql(0);
		});

		it('payload too large (413)', async () => {
			await app.config('bodyLimit', 10);
			await app.post('/test', (): string => 'ok');
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.post('/test')
				.send({ a: 'x'.repeat(100) })
				.expect(413);

			expect(loggedCount).to.be.eql(0);
		});
	});

	describe('logged : 5xx HttpError and others', () => {
		[500, 503].forEach((status: number): void => {
			it(`HttpError(${ status })`, async () => {
				await requestWith(() => new HttpError(status));

				expect(loggedCount).to.be.eql(1);
			});
		});

		it('Error', async () => {
			await requestWith(() => new Error('boom'));

			expect(loggedCount).to.be.eql(1);
		});

		it('Error with status text message (message mapping)', async () => {
			await requestWith(() => new Error('Forbidden'));

			expect(loggedCount).to.be.eql(1);
		});

		it('thrown non-Error value', async () => {
			await requestWith(() => 123);

			expect(loggedCount).to.be.eql(1);
		});

		it('auth() throws Error (401)', async () => {
			await app.auth((): void => {
				throw new Error('token expired');
			});

			await app.get('/test', (): string => 'ok');
			await app.listen(TestPort);
			await request(app.getHttpServer()).get('/test').expect(401);

			expect(loggedCount).to.be.eql(1);
		});
	});

	it('nothing is logged with catchErrorLog: false', async () => {
		app = new Badak({ catchErrorLog: false });

		await requestWith(() => new HttpError(500));

		expect(loggedCount).to.be.eql(0);
	});
});
