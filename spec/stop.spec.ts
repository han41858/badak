import { Agent, IncomingMessage, request as httpRequest } from 'node:http';
import { Readable } from 'node:stream';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';

import { Badak } from '../src/badak';
import { TestPort } from './test-util';


// stop() with in-flight requests on keep-alive connections
// the connections became idle after the response, and stop() waited for them until keepAliveTimeout (5s) or the client closed them
describe('stop() with keep-alive connections', function () {
	// fails by assertions below, not by the mocha timeout
	this.timeout(10000);

	const handlerDelay: number = 300;
	const requestCount: number = 20;
	// keepAliveTimeout of Node.js is 5000ms, stop() took more than that
	const stopLimit: number = 2000;

	let app: Badak;
	let agent: Agent;

	const delay = (ms: number): Promise<void> => new Promise((resolve): void => {
		setTimeout(resolve, ms);
	});

	interface RawResult {
		status?: number;
		connection?: string;
		body: string;
		error?: string;
	}

	// the response or the error, never rejects
	const rawGet = (uri: string): Promise<RawResult> => {
		return new Promise((resolve): void => {
			const req = httpRequest({ port: TestPort, path: uri, agent }, (res: IncomingMessage): void => {
				let body: string = '';

				res.on('data', (chunk: Buffer): void => {
					body += chunk.toString();
				});

				res.on('end', (): void => {
					resolve({ status: res.statusCode, connection: res.headers.connection, body });
				});

				res.on('error', (err: Error): void => {
					resolve({ body, error: (err as NodeJS.ErrnoException).code ?? err.message });
				});
			});

			req.on('error', (err: Error): void => {
				resolve({ body: '', error: (err as NodeJS.ErrnoException).code ?? err.message });
			});

			req.end();
		});
	};

	// stop() resolves, the time from the call
	const timedStop = async (timeout?: number): Promise<number> => {
		const start: number = performance.now();

		await app.stop(timeout);

		return performance.now() - start;
	};

	beforeEach(async () => {
		app = new Badak({ catchErrorLog: false });
		// the client keeps the connections until the end of the test
		agent = new Agent({ keepAlive: true });

		await app.get('/slow', async (): Promise<string> => {
			await delay(handlerDelay);

			return 'ok';
		});

		await app.get('/stream', (): Readable => {
			const chunks: (string | null)[] = ['a', 'b', 'c', null];

			// headers and the first chunk are sent before stop(), the others after
			return new Readable({
				read (): void {
					const chunk: string | null | undefined = chunks.shift();

					if (chunk === 'a') {
						this.push(chunk);
					}
					else {
						setTimeout(() => this.push(chunk), 100);
					}
				}
			});
		});

		await app.get('/sse', (): Readable => {
			// never ends
			return new Readable({
				read (): void {
					// pushed nothing more
				}
			}).once('resume', function (this: Readable): void {
				this.push('data: 1\n\n');
			});
		});
	});

	afterEach(async () => {
		agent.destroy();

		if (app.isRunning()) {
			await app.stop(0);
		}
	});

	it('in-flight requests are completed, and stop() resolves without waiting for keepAliveTimeout', async () => {
		await app.listen(TestPort);

		const results: Promise<RawResult>[] = Array.from({ length: requestCount }, (): Promise<RawResult> => rawGet('/slow'));

		await delay(100);

		const elapsed: number = await timedStop();

		const responses: RawResult[] = await Promise.all(results);

		expect(elapsed).to.be.below(stopLimit);
		expect(app.isRunning()).to.be.false;

		// the connections are closed after the responses
		responses.forEach((result: RawResult): void => {
			expect(result).to.be.eql({ status: 200, connection: 'close', body: 'ok' });
		});
	});

	it('fetch() : in-flight requests are completed, and stop() resolves quickly', async () => {
		await app.listen(TestPort);

		const results: Promise<string>[] = Array.from({ length: requestCount }, async (): Promise<string> => {
			const res: Response = await fetch(`http://localhost:${ TestPort }/slow`);

			return `${ res.status } ${ await res.text() }`;
		});

		await delay(100);

		const elapsed: number = await timedStop();

		expect(await Promise.all(results)).to.be.eql(Array(requestCount).fill('200 ok'));
		expect(elapsed).to.be.below(stopLimit);
	});

	it('a streaming response started before stop() : completed, and stop() resolves quickly', async () => {
		await app.listen(TestPort);

		const results: Promise<RawResult>[] = Array.from({ length: 5 }, (): Promise<RawResult> => rawGet('/stream'));

		// headers are sent with 'Connection: keep-alive'
		await delay(50);

		const elapsed: number = await timedStop();

		const responses: RawResult[] = await Promise.all(results);

		responses.forEach((result: RawResult): void => {
			expect(result).to.be.eql({ status: 200, connection: 'keep-alive', body: 'abc' });
		});

		expect(elapsed).to.be.below(stopLimit);
	});

	it('idle keep-alive connections : stop() resolves quickly, and the server is restarted', async () => {
		await app.listen(TestPort);

		// the connections are kept by the agent after the responses
		const responses: RawResult[] = await Promise.all(Array.from({ length: 5 }, (): Promise<RawResult> => rawGet('/slow')));

		responses.forEach((result: RawResult): void => {
			expect(result).to.be.eql({ status: 200, connection: 'keep-alive', body: 'ok' });
		});

		expect(await timedStop()).to.be.below(stopLimit);

		// a new server, not stopping
		// a new client : the closed connections may not be removed from the agent yet
		agent.destroy();
		agent = new Agent({ keepAlive: true });

		await app.listen(TestPort);

		expect(await rawGet('/slow')).to.be.eql({ status: 200, connection: 'keep-alive', body: 'ok' });
	});

	it('timeout : a never ending response is closed after the timeout', async () => {
		await app.listen(TestPort);

		const result: Promise<RawResult> = rawGet('/sse');

		await delay(50);

		const elapsed: number = await timedStop(200);

		expect(elapsed).to.be.within(150, stopLimit);

		const closed: RawResult = await result;

		// aborted by the server
		expect(closed.body).to.be.eql('data: 1\n\n');
		expect(closed.error).to.be.a('string');
	});
});
