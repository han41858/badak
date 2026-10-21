import { Server } from 'node:net';
import { Agent, ClientRequest, IncomingMessage, request as httpRequest, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response as SuperTestResponse, Test as SuperTestExpect } from 'supertest';

import { Badak } from '../src/badak';
import { ParamContext } from '../src/interfaces';
import { RouteFunction } from '../src/interfaces';
import { promiseFail, TestPort } from './test-util';


describe('core', () => {
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

	it('creating instance', () => {
		expect(Badak).to.be.ok;

		expect(app).to.be.ok;
		expect(app).to.be.instanceOf(Badak);
	});

	describe('_paramParser()', () => {
		const testUrl: string = '/paramParser';

		describe('single string', () => {
			const str: string = 'string_value';

			beforeEach(async () => {
				const testFnc = (ctx: ParamContext): void  => {
			const param = ctx.body as {
					str: string;
				};
					expect(param).to.be.a('object');
					expect(param.str).to.be.eql(str);
				};

				await app.route({
					[testUrl]: {
						POST: testFnc
					}
				});

				await app.listen(TestPort);
			});

			afterEach(async () => {
				await app.stop();
			});

			it('application/json', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				await request(server)
					.post(testUrl)
					.send({ str })
					.expect(200); // 200 means no error while call testFnc()
			});

			it('multipart/form-data', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				await request(server)
					.post(testUrl)
					.field('str', str)
					.expect(200); // 200 means no error while call testFnc()
			});

			it('application/x-www-form-urlencoded', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				await request(server)
					.post(testUrl)
					.send(`str=${ str }`)
					.expect(200); // 200 means no error while call testFnc()
			});
		});

		describe('array string', () => {
			const strArr: string[] = ['str1', 'str2', 'str3'];

			beforeEach(async () => {
				const testFnc = (ctx: ParamContext): void  => {
			const param = ctx.body as {
					strArr: string[];
				};
					expect(param).to.be.a('object');

					expect(param.strArr).to.be.instanceOf(Array);
					expect(param.strArr).to.be.lengthOf(strArr.length);

					param.strArr.forEach((value, i) => {
						expect(value).to.be.a('string');
						expect(value).to.be.eql(strArr[i]);
					});
				};

				await app.route({
					[testUrl]: {
						POST: testFnc
					}
				});

				await app.listen(TestPort);
			});

			it('application/json', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				await request(server)
					.post(testUrl)
					.send({ strArr: strArr })
					.expect(200); // 200 means no error while call testFnc()
			});

			it('multipart/form-data', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				await request(server)
					.post(testUrl)
					.field('strArr[]', strArr[0])
					.field('strArr[]', strArr[1])
					.field('strArr[]', strArr[2])
					.expect(200); // 200 means no error while call testFnc()
			});

			it('application/x-www-form-urlencoded', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				await request(server)
					.post(testUrl)
					.send(`strArr[]=${ strArr[0] }&strArr[]=${ strArr[1] }&strArr[]=${ strArr[2] }`)
					.expect(200); // 200 means no error while call testFnc()
			});
		});

		// undefined converted to null while sending request
		describe('array contains undefined', () => {
			const strArr: (string | undefined)[] = ['str1', 'str2', undefined];

			beforeEach(async () => {
				const testFnc = (ctx: ParamContext): void  => {
			const param = ctx.body as {
					strArr: (string | undefined)[];
				};
					expect(param).to.be.a('object');

					expect(param.strArr).to.be.instanceOf(Array);
					expect(param.strArr).to.be.lengthOf(strArr.length);

					param.strArr.forEach((str: string | undefined, i: number): void => {
						if (strArr[i]) {
							expect(str).to.be.eql(strArr[i]);
						}
						else {
							expect(str).to.be.eql(null); // not undefined
						}
					});
				};

				await app.route({
					[testUrl]: {
						POST: testFnc
					}
				});

				await app.listen(TestPort);
			});

			it('application/json', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				await request(server)
					.post(testUrl)
					.send({ strArr: strArr })
					.expect(200); // 200 means no error while call testFnc()
			});

			// no multipart/form-data
			// no application/x-www-form-urlencoded
		});

		describe('array contains null', () => {
			const strArr: (string | null)[] = ['str1', 'str2', null];

			beforeEach(async () => {
				const testFnc = (ctx: ParamContext): void  => {
			const param = ctx.body as {
					strArr: (string | null)[];
				};
					expect(param).to.be.a('object');

					expect(param.strArr).to.be.instanceOf(Array);
					expect(param.strArr).to.be.lengthOf(strArr.length);

					param.strArr.forEach((str: string | null, i: number): void => {
						expect(str).to.be.eql(strArr[i]);
						expect(typeof str).to.be.eql(typeof strArr[i]);
					});
				};

				await app.route({
					[testUrl]: {
						POST: testFnc
					}
				});

				await app.listen(TestPort);
			});

			it('application/json', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				await request(server)
					.post(testUrl)
					.send({ strArr: strArr })
					.expect(200); // 200 means no error while call testFnc()
			});

			// no multipart/form-data
			// no application/x-www-form-urlencoded
		});
	});

	describe('listen()', () => {
		it('defined', () => {
			expect(app.listen).to.be.a('function');
		});

		describe('error', () => {
			it('no port param', () => {
				return promiseFail(
					app.listen(undefined as unknown as number)
				);
			});

			it('run twice', () => {
				return promiseFail(
					app.listen(TestPort)
						.then(() => {
							return app.listen(TestPort);
						})
				);
			});
		});

		it('ok', () => {
			return app.listen(TestPort);
		});

		describe('POST request with form body', () => {
			const testUri: string = '/users';

			const firstName: string = 'Janghyun';
			const lastName: string = 'Han';

			let testFncCalled: boolean = false;


			beforeEach(async () => {
				const testFnc = async <T> (ctx: ParamContext): Promise<T> => {
			const param = ctx.body as T;
					testFncCalled = true;

					expect(param).to.be.a('object');

					expect(param).to.have.property('firstName', firstName);
					expect(param).to.have.property('lastName', lastName);

					// returns param data
					return param;
				};

				testFncCalled = false;

				await app.route({
					[testUri]: {
						POST: testFnc
					}
				});

				await app.listen(TestPort);
			});

			afterEach(async () => {
				await app.stop();
			});

			it('application/json', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				await request(server)
					.post('/users')
					.send({
						firstName,
						lastName
					})
					.expect(200)
					.then((res: SuperTestResponse) => {
						expect(res).to.be.a('object');

						expect(res.body).to.be.a('object');
						expect(res.body).to.have.property('firstName', firstName);
						expect(res.body).to.have.property('lastName', lastName);
					});

				expect(testFncCalled).to.be.true;
			});

			it('multipart/form-data', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				await request(server)
					.post('/users')
					.field('firstName', firstName)
					.field('lastName', lastName)
					.expect(200)
					.then((res: SuperTestResponse) => {
						expect(res).to.be.a('object');

						expect(res.body).to.be.a('object');
						expect(res.body).to.have.property('firstName', firstName);
						expect(res.body).to.have.property('lastName', lastName);
					});

				expect(testFncCalled).to.be.true;
			});

			it('application/x-www-form-urlencoded', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				await request(server)
					.post('/users')
					.send(`firstName=${ firstName }&lastName=${ lastName }`)
					.expect(200)
					.then((res: SuperTestResponse) => {
						expect(res).to.be.a('object');

						expect(res.body).to.be.a('object');
						expect(res.body).to.have.property('firstName', firstName);
						expect(res.body).to.have.property('lastName', lastName);
					});

				expect(testFncCalled).to.be.true;
			});
		});

		describe('POST request with file attached', () => {
			const testUri: string = '/file';

			const firstName: string = 'Janghyun';
			const lastName: string = 'Han';

			const fileFieldName: string = 'fileAttached';

			const fileName: string = 'postFormDataSample.txt';
			let fileContents: string;

			let testFncCalled: boolean = false;


			beforeEach(async () => {
				fileContents = readFileSync(`./spec/${ fileName }`).toString();

				const testFnc = async <T> (ctx: ParamContext): Promise<T> => {
			const param = ctx.body as T;
					testFncCalled = true;

					expect(param).to.be.a('object');
					expect(param).to.have.property('firstName', firstName);
					expect(param).to.have.property('lastName', lastName);
					expect(param).to.have.property(fileFieldName);
					// skip check file contents

					// returns param data
					return param;
				};

				testFncCalled = false;

				await app.route({
					[testUri]: {
						POST: testFnc
					}
				});

				await app.listen(TestPort);
			});

			afterEach(async () => {
				await app.stop();
			});


			it('multipart/form-data - text/plain', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				await request(server)
					.post(testUri)
					.field({
						firstName,
						lastName
					})
					.attach(fileFieldName, `./spec/${ fileName }`)
					.expect(200)
					.then((res: SuperTestResponse) => {
						expect(res).to.be.a('object');

						expect(res.body).to.be.a('object');
						expect(res.body).to.have.property('firstName', firstName);
						expect(res.body).to.have.property('lastName', lastName);
						expect(res.body).to.have.property(fileFieldName, fileContents);
					});

				expect(testFncCalled).to.be.true;
			});

			it('multipart/form-data - application/octet-stream', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				await request(server)
					.post(testUri)
					.field({
						firstName,
						lastName
					})
					.attach(fileFieldName, `./spec/${ fileName }`, {
						contentType: 'application/octet-stream'
					})
					.expect(200)
					.then((res: SuperTestResponse) => {
						expect(res).to.be.a('object');

						expect(res.body).to.be.a('object');
						expect(res.body).to.have.property('firstName', firstName);
						expect(res.body).to.have.property('lastName', lastName);

						expect(res.body).to.have.property(fileFieldName);

						const fileContentsConverted: Buffer = Buffer.from(res.body[fileFieldName], 'base64');
						expect(fileContentsConverted.toString()).to.be.eql(fileContents);
					});

				expect(testFncCalled).to.be.true;
			});
		});

		describe('multipart/form-data parsing', () => {
			let receivedParam: Record<string, unknown> | undefined;

			const pngFilePath: string = './spec/static/test.png';
			let pngFileData: Buffer;

			beforeEach(async () => {
				receivedParam = undefined;
				pngFileData = readFileSync(pngFilePath);

				await app.post('/upload', (ctx: ParamContext): void  => {
			const param = ctx.body as Record<string, unknown>;
					receivedParam = param;
				});

				await app.listen(TestPort);
			});

			it('multiline and non-ASCII field values', async () => {
				await request(app.getHttpServer())
					.post('/upload')
					.field('multiline', 'line1\r\nline2\nline3')
					.field('korean', '한글 값')
					.field('last', 'v')
					.expect(200);

				expect(receivedParam).to.be.eql({
					multiline: 'line1\r\nline2\nline3',
					korean: '한글 값',
					last: 'v'
				});
			});

			it('array field', async () => {
				await request(app.getHttpServer())
					.post('/upload')
					.field('list[]', 'a')
					.field('list[]', 'b')
					.expect(200);

				expect(receivedParam).to.be.eql({ list: ['a', 'b'] });
			});

			it('image file is passed as Buffer without corruption', async () => {
				await request(app.getHttpServer())
					.post('/upload')
					.attach('image', pngFilePath, { contentType: 'image/png' })
					.expect(200);

				expect(receivedParam).to.have.property('image');

				const image: unknown = (receivedParam as Record<string, unknown>).image;

				expect(Buffer.isBuffer(image)).to.be.true;
				expect((image as Buffer).equals(pngFileData)).to.be.true;
			});

			it('text/plain file content is kept exactly', async () => {
				const contents: string = 'hello\r\nworld';

				await request(app.getHttpServer())
					.post('/upload')
					.attach('text', Buffer.from(contents), { filename: 'a.txt', contentType: 'text/plain' })
					.expect(200);

				expect(receivedParam).to.be.eql({ text: contents });
			});

			it('quoted boundary', async () => {
				const boundary: string = 'my boundary';

				await request(app.getHttpServer())
					.post('/upload')
					.set('Content-Type', `multipart/form-data; boundary="${ boundary }"`)
					.send([
						`--${ boundary }`,
						'Content-Disposition: form-data; name="a"',
						'',
						'1',
						`--${ boundary }--`,
						''
					].join('\r\n'))
					.expect(200);

				expect(receivedParam).to.be.eql({ a: '1' });
			});

			it('boundary-like bytes in content are not a delimiter', async () => {
				const contents: string = 'line\r\n--abcNOT_A_DELIMITER\r\nmore';

				await request(app.getHttpServer())
					.post('/upload')
					.set('Content-Type', 'multipart/form-data; boundary=abc')
					.send([
						'--abc',
						'Content-Disposition: form-data; name="file"; filename="a.txt"',
						'Content-Type: text/plain',
						'',
						contents,
						'--abc--',
						''
					].join('\r\n'))
					.timeout(500)
					.expect(200);

				expect(receivedParam).to.be.eql({ file: contents });
			});

			it('transport padding after boundary', async () => {
				await request(app.getHttpServer())
					.post('/upload')
					.set('Content-Type', 'multipart/form-data; boundary=abc')
					.send('--abc  \r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--abc--\r\n')
					.timeout(500)
					.expect(200);

				expect(receivedParam).to.be.eql({ a: '1' });
			});

			it('preamble and epilogue are ignored', async () => {
				await request(app.getHttpServer())
					.post('/upload')
					.set('Content-Type', 'multipart/form-data; boundary=abc')
					.send('preamble\r\n--abc\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--abc--\r\nepilogue')
					.timeout(500)
					.expect(200);

				expect(receivedParam).to.be.eql({ a: '1' });
			});

			it('malformed body responds 400', async () => {
				await request(app.getHttpServer())
					.post('/upload')
					.set('Content-Type', 'multipart/form-data; boundary=abc')
					.send('--abc\r\nContent-Disposition: form-data; name="a"\r\n\r\nno close delimiter')
					.timeout(500)
					.expect(400);
			});
		});
	});

	describe('4-methods', () => {
		const methodArr: (keyof Badak)[] = ['get', 'post', 'put', 'patch', 'delete'];

		methodArr.forEach((method: keyof Badak): void => {
			const testFnc: RouteFunction = (): void => {
				// do nothing
			};

			describe(`${ method }()`, () => {
				it('defined', () => {
					expect(app[method]).to.be.a('function');
				});

				describe('error', () => {
					it('no address', () => {
						return promiseFail(
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(app as any)[method](undefined as unknown as string, testFnc)
						);
					});

					it('no function', () => {
						return promiseFail(
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(app as any)[method]('/users', undefined as unknown as RouteFunction)
						);
					});
				});

				it('ok - normal function', async () => {
					const uri: string = '/users';
					let fncRun: boolean = false;

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					await (app as any)[method](uri, async () => {
						fncRun = true;

						return {
							data: ['user1', 'user2']
						};
					});

					await app.listen(TestPort);


					const server: Server | undefined = app.getHttpServer();

					if (server === undefined) {
						throw new Error('spec failed');
					}

					const requestObj = request(server);
					let requestFnc: SuperTestExpect | undefined;

					switch (method) {
						case 'get':
							requestFnc = requestObj.get(uri);
							break;

						case 'post':
							requestFnc = requestObj.post(uri);
							break;

						case 'put':
							requestFnc = requestObj.put(uri);
							break;

						case 'patch':
							requestFnc = requestObj.patch(uri);
							break;

						case 'delete':
							requestFnc = requestObj.delete(uri);
							break;
					}

					await requestFnc?.expect(200)
						.then((res: SuperTestResponse) => {
							expect(res).to.be.a('object');

							expect(res.body).to.be.a('object');
							expect(res.body.data).to.be.instanceOf(Array);
							expect(res.body.data.length).to.be.eql(2);
						});

					expect(fncRun).to.be.true;
				});

				it('ok - async function', async () => {
					const uri: string = '/users';
					let fncRun: boolean = false;

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					await (app as any)[method](uri, async () => {
						fncRun = true;

						return {
							data: ['user1', 'user2']
						};
					});

					await app.listen(TestPort);


					const server: Server | undefined = app.getHttpServer();

					if (server === undefined) {
						throw new Error('spec failed');
					}

					const requestObj = request(server);
					let requestFnc: SuperTestExpect | undefined;

					switch (method) {
						case 'get':
							requestFnc = requestObj.get(uri);
							break;

						case 'post':
							requestFnc = requestObj.post(uri);
							break;

						case 'put':
							requestFnc = requestObj.put(uri);
							break;

						case 'patch':
							requestFnc = requestObj.patch(uri);
							break;

						case 'delete':
							requestFnc = requestObj.delete(uri);
							break;
					}

					if (requestFnc) {
						await requestFnc
							.expect(200)
							.then((res: SuperTestResponse) => {
								expect(res).to.be.a('object');
								expect(res.body).to.be.a('object');
								expect(res.body.data).to.be.instanceOf(Array);
								expect(res.body.data.length).to.be.eql(2);
							});

						expect(fncRun).to.be.true;
					}
				});

				it('ok - url abbreviation', async () => {
					const uri: string = '/users/a/b/c';
					let fncRun: boolean = false;

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					await (app as any)[method](uri, async () => {
						fncRun = true;

						return {
							data: ['user1', 'user2']
						};
					});

					await app.listen(TestPort);


					const server: Server | undefined = app.getHttpServer();

					if (server === undefined) {
						throw new Error('spec failed');
					}

					const requestObj = request(server);
					let requestFnc: SuperTestExpect | undefined;

					switch (method) {
						case 'get':
							requestFnc = requestObj.get(uri);
							break;

						case 'post':
							requestFnc = requestObj.post(uri);
							break;

						case 'put':
							requestFnc = requestObj.put(uri);
							break;

						case 'patch':
							requestFnc = requestObj.patch(uri);
							break;

						case 'delete':
							requestFnc = requestObj.delete(uri);
							break;
					}

					if (requestFnc) {
						await requestFnc?.expect(200)
							.then((res: SuperTestResponse) => {
								expect(res).to.be.a('object');
								expect(res.body).to.be.a('object');
								expect(res.body.data).to.be.instanceOf(Array);
								expect(res.body.data.length).to.be.eql(2);
							});

						expect(fncRun).to.be.true;
					}
				});

				it('ok - assign different uri', async () => {
					const uri1: string = '/users/1';
					const uri2: string = '/users/2';

					let fnc1RunFlag: boolean = false;
					let fnc2RunFlag: boolean = false;

					const fnc1 = async (): Promise<void> => {
						fnc1RunFlag = true;
					};
					const fnc2 = async (): Promise<void> => {
						fnc2RunFlag = true;
					};


					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					await (app as any)[method](uri1, fnc1);

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					await (app as any)[method](uri2, fnc2);


					await app.listen(TestPort);


					const server: Server | undefined = app.getHttpServer();

					if (server === undefined) {
						throw new Error('spec failed');
					}

					const requestObj1 = request(server);
					let requestFnc1: SuperTestExpect | undefined;

					switch (method) {
						case 'get':
							requestFnc1 = requestObj1.get(uri1);
							break;

						case 'post':
							requestFnc1 = requestObj1.post(uri1);
							break;

						case 'put':
							requestFnc1 = requestObj1.put(uri1);
							break;

						case 'patch':
							requestFnc1 = requestObj1.patch(uri1);
							break;

						case 'delete':
							requestFnc1 = requestObj1.delete(uri1);
							break;
					}

					await requestFnc1?.expect(200);

					expect(fnc1RunFlag).to.be.true;
					expect(fnc2RunFlag).to.be.false;

					const requestObj2 = request(server);
					let requestFnc2: SuperTestExpect | undefined;

					switch (method) {
						case 'get':
							requestFnc2 = requestObj2.get(uri2);
							break;

						case 'post':
							requestFnc2 = requestObj2.post(uri2);
							break;

						case 'put':
							requestFnc2 = requestObj2.put(uri2);
							break;

						case 'patch':
							requestFnc2 = requestObj2.patch(uri2);
							break;

						case 'delete':
							requestFnc2 = requestObj2.delete(uri2);
							break;
					}

					await requestFnc2?.expect(200);

					expect(fnc1RunFlag).to.be.true;
					expect(fnc2RunFlag).to.be.true;
				});
			});
		});
	});

	describe('stop()', () => {
		it('defined', () => {
			expect(app.stop).to.be.a('function');
		});

		describe('error', () => {
			it('not started', () => {
				return promiseFail(
					app.stop()
				);
			});

			[-1, NaN, '1000', 1.5, -Infinity, 2 ** 31, Number.MAX_SAFE_INTEGER].forEach((timeout: unknown): void => {
				it(`invalid timeout : ${ String(timeout) }`, async () => {
					await app.listen(TestPort);

					await promiseFail(
						app.stop(timeout as number)
					);
				});
			});
		});

		it('ok', async () => {
			await app.listen(TestPort);

			await app.stop();
		});

		describe('with connections', () => {
			// response is started but never ended, like SSE
			const openEndlessRequest = async (): Promise<ClientRequest> => {
				await app.get('/endless', (ctx: ParamContext): void  => {
			const param = ctx.body as unknown, req: IncomingMessage, res: ServerResponse;
					res.writeHead(200, { 'Content-Type': 'text/event-stream' });
					res.write('data: 1\n\n');
				});

				await app.listen(TestPort);

				return new Promise((resolve): void => {
					const req: ClientRequest = httpRequest({ port: TestPort, path: '/endless' }, (res: IncomingMessage): void => {
						res.resume();
						resolve(req);
					});

					req.on('error', (): void => {
						// closed by server
					});

					req.end();
				});
			};

			it('idle keep-alive connection doesn\'t block', async () => {
				await app.get('/test', (): string => 'ok');
				await app.listen(TestPort);

				const agent: Agent = new Agent({ keepAlive: true });

				try {
					await new Promise<void>((resolve): void => {
						httpRequest({ port: TestPort, path: '/test', agent }, (res: IncomingMessage): void => {
							res.resume();
							res.on('end', resolve);
						}).end();
					});

					const start: number = Date.now();
					await app.stop();

					expect(Date.now() - start).to.be.below(500);
					expect(app.isRunning()).to.be.false;
				}
				finally {
					agent.destroy();
				}
			});

			it('waits for in-flight request without timeout', async () => {
				const req: ClientRequest = await openEndlessRequest();

				let stopped: boolean = false;
				const stopPromise: Promise<void> = app.stop().then((): void => {
					stopped = true;
				});

				await new Promise((resolve) => setTimeout(resolve, 200));
				expect(stopped).to.be.false;

				// client closes the connection
				req.destroy();
				await stopPromise;

				expect(stopped).to.be.true;
				expect(app.isRunning()).to.be.false;
			});

			[2 ** 31 - 1, Infinity].forEach((timeout: number): void => {
				it(`timeout ${ timeout } waits, not closes immediately`, async () => {
					const req: ClientRequest = await openEndlessRequest();

					let stopped: boolean = false;
					const stopPromise: Promise<void> = app.stop(timeout).then((): void => {
						stopped = true;
					});

					await new Promise((resolve) => setTimeout(resolve, 200));
					expect(stopped).to.be.false;

					req.destroy();
					await stopPromise;

					expect(stopped).to.be.true;
				});
			});

			it('closes remaining connections after timeout', async () => {
				const req: ClientRequest = await openEndlessRequest();

				const start: number = Date.now();
				await app.stop(100);
				const elapsed: number = Date.now() - start;

				expect(elapsed).to.be.at.least(90);
				expect(elapsed).to.be.below(500);
				expect(app.isRunning()).to.be.false;

				req.destroy();
			});
		});
	});
});
