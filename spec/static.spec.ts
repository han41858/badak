import * as fs from 'fs';
import * as path from 'path';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response as SuperTestResponse } from 'supertest';

import { Badak } from '../src/badak';
import { ContentType } from '../src/constants';
import { StaticCache, StaticRule, TypedObject } from '../src/interfaces';
import { promiseFail, TestPort } from './test-util';


describe('static()', () => {
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


	it('defined', () => {
		expect(app.static).to.be.ok;
	});

	describe('error', () => {
		describe('uri', () => {
			it('no parameter', () => {
				return promiseFail(
					app.static(undefined as unknown as string, '.')
				);
			});

			it('invalid parameter === null', () => {
				return promiseFail(
					app.static(null as unknown as string, '.')
				);
			});

			it('not absolute path', () => {
				return promiseFail(
					app.static('someUri', 'something')
				);
			});

			it('invalid path', () => {
				return promiseFail(
					app.static('/some///thing', 'something')
				);
			});
		});

		describe('path', () => {
			it('no parameter', () => {
				return promiseFail(
					app.static('/', undefined as unknown as string)
				);
			});

			it('invalid parameter === null', () => {
				return promiseFail(
					app.static('/', null as unknown as string)
				);
			});

			it('not absolute path', () => {
				return promiseFail(
					app.static('/', 'something')
				);
			});

			it('not folder', () => {
				return promiseFail(
					app.static('/', path.join(__dirname, 'static', 'test.txt'))
				);
			});
		});

		it('not exist file', async () => {
			const fullUri: string = '/static/notExistFile.text';
			const folderPath = path.join(__dirname, '/static');

			await app.static('/static', folderPath);

			await app.listen(TestPort);

			await request(app.getHttpServer()).get(fullUri).expect(404);
			await request(app.getHttpServer()).post(fullUri).expect(404);
			await request(app.getHttpServer()).put(fullUri).expect(404);
			await request(app.getHttpServer()).delete(fullUri).expect(404);
		});

		it('not exist folder', () => {
			const folderPath = path.join(__dirname, '/static/notExistFolder');

			return promiseFail(
				app.static('/static', folderPath)
			);
		});
	});

	describe('about uri', () => {
		let folderName: string;
		let fileName: string;

		let folderPath: string;
		let filePath: string;

		let fileData: string;

		const checkBefore = (keyUri: string): void => {
			const staticRules: StaticRule[] = (app as unknown as TypedObject<StaticRule[]>)._staticRules;

			expect(staticRules).to.be.ok;
			expect(staticRules).to.be.instanceOf(Array);

			const targetRule: StaticRule | undefined = staticRules.find((rule: StaticRule): boolean => {
				return rule.uri === keyUri;
			});

			expect(targetRule).to.be.ok;
		};

		const checkAfter = async (fullUri: string): Promise<void> => {
			// request twice to check cache working
			await Promise.all(
				new Array(2)
					.fill(undefined)
					.map(async (nothing: unknown, i: number): Promise<void> => {
						await Promise.all([
							request(app.getHttpServer())
								.get(fullUri)
								.expect(200)
								.then((res: SuperTestResponse): void => {
									const contentType: string = res.headers['content-type'];
									expect(contentType).to.be.eql(ContentType.TextPlain);

									expect(res).to.be.ok;
									expect(res.text).to.be.ok;
									expect(res.text).to.be.eql(fileData);
								}),
							request(app.getHttpServer()).post(fullUri).expect(404),
							request(app.getHttpServer()).put(fullUri).expect(404),
							request(app.getHttpServer()).delete(fullUri).expect(404)
						]);

						if (i === 0) {
							// check cache
							const staticCache: StaticCache[] = (app as unknown as TypedObject<StaticCache[]>)._staticCache;

							expect(staticCache).to.be.ok;
							expect(staticCache).to.be.instanceOf(Array);

							const targetCache: StaticCache | undefined = staticCache.find((cache: StaticCache): boolean => {
								return cache.uri === fullUri;
							});

							expect(targetCache).to.be.ok;
							expect(targetCache).to.have.property('mime', ContentType.TextPlain);
							expect(targetCache).to.have.property('fileData');
						}
					})
			);
		};

		before(async () => {
			folderName = 'static';
			fileName = 'test.txt';

			folderPath = path.join(__dirname, folderName);
			filePath = path.join(folderPath, fileName);

			fileData = await new Promise<string>((resolve, reject) => {
				fs.readFile(filePath, (err: Error | null, data: Buffer) => {
					if (!err) {
						resolve(data.toString());
					}
					else {
						reject(err);
					}
				});
			});
		});

		[
			'/',
			'/static'
		].forEach((uri: string): void => {
			it(`ok : ${ uri }`, async () => {
				const fullUri: string = `${ uri === '/' ? '' : uri }/${ fileName }`;

				await app.static(uri, folderPath);

				checkBefore(uri);

				await app.listen(TestPort);

				await checkAfter(fullUri);
			});
		});

		it('ok - end with /', async () => {
			const uri: string = '/static/';
			const fullUri: string = `${ uri }${ fileName }`;

			await app.static(uri, folderPath);

			checkBefore(uri);

			await app.listen(TestPort);

			await checkAfter(fullUri);
		});

		it('ok - nested url', async () => {
			const uri: string = '/static/some/inner/path';
			const fullUri: string = `${ uri }/${ fileName }`;

			await app.static(uri, folderPath);

			checkBefore(uri);

			await app.listen(TestPort);

			await checkAfter(fullUri);
		});

		it('ok - multiple assign', async () => {
			const uris: string[] = ['/static1', '/static2'];

			const testObj: [string, string][] = uris.map((uri: string): [string, string] => {
				return [uri, `${ uri }/${ fileName }`];
			});

			await Promise.all(
				testObj.map(async ([uri]: [string, string]): Promise<void> => {
					await app.static(uri, folderPath);

					checkBefore(uri);
				})
			);

			await app.listen(TestPort);

			await Promise.all(
				testObj.map(async ([, fullUri]: [string, string]): Promise<void> => {
					await checkAfter(fullUri);
				})
			);
		});
	});

	it('folder', async () => {
		const uri: string = '/static';

		await app.static(uri, path.join(__dirname, 'static'));

		await app.listen(TestPort);

		// check static cache
		const staticCache: StaticCache[] = (app as unknown as TypedObject<StaticCache[]>)._staticCache;

		expect(staticCache).to.be.instanceOf(Array);
		expect(staticCache.length).to.be.above(0);

		const targetStaticCache: StaticCache = staticCache[0];

		expect(targetStaticCache).to.be.instanceOf(Object);

		expect(targetStaticCache).to.have.property('uri');
		expect(targetStaticCache.uri).to.be.a('string');

		expect(targetStaticCache).to.have.property('mime');
		expect(targetStaticCache.mime).to.be.a('string');

		expect(targetStaticCache).to.have.property('fileData');

		await request(app.getHttpServer())
			.get('/static/test.txt')
			.expect(200)
			.then((res: SuperTestResponse): void => {
				expect(res).to.be.ok;

				expect(!!res.body || !!res.text).to.be.ok;
			});
	});

	it('nested folder', async () => {
		const uri: string = '/static';

		await app.static(uri, path.join(__dirname, 'static'));

		await app.listen(TestPort);

		// check static cache
		const staticCache: StaticCache[] = (app as unknown as TypedObject<StaticCache[]>)._staticCache;

		expect(staticCache).to.be.instanceOf(Array);
		expect(staticCache.length).to.be.above(0);

		await request(app.getHttpServer())
			.get('/static/nested/test.txt')
			.expect(200)
			.then((res: SuperTestResponse): void => {
				expect(res).to.be.ok;

				expect(!!res.body || !!res.text).to.be.ok;
			});
	});

	describe('about MIME', () => {
		const defines: [string, string][] = [
			['bmp', 'image/bmp'],
			['css', 'text/css'],
			['gif', 'image/gif'],
			['htm', 'text/html'],
			['html', 'text/html'],
			['jpeg', 'image/jpeg'],
			['jpg', 'image/jpeg'],
			['js', 'text/javascript'],
			['json', 'application/json'],
			['pdf', 'application/pdf'],
			['png', 'image/png'],
			['txt', 'text/plain'],
			['text', 'text/plain'],
			['tif', 'image/tiff'],
			['tiff', 'image/tiff'],
			['xls', 'application/vnd.ms-excel'],
			['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
		];

		defines.forEach(([extension, mime]: [string, string]): void => {
			it(`ok : .${ extension }`, async () => {
				const fileName: string = `test.${ extension }`;
				const filePath: string = path.join(__dirname, '/static');

				const fullUri: string = `/static/${ fileName }`;

				await app.static('/static', filePath);

				await app.listen(TestPort);

				// check once
				await request(app.getHttpServer())
					.get(fullUri)
					.expect(200)
					.then((res: SuperTestResponse): void => {
						expect(res).to.be.ok;

						const contentType: string = res.headers['content-type'];
						expect(contentType).to.be.eql(mime);

						expect(!!res.body || !!res.text).to.be.ok;
					});
				await request(app.getHttpServer()).post(fullUri).expect(404);
				await request(app.getHttpServer()).put(fullUri).expect(404);
				await request(app.getHttpServer()).delete(fullUri).expect(404);

				// request twice to check cache working
				await request(app.getHttpServer())
					.get(fullUri)
					.expect(200)
					.then((res: SuperTestResponse): void => {
						expect(res).to.be.ok;

						const contentType: string = res.headers['content-type'];
						expect(contentType).to.be.eql(mime);

						expect(!!res.body || !!res.text).to.be.ok;
					});

				await request(app.getHttpServer()).post(fullUri).expect(404);
				await request(app.getHttpServer()).put(fullUri).expect(404);
				await request(app.getHttpServer()).delete(fullUri).expect(404);
			});
		});
	});
});
