import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response as SuperTestResponse } from 'supertest';

import { getContentType } from '../src/util';
import { CONTENT_TYPE, HEADER_KEY } from '../src/constants';
import { TestPort } from './test-util';
import { Badak } from '../src';


describe('getContentType()', () => {
	const signatureMap = [
		['ico', CONTENT_TYPE.IMAGE_ICO],
		['gif', CONTENT_TYPE.IMAGE_GIF],
		['jpeg', CONTENT_TYPE.IMAGE_JPEG],
		['bmp', CONTENT_TYPE.IMAGE_BMP],
		['png', CONTENT_TYPE.IMAGE_PNG],
		['webp', CONTENT_TYPE.IMAGE_WEBP],
		['tiff', CONTENT_TYPE.IMAGE_TIFF],
		['heic', CONTENT_TYPE.IMAGE_HEIC]
	];


	signatureMap.map(([ext, type]) => {
		describe(ext, () => {
			let app: Badak;
			beforeEach(async () => {
				app = new Badak();

				app.route({
					img: {
						GET: () => {
							return readFileSync(`./spec/mime/sample.png`);
						}
					}
				});

				await app.listen(TestPort);
			});

			afterEach(async () => {
				await app.stop();
			});

			it('direct call', () => {
				expect(getContentType(readFileSync(`./spec/mime/sample.${ ext }`))).to.be.eql(type);
			});

			it('by app', async () => {
				await request(app.getHttpServer()).get('/img')
					.expect(200)
					.then((res: SuperTestResponse): void => {
						expect(res).to.be.a('object');

						const contentType: string = res.headers[HEADER_KEY.CONTENT_TYPE];
						expect(contentType).to.be.eql(CONTENT_TYPE.IMAGE_PNG);
					});
			});
		});
	});
});
