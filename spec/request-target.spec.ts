import { connect, Socket } from 'node:net';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { HttpError } from '../src/http-error';
import { ParamContext } from '../src/interfaces';
import { toOriginForm } from '../src/router';
import { TestPort } from './test-util';


describe('request target and Content-Type', () => {
	describe('toOriginForm()', () => {
		[
			['/a/b?c=1', '/a/b?c=1'],
			['/', '/'],
			['http://localhost/a/b?c=1', '/a/b?c=1'],
			['https://example.com:8080/a', '/a'],
			['HTTP://localhost/a', '/a'],
			['http://localhost', '/'],
			['http://localhost?c=1', '/?c=1'],
			// not normalized, same as origin-form
			['http://localhost/a/../b', '/a/../b'],
			['http://localhost/a%2Fb', '/a%2Fb'],
			// host forms
			['http://127.0.0.1:8080/a', '/a'],
			['http://[::1]:8080/a', '/a'],
			['http://localhost:/a', '/a'], // empty port is valid (RFC 3986)
			['http://한글.com/a', '/a']
		].forEach(([target, expected]: string[]): void => {
			it(`${ target } -> ${ expected }`, () => {
				expect(toOriginForm(target)).to.be.eql(expected);
			});
		});

		([
			['*', 404],
			['localhost:8080', 400],
			['a/b', 400],
			['', 400],
			// only http and https
			['ftp://example.com/users/7', 400],
			['custom://example.com/users/7', 400],
			['ws://example.com/users/7', 400],
			['http:/users/7', 400],
			// empty host
			['http:///users/7', 400],
			['http://:8080/users/7', 400],
			['http://?a=1', 400],
			// userinfo is an error (RFC 9110 4.2.4)
			['http://user@example.com/users/7', 400],
			['http://@example.com/users/7', 400],
			// invalid host and port
			['http://exa[mple.com/a', 400],
			['http://[::1/a', 400],
			['http://example.com:80a/a', 400],
			['http://a:1:2/a', 400],
			// fragment is not a part of the request target, in any form
			['/users/7#a', 400],
			['/users/7?a=1#b', 400],
			['http://example.com/users/7#a', 400],
			['#a', 400]
		] as [string, number][]).forEach(([target, status]: [string, number]): void => {
			it(`${ JSON.stringify(target) } -> ${ status }`, () => {
				expect(() => toOriginForm(target)).to.throw(HttpError).with.property('status', status);
			});
		});
	});

	describe('HTTP', () => {
		let app: Badak;

		beforeEach(async () => {
			app = new Badak({
				catchErrorLog: false
			});

			await app.get('/users/:id', ({ params, query }: ParamContext): unknown => ({ params, query }));
			await app.get('/*', ({ params }: ParamContext): unknown => params);
			await app.post('/echo', ({ body }: ParamContext): unknown => ({ body: body ?? null }));
			await app.listen(TestPort);
		});

		afterEach(() => {
			return app.isRunning()
				? app.stop(0)
				: Promise.resolve();
		});

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

		const get = (target: string, method: string = 'GET'): Promise<string> => {
			return sendRaw(`${ method } ${ target } HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
		};

		it('absolute-form is routed by its path and query', async () => {
			const response: string = await get(`http://localhost:${ TestPort }/users/7?a=1`);

			expect(response.split('\r\n')[0]).to.be.eql('HTTP/1.1 200 OK');
			expect(response.endsWith('{"params":{"id":"7"},"query":{"a":"1"}}')).to.be.true;
		});

		it('absolute-form and origin-form are the same route', async () => {
			const absolute: string = await get('http://example.com/users/%ED%95%9C');
			const origin: string = await get('/users/%ED%95%9C');

			expect(absolute.split('\r\n\r\n')[1]).to.be.eql(origin.split('\r\n\r\n')[1]);
		});

		[
			'ftp://example.com/users/7',
			'http:///users/7',
			'http://user@example.com/users/7',
			'/users/7#a'
		].forEach((target: string): void => {
			it(`${ target } : 400`, async () => {
				const response: string = await get(target);

				expect(response.split('\r\n')[0]).to.be.eql('HTTP/1.1 400 Bad Request');
			});
		});

		it('absolute-form : the path is not normalized, same as origin-form', async () => {
			const absolute: string = await get('http://localhost/users/../users/7');
			const origin: string = await get('/users/../users/7');

			expect(absolute.split('\r\n')[0]).to.be.eql(origin.split('\r\n')[0]);
			expect(absolute.split('\r\n\r\n')[1]).to.be.eql(origin.split('\r\n\r\n')[1]);
		});

		it('OPTIONS * : 404, not matched by /* route', async () => {
			const response: string = await get('*', 'OPTIONS');

			expect(response.split('\r\n')[0]).to.be.eql('HTTP/1.1 404 Not Found');
		});

		[
			'application/json',
			'Application/JSON',
			'APPLICATION/JSON; charset=UTF-8',
			' application/json ; charset=utf-8'
		].forEach((contentType: string): void => {
			it(`Content-Type ${ JSON.stringify(contentType) } : JSON body is parsed`, async () => {
				await request(app.getHttpServer())
					.post('/echo')
					.set('Content-Type', contentType)
					.send('{"a":1}')
					.expect(200, { body: { a: 1 } });
			});
		});

		it('Content-Type Application/X-WWW-Form-Urlencoded : form body is parsed', async () => {
			await request(app.getHttpServer())
				.post('/echo')
				.set('Content-Type', 'Application/X-WWW-Form-Urlencoded')
				.send('a=1')
				.expect(200, { body: { a: '1' } });
		});

		it('Content-Type Multipart/Form-Data : boundary keeps its case', async () => {
			const boundary: string = 'AbC123';
			const body: string = `--${ boundary }\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--${ boundary }--\r\n`;

			await request(app.getHttpServer())
				.post('/echo')
				.set('Content-Type', `Multipart/Form-Data; boundary=${ boundary }`)
				.send(body)
				.expect(200, { body: { a: '1' } });
		});
	});
});
