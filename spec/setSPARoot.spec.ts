import * as fs from 'fs';
import * as path from 'path';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response as SuperTestResponse } from 'supertest';

import { Badak } from '../src/badak';
import { promiseFail, TestPort } from './test-util';
import { CONTENT_TYPE, HEADER_KEY } from '../src/constants';


describe('setSPARoot()', () => {
	let app: Badak;

	let publicPath: string;
	let indexFileContents: string;

	beforeEach(() => {
		app = new Badak({
			catchErrorLog: false
		});

		publicPath = path.join(__dirname, 'static', 'public');
		indexFileContents = fs.readFileSync(path.join(publicPath, 'index.html')).toString();
	});

	afterEach(() => {
		return app.isRunning()
			? app.stop()
			: Promise.resolve();
	});


	it('defined', () => {
		expect(app.setSPARoot).to.be.a('function');
	});

	describe('error', () => {
		// same with static()
		describe('uri', () => {
			it('no parameter', () => {
				return promiseFail(
					app.setSPARoot(undefined as unknown as string, '.')
				);
			});

			it('invalid parameter === null', () => {
				return promiseFail(
					app.setSPARoot(null as unknown as string, '.')
				);
			});

			it('not absolute path', () => {
				return promiseFail(
					app.setSPARoot('someUri', 'something')
				);
			});

			it('invalid path', () => {
				return promiseFail(
					app.setSPARoot('/some///thing', 'something')
				);
			});
		});

		describe('path', () => {
			it('no parameter', () => {
				return promiseFail(
					app.setSPARoot('/', undefined as unknown as string)
				);
			});

			it('invalid parameter === null', () => {
				return promiseFail(
					app.setSPARoot('/', null as unknown as string)
				);
			});

			it('not absolute path', () => {
				return promiseFail(
					app.setSPARoot('/', 'something')
				);
			});

			it('not folder', () => {
				return promiseFail(
					app.setSPARoot('/', path.join(__dirname, 'static', 'test.txt'))
				);
			});
		});

		it('not exist folder', () => {
			const folderPath = path.join(__dirname, '/static/notExistFolder');

			return promiseFail(
				app.setSPARoot('/public', folderPath)
			);
		});

		it('no index.html', () => {
			return promiseFail(
				app.setSPARoot('/public', path.join(__dirname, 'static'))
			);
		});
	});

	it('ok - /', async () => {
		const spaRoot: string = '/';

		await app.setSPARoot(spaRoot, publicPath);

		await app.listen(TestPort);

		await request(app.getHttpServer()).get(spaRoot)
			.expect(200)
			.then((res: SuperTestResponse): void => {
				expect(res).to.be.a('object');

				const contentType: string = res.headers[HEADER_KEY.CONTENT_TYPE];
				expect(contentType).to.be.eql(CONTENT_TYPE.TEXT_HTML);

				expect(res.text).to.be.eql(indexFileContents);
			});

		await request(app.getHttpServer()).get(spaRoot + '/somethingDeepLink')
			.expect(200)
			.then((res: SuperTestResponse): void => {
				expect(res).to.be.a('object');

				const contentType: string = res.headers[HEADER_KEY.CONTENT_TYPE];
				expect(contentType).to.be.eql(CONTENT_TYPE.TEXT_HTML);

				expect(res.text).to.be.eql(indexFileContents);
			});
	});

	it('ok - /public', async () => {
		const spaRoot: string = '/public';

		await app.setSPARoot(spaRoot, publicPath);

		await app.listen(TestPort);


		await request(app.getHttpServer()).get(spaRoot)
			.expect(200)
			.then((res: SuperTestResponse): void => {
				expect(res).to.be.a('object');

				const contentType: string = res.headers[HEADER_KEY.CONTENT_TYPE];
				expect(contentType).to.be.eql(CONTENT_TYPE.TEXT_HTML);

				expect(res.text).to.be.eql(indexFileContents);
			});

		await request(app.getHttpServer()).get(spaRoot + '/somethingDeepLink')
			.expect(200)
			.then((res: SuperTestResponse): void => {
				expect(res).to.be.a('object');

				const contentType: string = res.headers[HEADER_KEY.CONTENT_TYPE];
				expect(contentType).to.be.eql(CONTENT_TYPE.TEXT_HTML);

				expect(res.text).to.be.eql(indexFileContents);
			});
	});

	it('ok - / without auth', async () => {
		const spaRoot: string = '/';

		await app.auth(() => {
			throw new Error('should be pass this function');
		});

		await app.setSPARoot(spaRoot, publicPath);

		await app.listen(TestPort);

		await request(app.getHttpServer()).get(spaRoot)
			.expect(200)
			.then((res: SuperTestResponse): void => {
				expect(res).to.be.a('object');

				const contentType: string = res.headers[HEADER_KEY.CONTENT_TYPE];
				expect(contentType).to.be.eql(CONTENT_TYPE.TEXT_HTML);

				expect(res.text).to.be.eql(indexFileContents);
			});

		await request(app.getHttpServer()).get(spaRoot + 'index.html')
			.expect(200)
			.then((res: SuperTestResponse): void => {
				expect(res).to.be.a('object');

				const contentType: string = res.headers[HEADER_KEY.CONTENT_TYPE];
				expect(contentType).to.be.eql(CONTENT_TYPE.TEXT_HTML);

				expect(res.text).to.be.eql(indexFileContents);
			});

		await request(app.getHttpServer()).get(spaRoot + 'somethingDeepLink')
			.expect(200)
			.then((res: SuperTestResponse): void => {
				expect(res).to.be.a('object');

				const contentType: string = res.headers[HEADER_KEY.CONTENT_TYPE];
				expect(contentType).to.be.eql(CONTENT_TYPE.TEXT_HTML);

				expect(res.text).to.be.eql(indexFileContents);
			});
	});

	it('ok - /public without auth', async () => {
		const spaRoot: string = '/public';

		await app.auth(() => {
			throw new Error('should be pass this function');
		});

		await app.setSPARoot(spaRoot, publicPath);

		await app.listen(TestPort);


		await request(app.getHttpServer()).get(spaRoot)
			.expect(200)
			.then((res: SuperTestResponse): void => {
				expect(res).to.be.a('object');

				const contentType: string = res.headers[HEADER_KEY.CONTENT_TYPE];
				expect(contentType).to.be.eql(CONTENT_TYPE.TEXT_HTML);

				expect(res.text).to.be.eql(indexFileContents);
			});

		await request(app.getHttpServer()).get(spaRoot + '/index.html')
			.expect(200)
			.then((res: SuperTestResponse): void => {
				expect(res).to.be.a('object');

				const contentType: string = res.headers[HEADER_KEY.CONTENT_TYPE];
				expect(contentType).to.be.eql(CONTENT_TYPE.TEXT_HTML);

				expect(res.text).to.be.eql(indexFileContents);
			});

		await request(app.getHttpServer()).get(spaRoot + '/somethingDeepLink')
			.expect(200)
			.then((res: SuperTestResponse): void => {
				expect(res).to.be.a('object');

				const contentType: string = res.headers[HEADER_KEY.CONTENT_TYPE];
				expect(contentType).to.be.eql(CONTENT_TYPE.TEXT_HTML);

				expect(res.text).to.be.eql(indexFileContents);
			});
	});
});
