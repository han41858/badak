import * as fs from 'node:fs';
import * as path from 'node:path';
import { Agent, IncomingMessage, request as httpRequest, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response as SuperTestResponse } from 'supertest';

import { Badak } from '../src/badak';
import { TestPort } from './test-util';


describe('Readable stream returned by route function', () => {
	let app: Badak;
	let unhandledCount: number = 0;

	const onUnhandled = (): void => {
		++unhandledCount;
	};

	beforeEach(() => {
		app = new Badak({
			catchErrorLog: false
		});

		unhandledCount = 0;
		process.on('unhandledRejection', onUnhandled);
	});

	afterEach(async () => {
		process.off('unhandledRejection', onUnhandled);
		expect(unhandledCount).to.be.eql(0);

		if (app.isRunning()) {
			await app.stop(0);
		}
	});

	// GET with raw http client, to see aborted responses
	const rawGet = (uri: string): Promise<{ status?: number, body: string, aborted: boolean }> => {
		return new Promise((resolve): void => {
			const req = httpRequest({ port: TestPort, path: uri }, (res: IncomingMessage): void => {
				let body: string = '';
				let aborted: boolean = false;

				res.on('data', (chunk: Buffer): void => {
					body += chunk.toString();
				});

				res.on('aborted', (): void => {
					aborted = true;
				});

				res.on('error', (): void => {
					aborted = true;
				});

				res.on('close', (): void => {
					resolve({ status: res.statusCode, body, aborted: aborted || !res.complete });
				});
			});

			req.on('error', (): void => {
				resolve({ body: '', aborted: true });
			});

			req.end();
		});
	};

	it('file stream, application/octet-stream by default', async () => {
		const filePath: string = path.join(__dirname, 'static', 'test.png');

		await app.get('/file', (): Readable => fs.createReadStream(filePath));
		await app.listen(TestPort);

		const res: SuperTestResponse = await request(app.getHttpServer())
			.get('/file')
			.buffer(true)
			.parse((response, callback): void => {
				const chunks: Buffer[] = [];
				response.on('data', (chunk: Buffer): number => chunks.push(chunk));
				response.on('end', (): void => callback(null, Buffer.concat(chunks)));
			})
			.expect(200)
			.expect('content-type', 'application/octet-stream');

		expect((res.body as Buffer).equals(fs.readFileSync(filePath))).to.be.true;
	});

	it('Content-Type set by route function is kept', async () => {
		await app.get('/text', (param: unknown, req: IncomingMessage, res: ServerResponse): Readable => {
			res.setHeader('Content-Type', 'text/plain; charset=utf-8');
			return Readable.from(['가', '나', '다']);
		});

		await app.listen(TestPort);

		await request(app.getHttpServer())
			.get('/text')
			.expect(200, '가나다')
			.expect('content-type', 'text/plain; charset=utf-8');
	});

	it('large stream is sent completely', async () => {
		const chunk: string = 'x'.repeat(64 * 1024);
		const count: number = 32; // 2MB

		await app.get('/large', (): Readable => {
			return Readable.from((function* (): Generator<string> {
				for (let i: number = 0; i < count; i++) {
					yield chunk;
				}
			})());
		});

		await app.listen(TestPort);

		const res = await rawGet('/large');

		expect(res.status).to.be.eql(200);
		expect(res.aborted).to.be.false;
		expect(res.body.length).to.be.eql(chunk.length * count);
	});

	it('stream error before sending data responds 500', async () => {
		await app.get('/error', (): Readable => {
			return new Readable({
				read (): void {
					this.destroy(new Error('read failed'));
				}
			});
		});

		await app.get('/alive', (): string => 'alive');
		await app.listen(TestPort);

		await request(app.getHttpServer())
			.get('/error')
			.expect(500, 'Internal Server Error');

		await request(app.getHttpServer())
			.get('/alive')
			.expect(200, 'alive');
	});

	it('stream error while sending data closes the connection', async () => {
		await app.get('/broken', (): Readable => {
			let sent: boolean = false;

			return new Readable({
				read (): void {
					if (!sent) {
						sent = true;
						this.push('partial');
					}
					else {
						setTimeout((): void => {
							this.destroy(new Error('read failed'));
						}, 10);
					}
				}
			});
		});

		await app.get('/alive', (): string => 'alive');
		await app.listen(TestPort);

		const res = await rawGet('/broken');

		// client can know the response is incomplete
		expect(res.aborted).to.be.true;

		await request(app.getHttpServer())
			.get('/alive')
			.expect(200, 'alive');
	});

	describe('stream is destroyed on error, even with autoDestroy: false', () => {
		it('error before sending data', async () => {
			let stream: Readable | undefined;

			await app.get('/error', (): Readable => {
				stream = new Readable({
					autoDestroy: false,
					read (): void {
						this.emit('error', new Error('read failed'));
					}
				});

				return stream;
			});

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/error')
				.expect(500);

			expect(stream?.destroyed).to.be.true;
		});

		it('error while sending data', async () => {
			let stream: Readable | undefined;

			await app.get('/broken', (): Readable => {
				let sent: boolean = false;

				stream = new Readable({
					autoDestroy: false,
					read (): void {
						if (!sent) {
							sent = true;
							this.push('partial');
						}
						else {
							setTimeout((): void => {
								this.emit('error', new Error('read failed'));
							}, 10);
						}
					}
				});

				return stream;
			});

			await app.listen(TestPort);

			const res = await rawGet('/broken');

			expect(res.aborted).to.be.true;
			expect(stream?.destroyed).to.be.true;
		});

		it('error after the response is finished doesn\'t affect the next request on the same connection', async () => {
			let stream: Readable | undefined;

			await app.get('/late', (param: unknown, req: IncomingMessage, res: ServerResponse): Readable => {
				res.setHeader('Content-Type', 'text/plain');

				stream = new Readable({
					autoDestroy: false,
					read (): void {
						this.push('done');
						this.push(null);
					}
				});

				setTimeout((): void => {
					stream?.emit('error', new Error('late error'));
				}, 30);

				return stream;
			});

			await app.get('/slow', async (): Promise<string> => {
				await new Promise((resolve) => setTimeout(resolve, 60));
				return 'slow';
			});

			await app.listen(TestPort);

			const agent: Agent = new Agent({ keepAlive: true, maxSockets: 1 });
			const sockets: Set<unknown> = new Set();

			const get = (uri: string): Promise<string> => {
				return new Promise((resolve, reject): void => {
					const req = httpRequest({ port: TestPort, path: uri, agent }, (res: IncomingMessage): void => {
						sockets.add(res.socket);

						let body: string = '';

						res.on('data', (chunk: Buffer): void => {
							body += chunk.toString();
						});

						res.on('end', (): void => resolve(body));
					});

					req.on('error', reject);
					req.end();
				});
			};

			try {
				expect(await get('/late')).to.be.eql('done');

				// late error is emitted while this request is being handled
				expect(await get('/slow')).to.be.eql('slow');

				expect(sockets.size).to.be.eql(1);
				expect(stream?.destroyed).to.be.true;
			}
			finally {
				agent.destroy();
			}
		});
	});

	it('client abort destroys the stream', async () => {
		let streamClosed: boolean = false;

		await app.get('/endless', (): Readable => {
			const stream: Readable = new Readable({
				read (): void {
					setTimeout((): void => {
						this.push('data');
					}, 5);
				}
			});

			stream.on('close', (): void => {
				streamClosed = true;
			});

			return stream;
		});

		await app.listen(TestPort);

		await new Promise<void>((resolve): void => {
			const req = httpRequest({ port: TestPort, path: '/endless' }, (res: IncomingMessage): void => {
				res.once('data', (): void => {
					req.destroy();
					resolve();
				});
			});

			req.on('error', (): void => {
				// destroyed by client
			});

			req.end();
		});

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(streamClosed).to.be.true;
	});

	it('HEAD doesn\'t read the stream', async () => {
		let readCalled: boolean = false;
		let streamClosed: boolean = false;

		await app.get('/file', (): Readable => {
			const stream: Readable = new Readable({
				read (): void {
					readCalled = true;
					this.push(null);
				}
			});

			stream.on('close', (): void => {
				streamClosed = true;
			});

			return stream;
		});

		await app.listen(TestPort);

		await request(app.getHttpServer())
			.head('/file')
			.expect(200)
			.expect('content-type', 'application/octet-stream');

		expect(readCalled).to.be.false;
		expect(streamClosed).to.be.true;
	});

	it('after() runs after the stream is finished', async () => {
		let streamEnded: boolean = false;
		let streamEndedInAfter: boolean | undefined;

		await app.after((): void => {
			streamEndedInAfter = streamEnded;
		});

		await app.get('/stream', (param: unknown, req: IncomingMessage, res: ServerResponse): Readable => {
			res.setHeader('Content-Type', 'text/plain');

			const stream: Readable = Readable.from(['a', 'b']);

			stream.on('end', (): void => {
				streamEnded = true;
			});

			return stream;
		});

		await app.listen(TestPort);

		await request(app.getHttpServer())
			.get('/stream')
			.expect(200, 'ab');

		expect(streamEndedInAfter).to.be.true;
	});
});
