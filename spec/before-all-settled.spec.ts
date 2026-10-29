import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { HttpError } from '../src/http-error';
import { TestPort } from './test-util';

describe('before() allSettled', () => {
	let app: Badak;

	beforeEach(() => {
		app = new Badak({ catchErrorLog: false });
	});

	afterEach(async () => {
		if (app.isRunning()) {
			await app.stop(0);
		}
	});

	it('waits for every hook after a synchronous throw, without running the route', async () => {
		let completed = false;
		let routed = false;

		await app.before(() => {
			throw new HttpError(403);
		});
		await app.before(async () => {
			await new Promise<void>((resolve) => setTimeout(resolve, 30));
			completed = true;
		});
		await app.get('/test', () => {
			routed = true;
			return 'ok';
		});
		await app.listen(TestPort);

		await request(app.getHttpServer()).get('/test').expect(403);

		expect(completed).to.be.true;
		expect(routed).to.be.false;
	});

	it('chooses the first registered rejection, not the first rejection in time', async () => {
		let secondCompleted = false;

		await app.before(async () => {
			await new Promise<void>((resolve) => setTimeout(resolve, 30));
			throw new HttpError(403);
		});
		await app.before(async () => {
			secondCompleted = true;
			throw new HttpError(429);
		});
		await app.get('/test', () => 'unreachable');
		await app.listen(TestPort);

		await request(app.getHttpServer()).get('/test').expect(403);

		expect(secondCompleted).to.be.true;
	});

	it('waits for all successful hooks before executing the route', async () => {
		const completed: string[] = [];

		await app.before(async () => {
			await new Promise<void>((resolve) => setTimeout(resolve, 30));
			completed.push('first');
		});
		await app.before(async () => {
			completed.push('second');
		});
		await app.get('/test', () => completed.join(','));
		await app.listen(TestPort);

		await request(app.getHttpServer()).get('/test').expect(200, 'second,first');
	});
});
