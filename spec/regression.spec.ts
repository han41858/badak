import { IncomingMessage, ServerResponse } from 'node:http';
import * as path from 'node:path';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response as SuperTestResponse } from 'supertest';

import { Badak } from '../src/badak';
import { ParamContext } from '../src/interfaces';
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

	describe('GET query string should keep route param', () => {
		beforeEach(async () => {
			await app.get('/users/:id', echoFnc);
			await app.listen(TestPort);
		});

		it('colon param + query string', async () => {
			const res: SuperTestResponse = await request(app.getHttpServer())
				.get('/users/7?sort=name')
				.expect(200);

			expect(res.body).to.be.eql({ id: '7', sort: 'name' });
		});

		it('colon param without query string', async () => {
			const res: SuperTestResponse = await request(app.getHttpServer())
				.get('/users/7')
				.expect(200);

			expect(res.body).to.be.eql({ id: '7' });
		});
	});

	describe('url decoding', () => {
		beforeEach(async () => {
			await app.post('/form', echoFnc);
			await app.get('/users/:name', echoFnc);
			await app.listen(TestPort);
		});

		it('application/x-www-form-urlencoded body is decoded', async () => {
			const res: SuperTestResponse = await request(app.getHttpServer())
				.post('/form')
				.set('Content-Type', 'application/x-www-form-urlencoded')
				.send('name=Hong+Gil%20Dong&expr=a%26b%3Dc&list[]=%ED%95%9C&list[]=b')
				.expect(200);

			expect(res.body).to.be.eql({
				name: 'Hong Gil Dong',
				expr: 'a&b=c',
				list: ['한', 'b']
			});
		});

		it('colon param is decoded', async () => {
			const res: SuperTestResponse = await request(app.getHttpServer())
				.get('/users/' + encodeURIComponent('홍 길동'))
				.expect(200);

			expect(res.body).to.be.eql({ name: '홍 길동' });
		});

		it('malformed percent-encoding in route param responds 400', async () => {
			await request(app.getHttpServer())
				.get('/users/%E0%A4%A')
				.timeout(500)
				.expect(400);
		});
	});

	describe('parseNumber & parseDate together', () => {
		beforeEach(async () => {
			app = new Badak({
				catchErrorLog: false,
				parseNumber: true,
				parseDate: true
			});

			await app.post('/test', (ctx: ParamContext): TypedObject<string>  => {
			const param = ctx.body as TypedObject<unknown>;
				return Object.fromEntries(
					Object.entries(param).map(([key, value]) => {
						return [key, value instanceof Date ? 'date' : typeof value];
					})
				);
			});

			await app.listen(TestPort);
		});

		it('number string, date string, normal string', async () => {
			const res: SuperTestResponse = await request(app.getHttpServer())
				.post('/test')
				.send({
					num: '123',
					date: '2018-06-20',
					str: 'abc'
				})
				.expect(200);

			expect(res.body).to.be.eql({
				num: 'number',
				date: 'date',
				str: 'string'
			});
		});
	});

	describe('500 response should not expose error message', () => {
		beforeEach(async () => {
			await app.get('/error', (): never => {
				throw new Error('db password=secret');
			});

			await app.get('/object', (): never => {
				throw { reason: 'custom body' };
			});

			await app.listen(TestPort);
		});

		it('Error instance', async () => {
			const res: SuperTestResponse = await request(app.getHttpServer())
				.get('/error')
				.expect(500);

			expect(res.text).to.be.eql('Internal Server Error');
			expect(res.text).not.to.include('secret');
		});

		it('thrown plain object is still sent as response body', async () => {
			const res: SuperTestResponse = await request(app.getHttpServer())
				.get('/object')
				.expect(500);

			expect(res.body).to.be.eql({ reason: 'custom body' });
		});
	});

	describe('GET query string with parseNumber & parseDate', () => {
		const typeOf = (value: unknown): string => {
			if (Array.isArray(value)) {
				return 'array<' + value.map(typeOf).join(',') + '>';
			}

			return value instanceof Date ? 'date' : typeof value;
		};

		const typeFnc = (ctx: ParamContext): TypedObject<string>  => {
			const param = ctx.body as TypedObject<unknown>;
			return Object.fromEntries(
				Object.entries(param).map(([key, value]) => [key, typeOf(value)])
			);
		};

		it('converted when options are on', async () => {
			app = new Badak({
				catchErrorLog: false,
				parseNumber: true,
				parseDate: true
			});

			await app.get('/users/:id', typeFnc);
			await app.listen(TestPort);

			const res: SuperTestResponse = await request(app.getHttpServer())
				.get('/users/7?num=5&str=abc&date=2018-06-20&list=1&list=2&empty=')
				.expect(200);

			expect(res.body).to.be.eql({
				id: 'string', // route param is not converted
				num: 'number',
				str: 'string',
				date: 'date',
				list: 'array<number,number>',
				empty: 'string'
			});
		});

		it('not converted by default', async () => {
			await app.get('/test', typeFnc);
			await app.listen(TestPort);

			const res: SuperTestResponse = await request(app.getHttpServer())
				.get('/test?num=5&date=2018-06-20')
				.expect(200);

			expect(res.body).to.be.eql({
				num: 'string',
				date: 'string'
			});
		});
	});

	describe('PATCH', () => {
		it('request body is parsed, with route param', async () => {
			await app.patch('/users/:id', echoFnc);
			await app.listen(TestPort);

			const res: SuperTestResponse = await request(app.getHttpServer())
				.patch('/users/7')
				.send({ name: 'han' })
				.expect(200);

			expect(res.body).to.be.eql({ id: '7', name: 'han' });
		});

		it('route() with PATCH key', async () => {
			await app.route({
				users: {
					PATCH: echoFnc
				}
			});

			await app.listen(TestPort);

			const res: SuperTestResponse = await request(app.getHttpServer())
				.patch('/users')
				.send({ a: 1 })
				.expect(200);

			expect(res.body).to.be.eql({ a: 1 });
		});
	});

	describe('query string for every method', () => {
		it('DELETE', async () => {
			await app.delete('/items', echoFnc);
			await app.listen(TestPort);

			const res: SuperTestResponse = await request(app.getHttpServer())
				.delete('/items?id=3')
				.expect(200);

			expect(res.body).to.be.eql({ id: '3' });
		});

		it('POST, merged with body', async () => {
			await app.post('/items', echoFnc);
			await app.listen(TestPort);

			const res: SuperTestResponse = await request(app.getHttpServer())
				.post('/items?from=query')
				.send({ name: 'a' })
				.expect(200);

			expect(res.body).to.be.eql({ from: 'query', name: 'a' });
		});

		it('merge order : route param -> query string -> body', async () => {
			await app.patch('/users/:id', echoFnc);
			await app.listen(TestPort);

			const res: SuperTestResponse = await request(app.getHttpServer())
				.patch('/users/7?id=8&name=query&q=1')
				.send({ name: 'body' })
				.expect(200);

			expect(res.body).to.be.eql({ id: '8', name: 'body', q: '1' });
		});

		it('array body is passed as it is', async () => {
			await app.post('/users/:id', echoFnc);
			await app.listen(TestPort);

			const res: SuperTestResponse = await request(app.getHttpServer())
				.post('/users/7?q=1')
				.send([1, 2])
				.expect(200);

			expect(res.body).to.be.eql([1, 2]);
		});
	});

	describe('HEAD', () => {
		it('handled by GET route function, without body', async () => {
			let routeFncRunCount: number = 0;

			await app.get('/data', (): TypedObject<number> => {
				routeFncRunCount++;
				return { a: 1 };
			});

			await app.listen(TestPort);

			const res: SuperTestResponse = await request(app.getHttpServer())
				.head('/data')
				.expect(200)
				.expect('content-type', 'application/json');

			expect(res.text).to.be.undefined;
			expect(routeFncRunCount).to.be.eql(1);
		});

		it('static file', async () => {
			await app.static('/static', path.join(__dirname, 'static'));
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.head('/static/test.html')
				.expect(200)
				.expect('content-type', 'text/html; charset=utf-8');
		});

		it('same content-type & content-length as GET', async () => {
			await app.get('/data', (): TypedObject<string> => ({ msg: '한글' }));
			await app.static('/static', path.join(__dirname, 'static'));
			await app.listen(TestPort);

			for (const uri of ['/data', '/static/test.html', '/static/test.png']) {
				const getRes: SuperTestResponse = await request(app.getHttpServer()).get(uri).expect(200);
				const headRes: SuperTestResponse = await request(app.getHttpServer()).head(uri).expect(200);

				expect(getRes.headers['content-length']).to.be.a('string');
				expect(headRes.headers['content-type']).to.be.eql(getRes.headers['content-type']);
				expect(headRes.headers['content-length']).to.be.eql(getRes.headers['content-length']);
			}
		});

		it('streaming route function', async () => {
			await app.get('/stream', (ctx: ParamContext): void  => {
			const param = ctx.body as unknown, req: IncomingMessage, res: ServerResponse;
				res.writeHead(200, { 'Content-Type': 'text/plain' });
				res.write('a');

				setTimeout((): void => {
					res.end('b');
				}, 20);
			});

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.head('/stream')
				.timeout(1000)
				.expect(200)
				.expect('content-type', 'text/plain');
		});

		it('not handled without GET route', async () => {
			await app.post('/data', (): string => 'post');
			await app.listen(TestPort);

			const res: SuperTestResponse = await request(app.getHttpServer())
				.head('/data');

			expect(res.status).not.to.be.eql(200);
		});
	});

	describe('405 Method Not Allowed', () => {
		it('Allow header lists available methods, HEAD after GET', async () => {
			await app.get('/items', echoFnc);
			await app.post('/items', echoFnc);
			await app.delete('/items', echoFnc);
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.put('/items')
				.expect(405)
				.expect('Allow', 'GET, HEAD, POST, DELETE');
		});

		it('no GET, no HEAD', async () => {
			await app.post('/items', echoFnc);
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.head('/items')
				.expect(405)
				.expect('Allow', 'POST');
		});

		it('not matched path is still 404', async () => {
			await app.get('/users/:id', echoFnc);
			await app.listen(TestPort);

			// intermediate path without route function
			await request(app.getHttpServer())
				.get('/users')
				.expect(404);

			await request(app.getHttpServer())
				.get('/nothing')
				.expect(404);
		});
	});
});
