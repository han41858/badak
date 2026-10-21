import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response as SuperTestResponse } from 'supertest';

import { Badak } from '../src/badak';
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

			await app.post('/test', (param: TypedObject<unknown>): TypedObject<string> => {
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
});
