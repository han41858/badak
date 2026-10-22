import { connect, Socket } from 'node:net';
import { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { ParamContext } from '../src/interfaces';
import { ClientAbortError, receiveBody } from '../src/body-parser';
import { TestPort } from './test-util';


// the client closes the connection : not a server error, nothing can be responded
describe('client closes the connection', () => {
	describe('receiveBody()', () => {
		// IncomingMessage-like readable stream
		const fakeReq = (): IncomingMessage => {
			const stream: Readable = new Readable({ read (): void { /* pushed by the test */ } });

			return Object.assign(stream, { headers: { 'content-length': '100' } }) as unknown as IncomingMessage;
		};

		const resetError = (): Error => Object.assign(new Error('aborted'), { code: 'ECONNRESET' });

		it('destroyed with ECONNRESET while receiving : ClientAbortError', async () => {
			const req: IncomingMessage = fakeReq();
			const received: Promise<Buffer> = receiveBody(req, 1000);

			req.push('{"a":');
			req.destroy(resetError());

			const err: unknown = await received.then(() => undefined, (e: unknown) => e);

			expect(err).to.be.instanceof(ClientAbortError);
			expect((err as Error).cause).to.be.instanceof(Error);
		});

		it('destroyed before receiving (e.g. during async auth()) : ClientAbortError, not waiting forever', async () => {
			const req: IncomingMessage = fakeReq();

			req.on('error', (): void => {
				// emitted before receiveBody() listens
			});

			req.destroy(resetError());
			await new Promise((resolve): void => {
				setImmediate(resolve);
			});

			const err: unknown = await receiveBody(req, 1000).then(() => undefined, (e: unknown) => e);

			expect(err).to.be.instanceof(ClientAbortError);
		});

		it('closed without an error : ClientAbortError', async () => {
			const req: IncomingMessage = fakeReq();
			const received: Promise<Buffer> = receiveBody(req, 1000);

			req.destroy();

			const err: unknown = await received.then(() => undefined, (e: unknown) => e);

			expect(err).to.be.instanceof(ClientAbortError);
		});

		[
			Object.assign(new Error('internal failure'), { code: 'EPIPE' }),
			new Error('aborted'),
			new Error('boom')
		].forEach((original: Error): void => {
			it(`other stream error is not classified : ${ original.message } (${ (original as { code?: string }).code ?? 'no code' })`, async () => {
				const req: IncomingMessage = fakeReq();
				const received: Promise<Buffer> = receiveBody(req, 1000);

				req.destroy(original);

				const err: unknown = await received.then(() => undefined, (e: unknown) => e);

				expect(err).to.be.equal(original);
				expect(err).to.not.be.instanceof(ClientAbortError);
			});
		});

		it('normal body : resolves', async () => {
			const req: IncomingMessage = fakeReq();
			const received: Promise<Buffer> = receiveBody(req, 1000);

			req.push('{"a":1}');
			req.push(null);

			expect((await received).toString()).to.be.eql('{"a":1}');
		});
	});

	describe('HTTP', () => {
		let app: Badak;
		let logs: unknown[][];
		let unhandled: unknown[];
		let savedListeners: NodeJS.UnhandledRejectionListener[] = [];

		const originalConsoleError: typeof console.error = console.error;

		const onUnhandledRejection = (reason: unknown): void => {
			unhandled.push(reason);
		};

		const wait = (ms: number): Promise<void> => new Promise((resolve): void => {
			setTimeout(resolve, ms);
		});

		// send a part of the declared body, then close the connection
		const abortWhileSendingBody = (): Promise<void> => {
			return new Promise((resolve): void => {
				const socket: Socket = connect(TestPort, '127.0.0.1', (): void => {
					socket.write('POST /upload HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100000\r\n\r\n{"a":');

					setTimeout((): void => {
						socket.destroy();
						resolve();
					}, 30);
				});
			});
		};

		beforeEach(() => {
			logs = [];
			unhandled = [];

			console.error = (...args: unknown[]): void => {
				logs.push(args);
			};

			// keep mocha's handler away, unhandled rejections are checked by the tests
			savedListeners = process.listeners('unhandledRejection');
			process.removeAllListeners('unhandledRejection');
			process.on('unhandledRejection', onUnhandledRejection);
		});

		afterEach(async () => {
			console.error = originalConsoleError;
			process.off('unhandledRejection', onUnhandledRejection);
			savedListeners.forEach((listener: NodeJS.UnhandledRejectionListener): void => {
				process.on('unhandledRejection', listener);
			});

			if (app.isRunning()) {
				await app.stop(0);
			}
		});

		[true, false].forEach((preventError: boolean): void => {
			it(`while sending the body : not logged, no response, after() runs, preventError: ${ preventError }`, async () => {
				let routeFncRunFlag: boolean = false;
				const afterCalls: { writableEnded: boolean, body: unknown }[] = [];

				app = new Badak({ catchErrorLog: true, preventError });

				await app.after((req, res, body): void => {
					afterCalls.push({ writableEnded: res.writableEnded, body });
				});

				await app.post('/upload', (): string => {
					routeFncRunFlag = true;
					return 'ok';
				});

				await app.get('/alive', (): string => 'alive');
				await app.listen(TestPort);

				await abortWhileSendingBody();
				await wait(100);

				expect(routeFncRunFlag).to.be.false;
				expect(logs).to.be.eql([]);
				expect(unhandled).to.be.eql([]);

				// after() runs, the response is not completed
				expect(afterCalls).to.be.eql([{ writableEnded: false, body: undefined }]);

				await request(app.getHttpServer())
					.get('/alive')
					.expect(200, 'alive');
			});
		});

		it('a server error after the client closed the connection is still logged, without a response', async () => {
			app = new Badak({ catchErrorLog: true });

			await app.get('/slow-error', async (): Promise<never> => {
				await wait(80);
				throw new Error('boom');
			});

			await app.listen(TestPort);

			await new Promise<void>((resolve): void => {
				const socket: Socket = connect(TestPort, '127.0.0.1', (): void => {
					socket.write('GET /slow-error HTTP/1.1\r\nHost: localhost\r\n\r\n');

					setTimeout((): void => {
						socket.destroy();
						resolve();
					}, 20);
				});
			});

			await wait(150);

			expect(logs).to.be.lengthOf(1);
			expect(String(logs[0][0])).to.include('badak catch error');
			expect(unhandled).to.be.eql([]);
		});

		// errors thrown by server code are not hidden, even if the connection is closed and the code looks like a connection error
		[
			['EPIPE', Object.assign(new Error('internal failure'), { code: 'EPIPE' })],
			['ECONNRESET', Object.assign(new Error('upstream reset'), { code: 'ECONNRESET' })],
			['message aborted', new Error('aborted')]
		].forEach(([name, thrown]: (string | Error)[]): void => {
			[true, false].forEach((preventError: boolean): void => {
				it(`handler error after the client closed the connection (${ name as string }) : logged, preventError: ${ preventError }`, async () => {
					app = new Badak({ catchErrorLog: true, preventError });

					await app.get('/slow-error', async (): Promise<never> => {
						await wait(80);
						throw thrown;
					});

					await app.listen(TestPort);

					await new Promise<void>((resolve): void => {
						const socket: Socket = connect(TestPort, '127.0.0.1', (): void => {
							socket.write('GET /slow-error HTTP/1.1\r\nHost: localhost\r\n\r\n');

							setTimeout((): void => {
								socket.destroy();
								resolve();
							}, 20);
						});
					});

					await wait(150);

					expect(logs).to.be.lengthOf(1);
					expect(logs[0][1]).to.be.equal(thrown);

					// passed to Node.js only with preventError: false, as before
					expect(unhandled).to.be.eql(preventError ? [] : [thrown]);
				});
			});
		});

		it('client closes the connection during async auth() : not logged, after() runs, not waiting forever', async () => {
			let afterRunFlag: boolean = false;

			app = new Badak({ catchErrorLog: true });

			await app.auth(async (): Promise<void> => {
				await wait(80);
			});

			await app.after((): void => {
				afterRunFlag = true;
			});

			await app.post('/upload', (): string => 'ok');
			await app.listen(TestPort);

			await abortWhileSendingBody();
			await wait(150);

			expect(afterRunFlag).to.be.true;
			expect(logs).to.be.eql([]);
			expect(unhandled).to.be.eql([]);
		});

		it('other errors are logged and responded as before', async () => {
			app = new Badak({ catchErrorLog: true });

			await app.post('/json', ({ body }: ParamContext): unknown => body);
			await app.get('/error', (): never => {
				throw new Error('boom');
			});

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/error')
				.expect(500);

			expect(logs).to.be.lengthOf(1);
		});
	});
});
