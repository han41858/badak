import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response as SuperTestResponse } from 'supertest';

import { Badak } from '../src/badak';
import { convertNumberStr } from '../src/util';
import { echoFnc, TestPort } from './test-util';


describe('parseNumber', () => {
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

	describe('parseNumber converts plain decimal only', () => {
		describe('convertNumberStr()', () => {
			([
				['0', 0],
				['5', 5],
				['-5', -5],
				['1.5', 1.5],
				['-0.25', -0.25],
				['9007199254740991', 9007199254740991] // Number.MAX_SAFE_INTEGER
			] as [string, number][]).forEach(([str, num]: [string, number]): void => {
				it(`'${ str }' -> ${ num }`, () => {
					expect(convertNumberStr(str)).to.be.eql(num);
				});
			});

			[
				'007', // leading zero, e.g. zip code
				'00',
				'+5',
				'.5',
				'5.',
				'1e3',
				'0x10',
				'0b11',
				' 5',
				'5 ',
				'',
				'Infinity',
				'NaN',
				'1,000',
				'9007199254740993', // out of safe integer range, e.g. ID
				'12345678901234567890'
			].forEach((str: string): void => {
				it(`'${ str }' is kept as string`, () => {
					expect(convertNumberStr(str)).to.be.eql(str);
				});
			});
		});

		it('request body & query string', async () => {
			app = new Badak({
				catchErrorLog: false,
				parseNumber: true
			});

			await app.get('/test', echoFnc);
			await app.post('/test', echoFnc);
			await app.listen(TestPort);

			const queryRes: SuperTestResponse = await request(app.getHttpServer())
				.get('/test?zip=007&n=5')
				.expect(200);

			expect(queryRes.body).to.be.eql({ params: {}, query: { zip: '007', n: 5 } });

			const bodyRes: SuperTestResponse = await request(app.getHttpServer())
				.post('/test')
				.send({ id: '12345678901234567890', price: '1.5', code: '0x10' })
				.expect(200);

			expect(bodyRes.body).to.be.eql({
				params: {},
				query: {},
				body: {
					id: '12345678901234567890',
				price: 1.5,
					code: '0x10'
				}
			});
		});
	});
});
