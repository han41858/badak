import { connect, Socket } from 'node:net';
import { IncomingMessage, request as httpRequest } from 'node:http';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { ParamContext } from '../src/interfaces';
import { TestPort } from './test-util';


// HTTP requests on the boundary : broken connections, framing, limits, unusual request targets
describe('HTTP boundary conditions', () => {
	let app: Badak;

	beforeEach(() => {
		app = new Badak({
			catchErrorLog: false
		});
	});

	afterEach(() => {
		return app.isRunning()
			? app.stop(0)
			: Promise.resolve();
	});

	// send raw bytes, resolves with the raw response when the server closes the connection
	const sendRaw = (data: string): Promise<string> => {
		return new Promise((resolve, reject): void => {
			const socket: Socket = connect(TestPort, '127.0.0.1');
			let response: string = '';

			socket.on('data', (chunk: Buffer): void => {
				response += chunk.toString();
			});

			socket.on('end', (): void => resolve(response));
			socket.on('error', reject);

			socket.write(data);
		});
	};

	const statusLine = (response: string): string => response.split('\r\n')[0];

	const wait = (ms: number): Promise<void> => new Promise((resolve): void => {
		setTimeout(resolve, ms);
	});

	describe('client closes the connection while sending the body', () => {
		it('routing function is not executed, after() runs, and the server keeps serving', async () => {
			let routeFncRunFlag: boolean = false;
			let afterRunFlag: boolean = false;

			await app.after((): void => {
				afterRunFlag = true;
			});

			await app.post('/upload', (): string => {
				routeFncRunFlag = true;
				return 'ok';
			});

			await app.get('/alive', (): string => 'alive');
			await app.listen(TestPort);

			await new Promise<void>((resolve): void => {
				const socket: Socket = connect(TestPort, '127.0.0.1', (): void => {
					socket.write('POST /upload HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100000\r\n\r\n{"a":');

					setTimeout((): void => {
						socket.destroy();
						resolve();
					}, 50);
				});
			});

			await wait(100);

			expect(routeFncRunFlag).to.be.false;
			expect(afterRunFlag).to.be.true;

			await request(app.getHttpServer())
				.get('/alive')
				.expect(200, 'alive');
		});

		it('client closes the connection before the response of a slow routing function', async () => {
			let finished: boolean = false;

			await app.get('/slow', async (): Promise<string> => {
				await wait(100);
				finished = true;

				return 'late';
			});

			await app.get('/alive', (): string => 'alive');
			await app.listen(TestPort);

			await new Promise<void>((resolve): void => {
				const req = httpRequest({ port: TestPort, path: '/slow' });

				req.on('error', (): void => resolve());
				req.end();

				setTimeout((): void => {
					req.destroy();
				}, 20);
			});

			await wait(150);

			expect(finished).to.be.true;

			await request(app.getHttpServer())
				.get('/alive')
				.expect(200, 'alive');
		});
	});

	describe('chunked request body', () => {
		it('JSON body in chunks is parsed', async () => {
			await app.post('/echo', ({ body }: ParamContext): unknown => body);
			await app.listen(TestPort);

			const response: string = await sendRaw([
				'POST /echo HTTP/1.1',
				'Host: localhost',
				'Content-Type: application/json',
				'Transfer-Encoding: chunked',
				'Connection: close',
				'',
				'3', '{"a', '4', '":1}', '0', '', ''
			].join('\r\n'));

			expect(statusLine(response)).to.be.eql('HTTP/1.1 200 OK');
			expect(response.endsWith('{"a":1}')).to.be.true;
		});

		it('empty chunked body : body is undefined', async () => {
			await app.post('/echo', ({ body }: ParamContext): unknown => ({ isUndefined: body === undefined }));
			await app.listen(TestPort);

			const response: string = await sendRaw([
				'POST /echo HTTP/1.1',
				'Host: localhost',
				'Content-Type: application/json',
				'Transfer-Encoding: chunked',
				'Connection: close',
				'',
				'0', '', ''
			].join('\r\n'));

			expect(statusLine(response)).to.be.eql('HTTP/1.1 200 OK');
			expect(response.endsWith('{"isUndefined":true}')).to.be.true;
		});
	});

	describe('limits of Node.js http', () => {
		it('too large request header : 431, the server keeps serving', async () => {
			await app.get('/alive', (): string => 'alive');
			await app.listen(TestPort);

			const response: string = await sendRaw(`GET /alive HTTP/1.1\r\nHost: localhost\r\nX-Large: ${ 'a'.repeat(20 * 1024) }\r\n\r\n`);

			expect(statusLine(response)).to.be.eql('HTTP/1.1 431 Request Header Fields Too Large');

			await request(app.getHttpServer())
				.get('/alive')
				.expect(200, 'alive');
		});
	});

	describe('request paths', () => {
		it('long path with many uri fragments : 404 for unknown path, ** gets the rest', async () => {
			await app.get('/files/**', ({ params }: ParamContext): unknown => ({ length: params['**'].length }));
			await app.listen(TestPort);

			const rest: string = 'a/'.repeat(2000) + 'b';

			await request(app.getHttpServer())
				.get('/' + rest)
				.expect(404);

			await request(app.getHttpServer())
				.get('/files/' + rest)
				.expect(200, { length: rest.length });
		});

		[
			'/s/../package.json',
			'/s/..%2F..%2Fpackage.json',
			'/s/%2e%2e/%2e%2e/package.json',
			'/s/nested/..%2Ftest.txt'
		].forEach((path: string): void => {
			it(`static : ${ path } doesn't escape the static folder`, async () => {
				await app.static('/s', __dirname + '/static');
				await app.listen(TestPort);

				// supertest normalizes '..', send it raw
				const response: string = await sendRaw(`GET ${ path } HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);

				expect(statusLine(response)).to.be.eql('HTTP/1.1 404 Not Found');
			});
		});

		it('static : files of the folder are served', async () => {
			await app.static('/s', __dirname + '/static');
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.get('/s/nested/test.txt')
				.expect(200);
		});
	});

	describe('query string', () => {
		beforeEach(async () => {
			await app.get('/query', ({ query }: ParamContext): unknown => query);
			await app.listen(TestPort);
		});

		it('repeated keys are an array, keys without a value are empty strings', async () => {
			await request(app.getHttpServer())
				.get('/query?a=1&a=2&b&c=')
				.expect(200, { a: ['1', '2'], b: '', c: '' });
		});

		it('malformed percent-encoding in the query string is decoded leniently, not 400', async () => {
			const response: string = await sendRaw('GET /query?a=%ZZ&b=%E0%A4 HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');

			expect(statusLine(response)).to.be.eql('HTTP/1.1 200 OK');
			expect(response).to.include('"a":"%ZZ"');
		});

		it('? in the query string is a part of the value', async () => {
			await request(app.getHttpServer())
				.get('/query?a=b?c')
				.expect(200, { a: 'b?c' });
		});
	});

	describe('methods', () => {
		it('OPTIONS for a registered path : 405 with Allow', async () => {
			await app.get('/users', (): string => 'users');
			await app.post('/users', (): string => 'created');
			await app.listen(TestPort);

			const res = await new Promise<IncomingMessage>((resolve, reject): void => {
				httpRequest({ port: TestPort, method: 'OPTIONS', path: '/users' }, (response: IncomingMessage): void => {
					response.resume();
					resolve(response);
				})
					.on('error', reject)
					.end();
			});

			expect(res.statusCode).to.be.eql(405);
			expect(res.headers.allow).to.be.eql('GET, HEAD, POST');
		});

		it('unknown method token : 400 by Node.js, the server keeps serving', async () => {
			await app.get('/alive', (): string => 'alive');
			await app.listen(TestPort);

			const response: string = await sendRaw('FOO@ /alive HTTP/1.1\r\nHost: localhost\r\n\r\n');

			expect(statusLine(response)).to.be.eql('HTTP/1.1 400 Bad Request');

			await request(app.getHttpServer())
				.get('/alive')
				.expect(200, 'alive');
		});
	});
});
