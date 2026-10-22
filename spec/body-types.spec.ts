import { IncomingMessage } from 'node:http';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { parseBody, ParamConvertOption } from '../src/body-parser';
import { HttpError } from '../src/http-error';
import { ParamContext } from '../src/interfaces';
import { TestPort } from './test-util';


// request bodies of Content-Types that are not parsed (5.0.0)
describe('request body of other Content-Types (5.0.0)', () => {
	const convertAll: ParamConvertOption = { parseNumber: true, parseDate: true };

	const reqOf = (contentType?: string): IncomingMessage => {
		return { headers: contentType === undefined ? {} : { 'content-type': contentType } } as unknown as IncomingMessage;
	};

	// '한글' in EUC-KR
	const eucKr: Buffer = Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]);
	// a lone continuation byte, not UTF-8
	const invalidUtf8: Buffer = Buffer.from([0x61, 0x80, 0x62]);

	describe('parseBody()', () => {
		([
			['text/plain', '한글 text'],
			['text/plain; charset=utf-8', '한글 text'],
			['text/plain; charset=UTF-8', '한글 text'],
			['text/plain; charset="utf-8"', '한글 text'],
			['text/plain; charset=utf8', '한글 text'],
			['Text/CSV', 'a,b\n1,2'],
			['text/html; charset=UTF-8', '<p>한</p>'],
			['text/markdown; foo=bar', '# title']
		] as [string, string][]).forEach(([contentType, text]: [string, string]): void => {
			it(`${ contentType } : UTF-8 string`, () => {
				expect(parseBody(reqOf(contentType), Buffer.from(text), convertAll)).to.be.eql(text);
			});
		});

		it('parseNumber and parseDate are not applied to a string body', () => {
			expect(parseBody(reqOf('text/plain'), Buffer.from('123'), convertAll)).to.be.eql('123');
			expect(parseBody(reqOf('text/plain'), Buffer.from('2018-06-20'), convertAll)).to.be.eql('2018-06-20');
		});

		it('a UTF-8 BOM is removed from a text body', () => {
			expect(parseBody(reqOf('text/plain'), Buffer.from([0xef, 0xbb, 0xbf, 0x61]), convertAll)).to.be.eql('a');
		});

		['text/plain', 'text/plain; charset=utf-8'].forEach((contentType: string): void => {
			it(`${ contentType } with malformed UTF-8 : HttpError(400)`, () => {
				expect(() => parseBody(reqOf(contentType), invalidUtf8, convertAll))
					.to.throw(HttpError).with.property('status', 400);
			});
		});

		['text/plain; charset=euc-kr', 'text/plain; charset="EUC-KR"', 'text/plain; charset=iso-8859-1', 'text/csv; charset=utf-16'].forEach((contentType: string): void => {
			it(`${ contentType } : the original Buffer, not decoded`, () => {
				const body: unknown = parseBody(reqOf(contentType), eucKr, convertAll);

				expect(Buffer.isBuffer(body)).to.be.true;
				expect(body).to.be.eql(eucKr);
			});
		});

		([
			'application/octet-stream',
			'application/xml',
			'image/png',
			'application/vnd.api+json',
			undefined
		] as (string | undefined)[]).forEach((contentType: string | undefined): void => {
			it(`${ contentType ?? 'no Content-Type' } : the original Buffer`, () => {
				const bytes: Buffer = Buffer.from([0x00, 0xff, 0x10, 0x80]);
				const body: unknown = parseBody(reqOf(contentType), bytes, convertAll);

				expect(Buffer.isBuffer(body)).to.be.true;
				expect(body).to.be.eql(bytes);
			});
		});

		[undefined, 'text/plain', 'application/octet-stream', 'application/json'].forEach((contentType: string | undefined): void => {
			it(`empty body : undefined (${ contentType ?? 'no Content-Type' })`, () => {
				expect(parseBody(reqOf(contentType), Buffer.alloc(0), convertAll)).to.be.undefined;
			});
		});

		it('JSON, form are parsed as before, parseNumber is applied', () => {
			expect(parseBody(reqOf('application/json'), Buffer.from('{"a":"1"}'), convertAll)).to.be.eql({ a: 1 });
			expect(parseBody(reqOf('application/x-www-form-urlencoded'), Buffer.from('a=1'), convertAll)).to.be.eql({ a: 1 });
		});

		describe('multipart files', () => {
			const boundary: string = 'XyZ';

			const multipart = (parts: { headers: string, data: Buffer }[]): Buffer => Buffer.concat([
				...parts.flatMap((part: { headers: string, data: Buffer }): Buffer[] => [
					Buffer.from(`--${ boundary }\r\n${ part.headers }\r\n\r\n`),
					part.data,
					Buffer.from('\r\n')
				]),
				Buffer.from(`--${ boundary }--\r\n`)
			]);

			const parse = (headers: string, data: Buffer): unknown => {
				const body = parseBody(reqOf(`multipart/form-data; boundary=${ boundary }`), multipart([{ headers, data }]), convertAll) as Record<string, unknown>;

				return body.f;
			};

			const file = (contentType?: string): string => {
				return 'Content-Disposition: form-data; name="f"; filename="a.txt"'
					+ (contentType === undefined ? '' : `\r\nContent-Type: ${ contentType }`);
			};

			it('text/plain without charset : UTF-8 string', () => {
				expect(parse(file('text/plain'), Buffer.from('한글'))).to.be.eql('한글');
			});

			it('no Content-Type (text/plain by RFC 7578) : UTF-8 string', () => {
				expect(parse(file(), Buffer.from('한글'))).to.be.eql('한글');
			});

			it('text/plain; charset=UTF-8 : UTF-8 string', () => {
				expect(parse(file('Text/Plain; charset=UTF-8'), Buffer.from('한글'))).to.be.eql('한글');
			});

			it('text/plain with malformed UTF-8 : HttpError(400)', () => {
				expect(() => parse(file('text/plain'), invalidUtf8)).to.throw(HttpError).with.property('status', 400);
			});

			it('text/plain; charset=euc-kr : Buffer', () => {
				expect(parse(file('text/plain; charset=euc-kr'), eucKr)).to.be.eql(eucKr);
			});

			['text/csv', 'image/png', 'application/octet-stream'].forEach((contentType: string): void => {
				it(`${ contentType } file : Buffer`, () => {
					const value: unknown = parse(file(contentType), Buffer.from('a,b'));

					expect(Buffer.isBuffer(value)).to.be.true;
				});
			});

			it('a normal field is a string, as before', () => {
				expect(parse('Content-Disposition: form-data; name="f"', Buffer.from('1'))).to.be.eql(1);
			});
		});
	});

	describe('HTTP', () => {
		let app: Badak;

		beforeEach(async () => {
			app = new Badak({ catchErrorLog: false });

			await app.post('/echo', ({ body }: ParamContext): unknown => {
				if (Buffer.isBuffer(body)) {
					return { buffer: body.toString('hex') };
				}

				return { type: typeof body, body: body ?? null };
			}, { bodyLimit: 1024 });
		});

		afterEach(() => {
			return app.isRunning()
				? app.stop(0)
				: Promise.resolve();
		});

		it('text/plain : string', async () => {
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.post('/echo')
				.set('Content-Type', 'text/plain; charset=utf-8')
				.send('hello 한글')
				.expect(200, { type: 'string', body: 'hello 한글' });
		});

		it('application/octet-stream : Buffer', async () => {
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.post('/echo')
				.set('Content-Type', 'application/octet-stream')
				.send(Buffer.from([0x00, 0xff]))
				.expect(200, { buffer: '00ff' });
		});

		it('text/plain with malformed UTF-8 : 400', async () => {
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.post('/echo')
				.set('Content-Type', 'text/plain')
				.send(invalidUtf8)
				.expect(400);
		});

		it('over bodyLimit : 413', async () => {
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.post('/echo')
				.set('Content-Type', 'application/octet-stream')
				.send(Buffer.alloc(2048))
				.expect(413);
		});

		it('empty body : undefined', async () => {
			await app.listen(TestPort);

			await request(app.getHttpServer())
				.post('/echo')
				.set('Content-Type', 'text/plain')
				.expect(200, { type: 'undefined', body: null });
		});

		it('auth() runs before receiving the body', async () => {
			let routeRunFlag: boolean = false;

			await app.auth((): void => {
				throw new HttpError(401);
			});

			await app.post('/upload', (): string => {
				routeRunFlag = true;
				return 'ok';
			});

			await app.listen(TestPort);

			await request(app.getHttpServer())
				.post('/upload')
				.set('Content-Type', 'application/octet-stream')
				.send(Buffer.alloc(200 * 1024))
				.expect(401);

			expect(routeRunFlag).to.be.false;
		});
	});
});
