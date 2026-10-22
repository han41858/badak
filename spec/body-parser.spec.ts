import { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';

import { expect } from 'chai';

import { HttpError } from '../src/http-error';
import { convertParam, parseBody, ParamConvertOption, parseRequestBody, receiveBody } from '../src/body-parser';


// request body parsing without HTTP server
describe('body-parser', () => {
	const noConvert: ParamConvertOption = { parseNumber: false, parseDate: false };
	const convertAll: ParamConvertOption = { parseNumber: true, parseDate: true };

	// IncomingMessage-like readable stream
	const fakeReq = (headers: Record<string, string>, chunks: (string | Buffer)[] = []): IncomingMessage => {
		const stream: Readable = Readable.from(chunks.map((chunk: string | Buffer): Buffer => Buffer.from(chunk)));

		return Object.assign(stream, { headers }) as unknown as IncomingMessage;
	};

	describe('convertParam()', () => {
		it('no conversion', () => {
			expect(convertParam({ a: '1', b: '2018-06-20' }, noConvert)).to.be.eql({ a: '1', b: '2018-06-20' });
		});

		it('number & date, nested object and array', () => {
			const converted: Record<string, unknown> = convertParam({
				a: '1',
				b: { c: '-1.5', d: ['2', 'x'] },
				e: '2018-06-20',
				f: '007',
				g: null
			}, convertAll);

			expect(converted.a).to.be.eql(1);
			expect(converted.b).to.be.eql({ c: -1.5, d: [2, 'x'] });
			expect(converted.e).to.be.instanceOf(Date);
			expect(converted.f).to.be.eql('007');
			expect(converted.g).to.be.null;
		});
	});

	describe('convertParam() : Buffer of a multipart file is not converted', () => {
		[noConvert, convertAll].forEach((option: ParamConvertOption): void => {
			it(`kept as it is, ${ JSON.stringify(option) }`, () => {
				const file: Buffer = Buffer.from('12');
				const converted: Record<string, unknown> = convertParam({ file, list: [file], n: '1' }, option);

				expect(converted.file).to.be.equal(file);
				expect(converted.file).to.be.instanceof(Buffer);
				expect((converted.list as unknown[])[0]).to.be.equal(file);
				expect(converted.n).to.be.eql(option.parseNumber ? 1 : '1');
			});

			it(`8MB file in multipart body is parsed in linear time, ${ JSON.stringify(option) }`, () => {
				const boundary: string = 'XyZ';
				const size: number = 8 * 1024 * 1024;
				const body: Buffer = Buffer.concat([
					Buffer.from(`--${ boundary }\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
					Buffer.alloc(size, 1),
					Buffer.from(`\r\n--${ boundary }\r\nContent-Disposition: form-data; name="n"\r\n\r\n1\r\n--${ boundary }--\r\n`)
				]);

				const start: number = Date.now();
				const param: Record<string, unknown> = parseBody(fakeReq({ 'content-type': `multipart/form-data; boundary=${ boundary }` }), body, option) as Record<string, unknown>;

				// every byte of the Buffer was visited before, it took seconds for 8MB
				expect(Date.now() - start).to.be.below(300);
				expect((param.file as Buffer).byteLength).to.be.eql(size);
				expect(param.n).to.be.eql(option.parseNumber ? 1 : '1');
			});
		});
	});

	describe('parseBody()', () => {
		it('application/json', () => {
			expect(parseBody(fakeReq({ 'content-type': 'application/json' }), Buffer.from('{"a":"1"}'), convertAll))
				.to.be.eql({ a: 1 });
		});

		it('malformed JSON : HttpError(400)', () => {
			expect(() => parseBody(fakeReq({ 'content-type': 'application/json' }), Buffer.from('{ invalid'), noConvert))
				.to.throw(HttpError).with.property('status', 400);
		});

		it('application/x-www-form-urlencoded, array and decoding', () => {
			expect(parseBody(
				fakeReq({ 'content-type': 'application/x-www-form-urlencoded' }),
				Buffer.from('a=x+y&b%5B%5D=1&b[]=2'),
				noConvert
			)).to.be.eql({ a: 'x y', b: ['1', '2'] });
		});

		it('multipart/form-data', () => {
			const body: string = [
				'--abc',
				'Content-Disposition: form-data; name="a"',
				'',
				'1',
				'--abc',
				'Content-Disposition: form-data; name="file"; filename="b.bin"',
				'Content-Type: application/octet-stream',
				'',
				'binary',
				'--abc--',
				''
			].join('\r\n');

			const parsed: Record<string, unknown> | undefined = parseBody(
				fakeReq({ 'content-type': 'multipart/form-data; boundary=abc' }),
				Buffer.from(body),
				noConvert
			);

			expect(parsed?.a).to.be.eql('1');
			expect(Buffer.isBuffer(parsed?.file)).to.be.true;
			expect((parsed?.file as Buffer).toString()).to.be.eql('binary');
		});

		it('multipart/form-data without boundary : HttpError(400)', () => {
			expect(() => parseBody(fakeReq({ 'content-type': 'multipart/form-data' }), Buffer.from('x'), noConvert))
				.to.throw(HttpError).with.property('status', 400);
		});

		it('no content-type or empty body : undefined', () => {
			expect(parseBody(fakeReq({}), Buffer.from('{"a":1}'), noConvert)).to.be.undefined;
			expect(parseBody(fakeReq({ 'content-type': 'application/json' }), Buffer.alloc(0), noConvert)).to.be.undefined;
		});
	});

	describe('receiveBody()', () => {
		it('concatenates chunks', async () => {
			expect((await receiveBody(fakeReq({}, ['ab', 'cd']), 10)).toString()).to.be.eql('abcd');
		});

		it('declared content-length over the limit : HttpError(413)', async () => {
			const err: unknown = await receiveBody(fakeReq({ 'content-length': '11' }, ['x']), 10)
				.catch((e: unknown): unknown => e);

			expect(err).to.be.instanceOf(HttpError).with.property('status', 413);
		});

		it('received size over the limit without content-length : HttpError(413)', async () => {
			const err: unknown = await receiveBody(fakeReq({}, ['123456', '789012']), 10)
				.catch((e: unknown): unknown => e);

			expect(err).to.be.instanceOf(HttpError).with.property('status', 413);
		});

		it('body read already : Error, not hang', async () => {
			const req: IncomingMessage = fakeReq({}, ['x']);

			req.resume();
			await new Promise((resolve) => req.on('end', resolve));

			const err: unknown = await receiveBody(req, 10).catch((e: unknown): unknown => e);

			expect(err).to.be.instanceOf(Error);
			expect(err).not.to.be.instanceOf(HttpError);
		});
	});

	it('parseRequestBody() : receive & parse', async () => {
		expect(await parseRequestBody(fakeReq({ 'content-type': 'application/json' }, ['{"a":', '"5"}']), 100, convertAll))
			.to.be.eql({ a: 5 });
	});
});
