import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { IncomingMessage, ServerResponse } from 'node:http';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response as SuperTestResponse } from 'supertest';

import { Badak } from '../src/badak';
import { ParamContext } from '../src/interfaces';
import { TestPort } from './test-util';


describe('charset of Content-Type', () => {
	let app: Badak;
	let tempDir: string;

	beforeEach(() => {
		app = new Badak({
			catchErrorLog: false
		});

		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'badak-charset-'));
	});

	afterEach(async () => {
		fs.rmSync(tempDir, { recursive: true, force: true });

		if (app.isRunning()) {
			await app.stop();
		}
	});

	it('static text files have charset=utf-8', async () => {
		const files: [string, string][] = [
			['index.html', 'text/html; charset=utf-8'],
			['style.css', 'text/css; charset=utf-8'],
			['app.js', 'application/javascript; charset=utf-8'],
			['readme.txt', 'text/plain; charset=utf-8'],
			['data.json', 'application/json'],
			['icon.svg', 'image/svg+xml']
		];

		files.forEach(([fileName]: [string, string]): void => {
			fs.writeFileSync(path.join(tempDir, fileName), fileName.endsWith('.json') ? '"한글"' : '한글');
		});

		await app.static('/static', tempDir);
		await app.listen(TestPort);

		for (const [fileName, contentType] of files) {
			await request(app.getHttpServer())
				.get(`/static/${ fileName }`)
				.expect(200)
				.expect('content-type', contentType);
		}
	});

	it('Korean text is decoded correctly by the client', async () => {
		fs.writeFileSync(path.join(tempDir, 'index.html'), '<p>한글</p>');

		await app.static('/static', tempDir);
		await app.listen(TestPort);

		const res: SuperTestResponse = await request(app.getHttpServer())
			.get('/static/index.html')
			.expect(200);

		expect(res.text).to.be.eql('<p>한글</p>');
	});

	it('route function returns string : text/plain with charset', async () => {
		await app.get('/text', (): string => '한글');
		await app.listen(TestPort);

		await request(app.getHttpServer())
			.get('/text')
			.expect(200, '한글')
			.expect('content-type', 'text/plain; charset=utf-8');
	});

	it('route function returns object : application/json without charset', async () => {
		await app.get('/json', (): object => ({ a: '한글' }));
		await app.listen(TestPort);

		await request(app.getHttpServer())
			.get('/json')
			.expect(200)
			.expect('content-type', 'application/json');
	});

	it('Content-Type set by route function is kept', async () => {
		await app.get('/custom', (ctx: ParamContext): string  => {
			const param = ctx.body as unknown, req: IncomingMessage, res: ServerResponse;
			res.setHeader('Content-Type', 'text/plain; charset=euc-kr');
			return 'abc';
		});

		await app.listen(TestPort);

		await request(app.getHttpServer())
			.get('/custom')
			.expect(200)
			.expect('content-type', 'text/plain; charset=euc-kr');
	});

	it('500 error response', async () => {
		await app.get('/error', (): never => {
			throw new Error('error');
		});

		await app.listen(TestPort);

		await request(app.getHttpServer())
			.get('/error')
			.expect(500)
			.expect('content-type', 'text/plain; charset=utf-8');
	});
});
