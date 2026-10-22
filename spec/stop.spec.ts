import { Agent, IncomingMessage, request as httpRequest } from 'node:http';
import { connect, Socket } from 'node:net';
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

	// requests are sent on one connection without waiting for the responses
	// 'Connection: close' to a response drops the responses of the requests after it, Node.js closes the connection
	describe('HTTP pipelining : requests on one connection', () => {
		interface PipelinedResult {
			// status lines of the responses, in order
			statuses: string[];
			data: string;
			error?: string;
		}

		const requestOf = (uri: string): string => `GET ${ uri } HTTP/1.1\r\nHost: localhost\r\n\r\n`;

		// sends the first requests, calls stop() after 50ms, and sends the late requests 50ms after stop()
		const pipelined = async (uris: string[], lateUris: string[] = []): Promise<{ elapsed: number, result: PipelinedResult }> => {
			const socket: Socket = connect(TestPort);
			let data: string = '';
			let error: string | undefined;

			socket.on('data', (chunk: Buffer): void => {
				data += chunk.toString();
			});

			socket.on('error', (err: NodeJS.ErrnoException): void => {
				error = err.code ?? err.message;
			});

			const closed: Promise<void> = new Promise((resolve): void => {
				socket.once('close', (): void => resolve());
			});

			socket.write(uris.map(requestOf).join(''));

			await delay(50);

			const stopped: Promise<number> = timedStop();

			if (lateUris.length > 0) {
				await delay(50);

				socket.write(lateUris.map(requestOf).join(''));
			}

			const elapsed: number = await stopped;

			// closed by the server
			await closed;

			const statuses: string[] = data.match(/HTTP\/1\.1 \d+/g) ?? [];

			return { elapsed, result: { statuses, data, ...(error === undefined ? {} : { error }) } };
		};

		beforeEach(async () => {
			await app.get('/first', async (): Promise<string> => {
				await delay(handlerDelay);

				return 'FIRST';
			});

			// finished after /first
			await app.get('/second', async (): Promise<string> => {
				await delay(handlerDelay + 100);

				return 'SECOND';
			});

			// finished before /first, the response waits for it
			await app.get('/fast', (): string => 'FAST');

			await app.get('/chunks', (): Readable => {
				const chunks: (string | null)[] = ['C1', 'C2', 'C3', null];

				return new Readable({
					read (): void {
						const chunk: string | null | undefined = chunks.shift();

						if (chunk === 'C1') {
							this.push(chunk);
						}
						else {
							setTimeout(() => this.push(chunk), 100);
						}
					}
				});
			});

			await app.listen(TestPort);
		});

		// responses : the number of responses, bodies : the parts of the bodies in order
		const expectBodies = (result: PipelinedResult, responses: number, bodies: string[]): void => {
			expect(result.statuses).to.be.eql(Array(responses).fill('HTTP/1.1 200'));

			// in order
			let index: number = -1;

			bodies.forEach((body: string): void => {
				const next: number = result.data.indexOf(body, index + 1);

				expect(next, `${ body } in ${ JSON.stringify(result.data) }`).to.be.above(index);

				index = next;
			});

			expect(result.error).to.be.undefined;
		};

		it('a streaming response and a finished response after it : both are sent', async () => {
			const { elapsed, result } = await pipelined(['/chunks', '/fast']);

			expect(elapsed).to.be.below(stopLimit);
			expectBodies(result, 2, ['C1', 'C2', 'C3', 'FAST']);
		});

		it('an in-flight response and a finished response after it : both are sent', async () => {
			const { elapsed, result } = await pipelined(['/first', '/fast']);

			expect(elapsed).to.be.below(stopLimit);
			expectBodies(result, 2, ['FIRST', 'FAST']);
		});

		it('two in-flight responses : both are sent, the connection is not closed after the first one', async () => {
			const { elapsed, result } = await pipelined(['/first', '/second']);

			expect(elapsed).to.be.below(stopLimit);
			expectBodies(result, 2, ['FIRST', 'SECOND']);
		});

		it('a request received after stop(), before the in-flight response : both are sent', async () => {
			const { elapsed, result } = await pipelined(['/first'], ['/fast']);

			expect(elapsed).to.be.below(stopLimit);
			expectBodies(result, 2, ['FIRST', 'FAST']);
		});
	});
});
