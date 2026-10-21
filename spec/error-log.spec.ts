import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak, HttpError } from '../src';
import { TestPort } from './test-util';


describe('error log policy', () => {
	let app: Badak;
	let logs: unknown[][] = [];

	const originalConsoleError: typeof console.error = console.error;

	beforeEach(async () => {
		logs = [];

		console.error = (...args: unknown[]): void => {
			logs.push(args);
		};

		app = new Badak({
			catchErrorLog: true,
			bodyLimit: 10
		});

		await app.get('/http-4xx', (): never => {
			throw new HttpError(404);
		});

		await app.get('/http-5xx', (): never => {
			throw new HttpError(503);
		});

		await app.get('/error', (): never => {
			throw new Error('boom');
		});

		await app.get('/legacy', (): never => {
			throw new Error('Forbidden');
		});

		await app.post('/body', (): string => 'ok');
	});

	afterEach(async () => {
		console.error = originalConsoleError;

		if (app.isRunning()) {
			await app.stop();
		}
	});

	describe('not logged : 4xx HttpError and 4xx made by badak', () => {
		it('HttpError(404)', async () => {
			await app.listen(TestPort);
			await request(app.getHttpServer()).get('/http-4xx').expect(404);

			expect(logs).to.be.lengthOf(0);
		});

		it('no matched path (404)', async () => {
			await app.listen(TestPort);
			await request(app.getHttpServer()).get('/nothing').expect(404);

			expect(logs).to.be.lengthOf(0);
		});

		it('wrong method (405)', async () => {
			await app.listen(TestPort);
			await request(app.getHttpServer()).put('/error').expect(405);

			expect(logs).to.be.lengthOf(0);
		});

		it('malformed body (400)', async () => {
			await app.listen(TestPort);
			await request(app.getHttpServer())
				.post('/body')
				.set('Content-Type', 'application/json')
				.send('{bad')
				.expect(400);

			expect(logs).to.be.lengthOf(0);
		});

		it('body too large (413)', async () => {
			await app.listen(TestPort);
			await request(app.getHttpServer())
				.post('/body')
				.send({ a: '0123456789' })
				.expect(413);

			expect(logs).to.be.lengthOf(0);
		});
	});

	describe('logged : 5xx and general Error', () => {
		it('HttpError(503)', async () => {
			await app.listen(TestPort);
			await request(app.getHttpServer()).get('/http-5xx').expect(503);

			expect(logs).to.be.lengthOf(1);
		});

		it('Error (500)', async () => {
			await app.listen(TestPort);
			await request(app.getHttpServer()).get('/error').expect(500);

			expect(logs).to.be.lengthOf(1);
		});

		it('Error(\'Forbidden\') (403 by message mapping)', async () => {
			await app.listen(TestPort);
			await request(app.getHttpServer()).get('/legacy').expect(403);

			expect(logs).to.be.lengthOf(1);
		});

		it('Error from auth function (401)', async () => {
			await app.auth((): void => {
				throw new Error('db connection failed');
			});

			await app.listen(TestPort);
			await request(app.getHttpServer()).get('/http-4xx').expect(401);

			expect(logs).to.be.lengthOf(1);
		});
	});

	it('catchErrorLog: false logs nothing', async () => {
		await app.config('catchErrorLog', false);
		await app.listen(TestPort);

		await request(app.getHttpServer()).get('/error').expect(500);
		await request(app.getHttpServer()).get('/http-5xx').expect(503);

		expect(logs).to.be.lengthOf(0);
	});
});
