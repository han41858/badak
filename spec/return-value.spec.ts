import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response as SuperTestResponse } from 'supertest';

import { Badak } from '../src/badak';
import { TestPort } from './test-util';


describe('value returned by route function', () => {
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

	const getRes = async (value: unknown): Promise<SuperTestResponse> => {
		await app.get('/test', (): unknown => value);
		await app.listen(TestPort);

		return request(app.getHttpServer()).get('/test');
	};

	([
		[5, '5'],
		[0, '0'],
		[-1.5, '-1.5'],
		[true, 'true'],
		[false, 'false'],
		[[1, 'a'], '[1,"a"]'],
		[{ a: 1 }, '{"a":1}']
	] as [unknown, string][]).forEach(([value, json]: [unknown, string]): void => {
		it(`${ JSON.stringify(value) } : JSON`, async () => {
			const res: SuperTestResponse = await getRes(value);

			expect(res.status).to.be.eql(200);
			expect(res.headers['content-type']).to.be.eql('application/json');
			expect(res.text).to.be.eql(json);
		});
	});

	it('string : text', async () => {
		const res: SuperTestResponse = await getRes('한글');

		expect(res.status).to.be.eql(200);
		expect(res.headers['content-type']).to.be.eql('text/plain; charset=utf-8');
		expect(res.text).to.be.eql('한글');
	});

	it('empty string : empty text', async () => {
		const res: SuperTestResponse = await getRes('');

		expect(res.status).to.be.eql(200);
		expect(res.headers['content-type']).to.be.eql('text/plain; charset=utf-8');
		expect(res.headers['content-length']).to.be.eql('0');
	});

	[undefined, null].forEach((value: unknown): void => {
		it(`${ String(value) } : empty response`, async () => {
			const res: SuperTestResponse = await getRes(value);

			expect(res.status).to.be.eql(200);
			expect(res.headers['content-type']).to.be.undefined;
			expect(res.text).to.be.eql('');
		});
	});

	it('Buffer in object is sent as base64, the original object is not modified', async () => {
		const cached: { file: Buffer } = { file: Buffer.from('hi') };

		await app.get('/test', (): unknown => cached);
		await app.listen(TestPort);

		for (let i: number = 0; i < 2; i++) {
			const res: SuperTestResponse = await request(app.getHttpServer())
				.get('/test')
				.expect(200);

			expect(res.body).to.be.eql({ file: 'aGk=' });
		}

		expect(Buffer.isBuffer(cached.file)).to.be.true;
	});

	describe('not serializable : 500', () => {
		it('circular reference', async () => {
			const value: Record<string, unknown> = {};
			value.self = value;

			const res: SuperTestResponse = await getRes(value);

			expect(res.status).to.be.eql(500);
		});

		it('BigInt', async () => {
			const res: SuperTestResponse = await getRes({ n: BigInt(10) });

			expect(res.status).to.be.eql(500);
		});
	});
});
