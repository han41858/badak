import { connect, Socket } from 'node:net';
import { ServerResponse } from 'node:http';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { ParamContext } from '../src/interfaces';
import { isClientAbortError } from '../src/util';
import { TestPort } from './test-util';


// the client closes the connection : not a server error, nothing can be responded
describe('client closes the connection', () => {
	describe('isClientAbortError()', () => {
		const resOf = (destroyed: boolean): ServerResponse => ({ destroyed }) as unknown as ServerResponse;

		const aborted: Error = Object.assign(new Error('aborted'), { code: 'ECONNRESET' });

		([
			['connection open, ECONNRESET', resOf(false), aborted, false],
			['connection closed, aborted (ECONNRESET)', resOf(true), aborted, true],
			['connection closed, EPIPE', resOf(true), Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }), true],
			['connection closed, ECONNABORTED', resOf(true), Object.assign(new Error('x'), { code: 'ECONNABORTED' }), true],
			['connection closed, ERR_STREAM_PREMATURE_CLOSE', resOf(true), Object.assign(new Error('x'), { code: 'ERR_STREAM_PREMATURE_CLOSE' }), true],
			['connection closed, message aborted without code', resOf(true), new Error('aborted'), true],
			['connection closed, other error', resOf(true), new Error('boom'), false],
			['connection closed, not an Error', resOf(true), 'aborted', false],
			['connection closed, null', resOf(true), null, false]
		] as [string, ServerResponse, unknown, boolean][]).forEach(([name, res, err, expected]: [string, ServerResponse, unknown, boolean]): void => {
			it(`${ name } -> ${ expected }`, () => {
				expect(isClientAbortError(res, err)).to.be.eql(expected);
			});
		});
	});

	describe('HTTP', () => {
		let app: Badak;
		let logs: unknown[][];
		let unhandled: unknown[];

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

			process.on('unhandledRejection', onUnhandledRejection);
		});

		afterEach(async () => {
			console.error = originalConsoleError;
			process.off('unhandledRejection', onUnhandledRejection);

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
