import { Server } from 'node:net';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Response, Test as SuperTestExpect } from 'supertest';

import { Badak } from '../src/badak';
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
				const testFnc = (param: {
					str: string;
				}): void => {
					expect(param).to.be.ok;
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
				const testFnc = (param: {
					strArr: string[];
				}): void => {
					expect(param).to.be.ok;
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
				const testFnc = (param: {
					strArr: (string | undefined)[];
				}): void => {
					expect(param).to.be.ok;
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
				const testFnc = (param: {
					strArr: (string | null)[];
				}): void => {
					expect(param).to.be.ok;
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
			expect(app.listen).to.be.ok;
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
				const testFnc = async <T> (param: T): Promise<T> => {
					testFncCalled = true;

					expect(param).to.be.ok;
					expect(param).to.be.instanceOf(Object);

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

				const res = await request(server)
					.post('/users')
					.send({
						firstName,
						lastName
					})
					.expect(200);

				expect(res).to.be.ok;
				expect(testFncCalled).to.be.true;

				expect(res.body).to.be.ok;
				expect(res.body).to.be.instanceOf(Object);
				expect(res.body).to.have.property('firstName', firstName);
				expect(res.body).to.have.property('lastName', lastName);
			});

			it('multipart/form-data', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				const res = await request(server)
					.post('/users')
					.field('firstName', firstName)
					.field('lastName', lastName)
					.expect(200);

				expect(res).to.be.ok;
				expect(testFncCalled).to.be.true;

				expect(res.body).to.be.ok;
				expect(res.body).to.be.instanceOf(Object);
				expect(res.body).to.have.property('firstName', firstName);
				expect(res.body).to.have.property('lastName', lastName);
			});

			it('application/x-www-form-urlencoded', async () => {
				const server: Server | undefined = app.getHttpServer();

				if (server === undefined) {
					throw new Error('spec failed');
				}

				const res = await request(server)
					.post('/users')
					.send(`firstName=${ firstName }&lastName=${ lastName }`)
					.expect(200);

				expect(res).to.be.ok;
				expect(testFncCalled).to.be.true;

				expect(res.body).to.be.ok;
				expect(res.body).to.be.instanceOf(Object);
				expect(res.body).to.have.property('firstName', firstName);
				expect(res.body).to.have.property('lastName', lastName);
			});
		});

		// http://derpturkey.com/node-multipart-form-data-explained/
		// TODO: ok - POST request with file attached
		// request(app)
		// 	.post('/some/where')
		// 	.field('someFormData', JSON.stringify(formData))
		// 	.set('Content-Type',  'application/octet-stream')
		// 	.attach('someFile', 'someFile.csv')
		// 	.expect(400)
		// 	.end(done);
	});

	describe('4-methods', () => {
		const methodArr: (keyof Badak)[] = ['get', 'post', 'put', 'delete'];

		methodArr.forEach((method: keyof Badak): void => {
			const testFnc: RouteFunction = (): void => {
				// do nothing
			};

			describe(`${ method }()`, () => {
				it('defined', () => {
					expect(app[method]).to.be.ok;
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

						case 'delete':
							requestFnc = requestObj.delete(uri);
							break;
					}

					const res: Response | undefined = await requestFnc?.expect(200);

					expect(res).to.be.ok;
					expect(fncRun).to.be.true;

					if (!res) {
						throw new Error('spec failed');
					}

					expect(res.body).to.be.ok;
					expect(res.body).to.be.instanceOf(Object);
					expect(res.body.data).to.be.ok;
					expect(res.body.data).to.be.instanceOf(Array);
					expect(res.body.data.length).to.be.eql(2);
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

						case 'delete':
							requestFnc = requestObj.delete(uri);
							break;
					}

					if (requestFnc) {
						const res: Response | undefined = await requestFnc.expect(200);

						expect(res).to.be.ok;
						expect(fncRun).to.be.true;

						if (!res) {
							throw new Error('spec failed');
						}

						expect(res.body).to.be.ok;
						expect(res.body).to.be.instanceOf(Object);
						expect(res.body.data).to.be.ok;
						expect(res.body.data).to.be.instanceOf(Array);
						expect(res.body.data.length).to.be.eql(2);
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

						case 'delete':
							requestFnc = requestObj.delete(uri);
							break;
					}

					if (requestFnc) {
						const res: Response | undefined = await requestFnc?.expect(200);

						expect(res).to.be.ok;
						expect(fncRun).to.be.true;

						if (!res) {
							throw new Error('spec failed');
						}

						expect(res.body).to.be.ok;
						expect(res.body).to.be.instanceOf(Object);
						expect(res.body.data).to.be.ok;
						expect(res.body.data).to.be.instanceOf(Array);
						expect(res.body.data.length).to.be.eql(2);
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

						case 'delete':
							requestFnc1 = requestObj1.delete(uri1);
							break;
					}

					const res1 = await requestFnc1?.expect(200);

					expect(res1).to.be.ok;
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

						case 'delete':
							requestFnc2 = requestObj2.delete(uri2);
							break;
					}

					const res2 = await requestFnc2?.expect(200);

					expect(res2).to.be.ok;
					expect(fnc1RunFlag).to.be.true;
					expect(fnc2RunFlag).to.be.true;
				});
			});
		});
	});

	describe('stop()', () => {
		it('defined', () => {
			expect(app.stop).to.be.ok;
		});

		describe('error', () => {
			it('not started', () => {
				return promiseFail(
					app.stop()
				);
			});
		});

		it('ok', async () => {
			await app.listen(TestPort);

			await app.stop();
		});
	});
});
