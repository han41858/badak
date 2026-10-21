import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response as SuperTestResponse } from 'supertest';

import { Badak } from '../src/badak';
import { StaticOption } from '../src/interfaces';
import { parseEtagList } from '../src/util';
import { promiseFail, TestPort } from './test-util';


describe('static file cache headers', () => {
	let app: Badak;
	let tempDir: string;

	const mtime: Date = new Date('2026-01-02T03:04:05.678Z');
	const lastModified: string = 'Fri, 02 Jan 2026 03:04:05 GMT';

	const writeFile = (fileName: string, content: string): void => {
		const filePath: string = path.join(tempDir, fileName);

		fs.writeFileSync(filePath, content);
		fs.utimesSync(filePath, mtime, mtime);
	};

	const getFirst = async (uri: string = '/static/index.html'): Promise<SuperTestResponse> => {
		return request(app.getHttpServer())
			.get(uri)
			.expect(200);
	};

	beforeEach(() => {
		app = new Badak({
			catchErrorLog: false
		});

		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'badak-static-cache-'));

		writeFile('index.html', '<p>index</p>');
		writeFile('app.js', 'console.log(1);');
	});

	afterEach(async () => {
		fs.rmSync(tempDir, { recursive: true, force: true });

		if (app.isRunning()) {
			await app.stop();
		}
	});

	describe('200 response', () => {
		beforeEach(async () => {
			await app.static('/static', tempDir);
			await app.listen(TestPort);
		});

		it('ETag, Last-Modified, Cache-Control: no-cache by default', async () => {
			const res: SuperTestResponse = await getFirst();

			expect(res.headers.etag).to.match(/^"[0-9a-f]+-[A-Za-z0-9_-]+"$/);
			expect(res.headers['last-modified']).to.be.eql(lastModified);
			expect(res.headers['cache-control']).to.be.eql('no-cache');
			expect(res.text).to.be.eql('<p>index</p>');
		});

		it('ETag is different for different content', async () => {
			const html: SuperTestResponse = await getFirst('/static/index.html');
			const js: SuperTestResponse = await getFirst('/static/app.js');

			expect(html.headers.etag).not.to.be.eql(js.headers.etag);
		});

		it('ETag is the same for the same content', async () => {
			const first: SuperTestResponse = await getFirst();
			const second: SuperTestResponse = await getFirst();

			expect(first.headers.etag).to.be.eql(second.headers.etag);
		});

		it('HEAD has the same headers', async () => {
			const get: SuperTestResponse = await getFirst();

			await request(app.getHttpServer())
				.head('/static/index.html')
				.expect(200)
				.expect('etag', get.headers.etag)
				.expect('last-modified', lastModified)
				.expect('cache-control', 'no-cache');
		});
	});

	describe('If-None-Match', () => {
		let etag: string;

		beforeEach(async () => {
			await app.static('/static', tempDir);
			await app.listen(TestPort);

			etag = (await getFirst()).headers.etag;
		});

		it('same ETag : 304 without body', async () => {
			const res: SuperTestResponse = await request(app.getHttpServer())
				.get('/static/index.html')
				.set('If-None-Match', etag)
				.expect(304)
				.expect('etag', etag)
				.expect('last-modified', lastModified)
				.expect('cache-control', 'no-cache');

			expect(res.text ?? '').to.be.eql('');
			expect(res.headers['content-length']).to.be.undefined;
		});

		it('HEAD with same ETag : 304', async () => {
			await request(app.getHttpServer())
				.head('/static/index.html')
				.set('If-None-Match', etag)
				.expect(304);
		});

		it('weak comparison : W/ prefix matches', async () => {
			await request(app.getHttpServer())
				.get('/static/index.html')
				.set('If-None-Match', `W/${ etag }`)
				.expect(304);
		});

		it('one of the list matches', async () => {
			await request(app.getHttpServer())
				.get('/static/index.html')
				.set('If-None-Match', `"other", ${ etag }, W/"another"`)
				.expect(304);
		});

		it('* : 304', async () => {
			await request(app.getHttpServer())
				.get('/static/index.html')
				.set('If-None-Match', '*')
				.expect(304);
		});

		it('different ETag : 200 with body', async () => {
			await request(app.getHttpServer())
				.get('/static/index.html')
				.set('If-None-Match', '"different"')
				.expect(200, '<p>index</p>');
		});

		it('ETag of another file : 200', async () => {
			await request(app.getHttpServer())
				.get('/static/app.js')
				.set('If-None-Match', etag)
				.expect(200, 'console.log(1);');
		});

		[
			'invalid"x", "y"',
			'"a" "b"',
			'"a"b',
			'abc',
			'"unclosed',
			'w/"lower-case-weak"',
			'*, "a"'
		].forEach((invalidPrefix: string): void => {
			it(`invalid syntax doesn't match even if it includes the ETag : ${ invalidPrefix }`, async () => {
				await request(app.getHttpServer())
					.get('/static/index.html')
					.set('If-None-Match', `${ invalidPrefix }, ${ etag }`)
					.expect(200, '<p>index</p>');
			});
		});

		it('ETag glued to invalid text doesn\'t match : invalid"<etag>"', async () => {
			await request(app.getHttpServer())
				.get('/static/index.html')
				.set('If-None-Match', `invalid${ etag }`)
				.expect(200, '<p>index</p>');
		});

		it('empty list elements are ignored', async () => {
			await request(app.getHttpServer())
				.get('/static/index.html')
				.set('If-None-Match', ` , ,${ etag } ,, `)
				.expect(304);
		});

		it('takes precedence over If-Modified-Since (RFC 9110 13.2.2)', async () => {
			await request(app.getHttpServer())
				.get('/static/index.html')
				.set('If-None-Match', '"different"')
				.set('If-Modified-Since', lastModified)
				.expect(200);
		});
	});

	describe('If-Modified-Since', () => {
		beforeEach(async () => {
			await app.static('/static', tempDir);
			await app.listen(TestPort);
		});

		it('same date : 304', async () => {
			await request(app.getHttpServer())
				.get('/static/index.html')
				.set('If-Modified-Since', lastModified)
				.expect(304)
				.expect('last-modified', lastModified);
		});

		it('later date : 304', async () => {
			await request(app.getHttpServer())
				.get('/static/index.html')
				.set('If-Modified-Since', 'Sat, 03 Jan 2026 00:00:00 GMT')
				.expect(304);
		});

		it('earlier date : 200', async () => {
			await request(app.getHttpServer())
				.get('/static/index.html')
				.set('If-Modified-Since', 'Fri, 02 Jan 2026 03:04:04 GMT')
				.expect(200, '<p>index</p>');
		});

		it('invalid date is ignored : 200', async () => {
			await request(app.getHttpServer())
				.get('/static/index.html')
				.set('If-Modified-Since', 'not a date')
				.expect(200, '<p>index</p>');
		});
	});

	describe('cacheControl option', () => {
		it('custom value', async () => {
			await app.static('/static', tempDir, { cacheControl: 'public, max-age=31536000, immutable' });
			await app.listen(TestPort);

			const res: SuperTestResponse = await getFirst();

			expect(res.headers['cache-control']).to.be.eql('public, max-age=31536000, immutable');
		});

		it('false : no Cache-Control, validators are still sent', async () => {
			await app.static('/static', tempDir, { cacheControl: false });
			await app.listen(TestPort);

			const res: SuperTestResponse = await getFirst();

			expect(res.headers['cache-control']).to.be.undefined;
			expect(res.headers.etag).to.be.a('string');
			expect(res.headers['last-modified']).to.be.eql(lastModified);
		});

		it('different option for each static folder', async () => {
			const otherDir: string = fs.mkdtempSync(path.join(os.tmpdir(), 'badak-static-cache-'));

			try {
				fs.writeFileSync(path.join(otherDir, 'logo.txt'), 'logo');

				await app.static('/static', tempDir);
				await app.static('/assets', otherDir, { cacheControl: 'max-age=60' });
				await app.listen(TestPort);

				expect((await getFirst('/static/index.html')).headers['cache-control']).to.be.eql('no-cache');
				expect((await getFirst('/assets/logo.txt')).headers['cache-control']).to.be.eql('max-age=60');
			}
			finally {
				fs.rmSync(otherDir, { recursive: true, force: true });
			}
		});

		([
			null,
			'option',
			[],
			{ unknown: true },
			{ cacheControl: '' },
			{ cacheControl: '   ' },
			{ cacheControl: true },
			{ cacheControl: 60 },
			{ cacheControl: 'no-cache\r\nX-Injected: 1' }
		] as unknown[]).forEach((option: unknown): void => {
			it(`invalid option : ${ JSON.stringify(option) }`, () => {
				return promiseFail(
					app.static('/static', tempDir, option as StaticOption)
				);
			});
		});
	});

	describe('setSPARoot()', () => {
		it('index.html for SPA routes has the same validators', async () => {
			await app.setSPARoot('/', tempDir);
			await app.listen(TestPort);

			const index: SuperTestResponse = await getFirst('/index.html');
			const spaRoute: SuperTestResponse = await getFirst('/some/client/route');

			expect(spaRoute.text).to.be.eql('<p>index</p>');
			expect(spaRoute.headers.etag).to.be.eql(index.headers.etag);
			expect(spaRoute.headers['cache-control']).to.be.eql('no-cache');

			await request(app.getHttpServer())
				.get('/some/client/route')
				.set('If-None-Match', index.headers.etag)
				.expect(304);
		});

		it('cacheControl option', async () => {
			await app.setSPARoot('/', tempDir, { cacheControl: false });
			await app.listen(TestPort);

			const res: SuperTestResponse = await getFirst('/some/client/route');

			expect(res.headers['cache-control']).to.be.undefined;
		});

		it('invalid option', () => {
			return promiseFail(
				app.setSPARoot('/', tempDir, { cacheControl: '' })
			);
		});
	});

	describe('parseEtagList()', () => {
		([
			['"a"', ['"a"']],
			['W/"a"', ['W/"a"']],
			['"a", W/"b",  "c"', ['"a"', 'W/"b"', '"c"']],
			['"a,b"', ['"a,b"']],
			['""', ['""']],
			['\t"a"\t,\t"b"\t', ['"a"', '"b"']],
			[', , "a" , ,', ['"a"']],
			['', []],
			[' , ', []]
		] as [string, string[]][]).forEach(([value, expected]: [string, string[]]): void => {
			it(`valid : ${ JSON.stringify(value) }`, () => {
				expect(parseEtagList(value)).to.be.eql(expected);
			});
		});

		[
			'invalid"abc"',
			'"a" "b"',
			'"a"b',
			'abc',
			'"unclosed',
			'w/"a"',
			'W/ "a"',
			'"a"W/"b"',
			'*',
			'"a", *',
			'"a b"',
			'"a\x7Fb"'
		].forEach((value: string): void => {
			it(`invalid : ${ JSON.stringify(value) }`, () => {
				expect(parseEtagList(value)).to.be.undefined;
			});
		});
	});
});
