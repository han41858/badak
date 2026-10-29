import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { HttpError } from '../src/http-error';
import { TestPort } from './test-util';


// all before() middleware functions settle before routing or the error response
describe('before() middleware functions settle before routing or the error response', () => {
	let app: Badak;

	const delay = (ms: number): Promise<void> => new Promise((resolve): void => {
		setTimeout(resolve, ms);
	});

	beforeEach(() => {
		app = new Badak({ catchErrorLog: false });
	});

	afterEach(async () => {
		if (app.isRunning()) {
			await app.stop(0);
		}
	});

	it('waits for every hook after a synchronous throw, without running the route', async () => {
		let completed: boolean = false;
		let routed: boolean = false;

		await app.before((): void => {
			throw new HttpError(403);
		});

		await app.before(async (): Promise<void> => {
			await delay(30);

			completed = true;
		});

		await app.get('/test', (): string => {
			routed = true;

			return 'ok';
		});

		await app.listen(TestPort);

		await request(app.getHttpServer()).get('/test').expect(403);

		expect(completed).to.be.true;
		expect(routed).to.be.false;
	});

	it('an asynchronous failure : the error response and after() wait for a slower hook, its header is not written after the response', async () => {
		const events: string[] = [];
		let headerError: unknown;

		await app.before(async (): Promise<void> => {
			await delay(10);

			events.push('first rejects');

			throw new HttpError(403);
		});

		await app.before(async (_req, res): Promise<void> => {
			await delay(100);

			try {
				res.setHeader('x-slow', 'done');
			}
			catch (e) {
				headerError = e;
			}

			events.push('slow ends');
		});

		await app.after((): void => {
			events.push('after');
		});

		await app.get('/test', (): string => 'unreachable');
		await app.listen(TestPort);

		await request(app.getHttpServer())
			.get('/test')
			.expect(403)
			.expect('x-slow', 'done');

		expect(headerError).to.be.undefined;
		expect(events).to.be.eql(['first rejects', 'slow ends', 'after']);
	});

	it('chooses the first registered rejection, not the first rejection in time', async () => {
		let secondCompleted: boolean = false;

		await app.before(async (): Promise<void> => {
			await delay(30);

			throw new HttpError(403);
		});

		await app.before(async (): Promise<void> => {
			secondCompleted = true;

			throw new HttpError(429);
		});

		await app.get('/test', (): string => 'unreachable');
		await app.listen(TestPort);

		await request(app.getHttpServer()).get('/test').expect(403);

		expect(secondCompleted).to.be.true;
	});

	it('hooks are called in registration order', async () => {
		const called: string[] = [];

		await app.before((): void => {
			called.push('first');
		});

		await app.before((): void => {
			called.push('second');
		});

		await app.get('/test', (): string => called.join(','));
		await app.listen(TestPort);

		await request(app.getHttpServer()).get('/test').expect(200, 'first,second');
	});

	it('waits for all successful hooks before executing the route', async () => {
		const completed: string[] = [];

		await app.before(async (): Promise<void> => {
			await delay(30);

			completed.push('first');
		});

		await app.before((): void => {
			completed.push('second');
		});

		await app.get('/test', (): string => completed.join(','));
		await app.listen(TestPort);

		await request(app.getHttpServer()).get('/test').expect(200, 'second,first');
	});
});
