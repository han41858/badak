import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response as SuperTestResponse } from 'supertest';

import { Badak } from '../src/badak';
import { TypedObject } from '../src/interfaces';
import { echoFnc, TestPort } from './test-util';


describe('regression', () => {
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


	describe('malformed request body should not hang', () => {
		let unhandledCount: number = 0;

		const onUnhandled = (): void => {
			++unhandledCount;
		};

		beforeEach(async () => {
			unhandledCount = 0;
			process.on('unhandledRejection', onUnhandled);

			await app.post('/test', echoFnc);
			await app.listen(TestPort);
		});

		afterEach(() => {
			process.off('unhandledRejection', onUnhandled);
		});

		it('invalid JSON responds 400', async () => {
			await request(app.getHttpServer())
				.post('/test')
				.set('Content-Type', 'application/json')
				.send('{invalid')
				.timeout(500)
				.expect(400);

			expect(unhandledCount).to.be.eql(0);
		});

		it('multipart/form-data without boundary responds 400', async () => {
			await request(app.getHttpServer())
				.post('/test')
				.set('Content-Type', 'multipart/form-data')
				.send('some body')
				.timeout(500)
				.expect(400);

			expect(unhandledCount).to.be.eql(0);
		});

		it('valid JSON still works', async () => {
			const res: SuperTestResponse = await request(app.getHttpServer())
				.post('/test')
				.send({ a: 1 })
				.timeout(500)
				.expect(200);

			expect(res.body).to.be.eql({ a: 1 } as TypedObject<unknown>);
		});
	});
});
