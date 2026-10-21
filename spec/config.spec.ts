import { Agent, request as httpRequest } from 'node:http';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Test as SuperTestExpect } from 'supertest';

import { Badak } from '../src/badak';
import { ParamContext } from '../src/interfaces';
import { DEFAULT_BODY_LIMIT, METHOD } from '../src/constants';
import { BadakOption, RouteRule, TypedObject } from '../src/interfaces';
import { promiseFail, TestPort } from './test-util';


describe('config()', () => {
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


	it('config itself defined', () => {
		expect(app.config).to.be.a('function');
	});

	it('not defined key', () => {
		return promiseFail(
			app.config('somethingNotDefinedKey', true)
		);
	});

	describe('invalid value', () => {
		const booleanKeys: string[] = ['catchErrorLog', 'preventError', 'parseNumber', 'parseDate'];

		booleanKeys.forEach((key: string): void => {
			it(key + ' - undefined', () => {
				return promiseFail(
					app.config(key, undefined)
				);
			});

			it(key + ' - null', () => {
				return promiseFail(
					app.config(key, null)
				);
			});

			it(key + ' - string', () => {
				return promiseFail(
					app.config(key, 'hello')
				);
			});

			it(key + ' - number', () => {
				return promiseFail(
					app.config(key, 123)
				);
			});
		});
	});

	describe('parseNumber', () => {
		// no application/json, it can parse already
		interface TestObj {
			num: number;
			float: number;
		}

		const testUrl: string = '/parseNumber';

		const num: number = 123;
		const float: number = 123.45;

		const testFncStr = (ctx: ParamContext): void  => {
			const param = ctx.body as TestObj;
			expect(param).to.be.a('object');

			expect(param.num).to.be.a('string');
			expect(param.num).to.be.eql('' + num);

			expect(param.float).to.be.a('string');
			expect(param.float).to.be.eql('' + float);
		};

		const testFncNum = (ctx: ParamContext): void  => {
			const param = ctx.body as TestObj;
			expect(param).to.be.a('object');

			expect(param.num).to.be.a('number');
			expect(param.num).to.be.eql(num);

			expect(param.float).to.be.a('number');
			expect(param.float).to.be.eql(float);
		};

		describe('default - false', () => {
			beforeEach(async () => {
				await app.route({
					[testUrl]: {
						POST: testFncStr
					}
				});

				await app.listen(TestPort);
			});

			it('multipart/form-data', async () => {
				await request(app.getHttpServer())
					.post(testUrl)
					.field('num', num)
					.field('float', float)
					.expect(200);
			});

			it('application/x-www-form-urlencoded', async () => {
				await request(app.getHttpServer())
					.post(testUrl)
					.send(`num=${ num }&float=${ float }`)
					.expect(200);
			});
		});

		describe('true', () => {
			beforeEach(async () => {
				await app.route({
					[testUrl]: {
						POST: testFncNum
					}
				});

				await app.config('parseNumber', true);

				await app.listen(TestPort);
			});

			it('multipart/form-data', async () => {
				await request(app.getHttpServer())
					.post(testUrl)
					.field('num', num)
					.field('float', float)
					.expect(200);
			});

			it('application/x-www-form-urlencoded', async () => {
				await request(app.getHttpServer())
					.post(testUrl)
					.send(`num=${ num }&float=${ float }`)
					.expect(200);
			});
		});

		describe('in array', () => {
			describe('single value', () => {
				it('application/json', async () => {
					const testFnc = (ctx: ParamContext): void  => {
			const param = ctx.body as number[];
						expect(param).to.be.instanceOf(Array);

						param.forEach((value: number): void => {
							expect(value).to.be.a('number');
						});
					};

					await app.route({
						[testUrl]: {
							POST: testFnc
						}
					});

					await app.config('parseNumber', true);

					await app.listen(TestPort);

					await request(app.getHttpServer())
						.post(testUrl)
						.send([num, float])
						.expect(200); // 200 means no error while call testFnc()
				});

				it('multipart/form-data', async () => {
					const testFnc = (ctx: ParamContext): void  => {
			const param = ctx.body as {
						num: number[];
						float: number[];
					};
						expect(param).to.be.a('object');
						expect(param.num).to.be.instanceOf(Array);

						param.num.forEach((value: number): void => {
							expect(value).to.be.a('number');
						});

						param.float.forEach((value: number): void => {
							expect(value).to.be.a('number');
						});
					};

					await app.route({
						[testUrl]: {
							POST: testFnc
						}
					});

					await app.config('parseNumber', true);

					await app.listen(TestPort);

					await request(app.getHttpServer())
						.post(testUrl)
						.field('num[]', num)
						.field('num[]', num * 2)
						.field('float[]', float)
						.field('float[]', float * 2)
						.expect(200); // 200 means no error while call testFnc()
				});

				it('application/x-www-form-urlencoded', async () => {
					const testFnc = (ctx: ParamContext): void  => {
			const param = ctx.body as {
						num: number[];
						float: number[];
					};
						expect(param).to.be.a('object');
						expect(param.num).to.be.instanceOf(Array);

						param.num.forEach((value: number): void => {
							expect(value).to.be.a('number');
						});

						param.float.forEach((value: number): void => {
							expect(value).to.be.a('number');
						});
					};

					await app.route({
						[testUrl]: {
							POST: testFnc
						}
					});

					await app.config('parseNumber', true);

					await app.listen(TestPort);

					await request(app.getHttpServer())
						.post(testUrl)
						.send(`num[]=${ num }&num[]=${ num * 2 }&float[]=${ float }&float[]=${ float * 2 }`)
						.expect(200); // 200 means no error while call testFnc()
				});
			});

			describe('object', () => {
				it('application/json', async () => {
					const testFnc = (ctx: ParamContext): void  => {
			const param = ctx.body as TestObj[];
						expect(param).to.be.instanceOf(Array);

						expect(param[0].num).to.be.a('number');
						expect(param[0].float).to.be.a('number');
					};

					await app.route({
						[testUrl]: {
							POST: testFnc
						}
					});

					await app.config('parseNumber', true);

					await app.listen(TestPort);

					await request(app.getHttpServer())
						.post(testUrl)
						.send([{
							num: num,
							float: float
						}])
						.expect(200); // 200 means no error while call testFnc()
				});

				// not support : multipart/form-data
				// not support : application/x-www-form-urlencoded
			});
		});
	});

	describe('parseDate', () => {
		const testUrl: string = '/parseDate';

		const num: number = 135; // should not parse
		const float: number = 246.89; // should not parse
		const dateStr: string = (new Date).toISOString();
		const noDateStr: string = 'noDateString';

		describe('default - false', () => {
			interface TestObj {
				num: number;
				float: number;
				date: string;
				noDate: string;
			}

			const testFncJson = (ctx: ParamContext): void  => {
			const param = ctx.body as TestObj;
				expect(param).to.be.a('object');

				expect(param.num).to.be.a('number'); // not string
				expect(param.num).to.be.eql(num);

				expect(param.float).to.be.a('number'); // not string
				expect(param.float).to.be.eql(float);

				expect(param.date).to.be.a('string');

				expect(param.noDate).to.be.a('string');
				expect(param.noDate).to.be.eql(noDateStr);
			};

			const testFncStr = (ctx: ParamContext): void  => {
			const param = ctx.body as TestObj;
				expect(param).to.be.a('object');

				expect(param.num).to.be.a('string');
				expect(param.num).to.be.eql('' + num);

				expect(param.float).to.be.a('string');
				expect(param.float).to.be.eql('' + float);

				expect(param.date).to.be.a('string');

				expect(param.noDate).to.be.a('string');
				expect(param.noDate).to.be.eql(noDateStr);
			};

			it('application/json', async () => {
				await app.route({
					[testUrl]: {
						POST: testFncJson
					}
				});

				await app.listen(TestPort);

				await request(app.getHttpServer())
					.post(testUrl)
					.send({
						num: num,
						float: float,
						date: dateStr,
						noDate: noDateStr
					})
					.expect(200); // 200 means no error while call testFncStr()
			});

			it('multipart/form-data', async () => {
				await app.route({
					[testUrl]: {
						POST: testFncStr
					}
				});

				await app.listen(TestPort);

				await request(app.getHttpServer())
					.post(testUrl)
					.field('num', num)
					.field('float', float)
					.field('date', dateStr)
					.field('noDate', noDateStr)
					.expect(200); // 200 means no error while call testFncStr()
			});

			it('application/x-www-form-urlencoded', async () => {
				await app.route({
					[testUrl]: {
						POST: testFncStr
					}
				});

				await app.listen(TestPort);

				await request(app.getHttpServer())
					.post(testUrl)
					.send(`num=${ num }&float=${ float }&date=${ dateStr }&noDate=${ noDateStr }`)
					.expect(200); // 200 means no error while call testFncStr()
			});
		});

		describe('true', () => {
			interface TestObj {
				num: number;
				float: number;
				date: Date;
				noDate: string;
			}

			const testFncJson = (ctx: ParamContext): void  => {
			const param = ctx.body as TestObj;
				expect(param).to.be.a('object');

				expect(param.num).to.be.a('number'); // not string
				expect(param.num).to.be.eql(num);

				expect(param.float).to.be.a('number'); // not string
				expect(param.float).to.be.eql(float);

				expect(param.date).to.be.instanceOf(Date);

				expect(param.noDate).to.be.a('string');
				expect(param.noDate).to.be.eql(noDateStr);
			};

			const testFncStr = (ctx: ParamContext): void  => {
			const param = ctx.body as TestObj;
				expect(param).to.be.a('object');

				expect(param.num).to.be.a('string');
				expect(param.num).to.be.eql('' + num);

				expect(param.float).to.be.a('string');
				expect(param.float).to.be.eql('' + float);

				expect(param.date).to.be.instanceOf(Date);

				expect(param.noDate).to.be.a('string');
				expect(param.noDate).to.be.eql(noDateStr);
			};

			it('application/json', async () => {
				await app.route({
					[testUrl]: {
						POST: testFncJson
					}
				});

				await app.config('parseDate', true);

				await app.listen(TestPort);

				await request(app.getHttpServer())
					.post(testUrl)
					.send({
						num: num,
						float: float,
						date: dateStr,
						noDate: noDateStr
					})
					.expect(200); // 200 means no error while call testFncStr()
			});

			it('multipart/form-data', async () => {
				await app.route({
					[testUrl]: {
						POST: testFncStr
					}
				});

				await app.config('parseDate', true);

				await app.listen(TestPort);

				await request(app.getHttpServer())
					.post(testUrl)
					.field('num', num)
					.field('float', float)
					.field('date', dateStr)
					.field('noDate', noDateStr)
					.expect(200); // 200 means no error while call testFncStr()
			});

			it('application/x-www-form-urlencoded', async () => {
				await app.route({
					[testUrl]: {
						POST: testFncStr
					}
				});

				await app.config('parseDate', true);

				await app.listen(TestPort);

				await request(app.getHttpServer())
					.post(testUrl)
					.send(`num=${ num }&float=${ float }&date=${ dateStr }&noDate=${ noDateStr }`)
					.expect(200); // 200 means no error while call testFncStr()
			});
		});

		describe('in array', () => {
			describe('single value', () => {
				const testFnc = (ctx: ParamContext): void  => {
			const param = ctx.body as {
					arr: Date[];
				};
					expect(param).to.be.a('object');

					expect(param.arr).to.be.instanceOf(Array);
					param.arr.forEach((value: Date): void => {
						expect(value).to.be.instanceOf(Date);
					});
				};

				beforeEach(async () => {
					await app.route({
						[testUrl]: {
							POST: testFnc
						}
					});

					await app.config('parseDate', true);

					await app.listen(TestPort);
				});

				it('application/json', async () => {
					await request(app.getHttpServer())
						.post(testUrl)
						.send({
							arr: [dateStr]
						})
						.expect(200); // 200 means no error while call testFnc()
				});

				it('multipart/form-data', async () => {
					await request(app.getHttpServer())
						.post(testUrl)
						.field('arr[]', dateStr)
						.field('arr[]', dateStr)
						.expect(200); // 200 means no error while call testFnc()
				});

				it('application/x-www-form-urlencoded', async () => {
					await request(app.getHttpServer())
						.post(testUrl)
						.send(`arr[]=${ dateStr }&arr[]=${ dateStr }`)
						.expect(200); // 200 means no error while call testFncStr()
				});
			});

			describe('object', () => {
				interface TestObj {
					value: string;
				}

				const testFnc = (ctx: ParamContext): void  => {
			const param = ctx.body as TestObj[];
					expect(param).to.be.instanceOf(Array);

					expect(param[0].value).to.be.instanceOf(Date);
				};

				it('application/json', async () => {
					await app.route({
						[testUrl]: {
							POST: testFnc
						}
					});

					await app.config('parseDate', true);

					await app.listen(TestPort);

					await request(app.getHttpServer())
						.post(testUrl)
						.send([{
							value: dateStr
						}])
						.expect(200); // 200 means no error while call testFnc()
				});

				// not support : multipart/form-data
				// not support : application/x-www-form-urlencoded
			});
		});
	});

	describe('defaultMethod', () => {
		const testUri: string = '/defaultMethod';
		const testUriRefined: string = testUri.replace('/', '');

		const methods: METHOD[] = [METHOD.GET, METHOD.POST, METHOD.PUT, METHOD.PATCH, METHOD.DELETE];

		const echoFnc = <T> (ctx: ParamContext): T  => {
			const param = ctx.body as T;
			return param;
		};

		const getReqFnc = (method: string): SuperTestExpect => {
			const requestObj = request(app.getHttpServer());

			let requestFnc: SuperTestExpect | undefined;

			switch (method) {
				case METHOD.GET:
					requestFnc = requestObj.get(testUri);
					break;

				case METHOD.POST:
					requestFnc = requestObj.post(testUri);
					break;

				case METHOD.PUT:
					requestFnc = requestObj.put(testUri);
					break;

				case METHOD.PATCH:
					requestFnc = requestObj.patch(testUri);
					break;

				case METHOD.DELETE:
					requestFnc = requestObj.delete(testUri);
					break;
			}

			return requestFnc as SuperTestExpect;
		};

		describe('function itself', () => {
			methods.forEach((method: METHOD): void => {
				describe(method, () => {
					it('set value - capital', async () => {
						await app.config('defaultMethod', method);
					});

					it('set value - lower case', async () => {
						await app.config('defaultMethod', method.toLowerCase());

						const appConfig: BadakOption = (app as unknown as TypedObject<BadakOption>)._config;
						expect(appConfig.defaultMethod).to.be.eql(method.toUpperCase());
					});
				});
			});

			it('set value failed - not string', async () => {
				await promiseFail(
					app.config('defaultMethod', true)
				);

				await promiseFail(
					app.config('defaultMethod', false)
				);

				await promiseFail(
					app.config('defaultMethod', 123)
				);
			});

			it('set value failed - not defined method', () => {
				return promiseFail(
					app.config('defaultMethod', 'something_method')
				);
			});
		});

		it('default - can\'t set', () => {
			return promiseFail(
				app.route({
					[testUri]: echoFnc
				})
			);
		});

		describe('after set', () => {
			methods.forEach((setMethod: METHOD) => {
				describe('set ' + setMethod, () => {
					beforeEach(async () => {
						await app.config('defaultMethod', setMethod);

						await app.route({
							[testUri]: echoFnc
						});

						await app.listen(TestPort);
					});

					methods.forEach((testMethod: METHOD) => {
						it('test ' + testMethod, async () => {
							const routeRule: RouteRule = (app as unknown as TypedObject<RouteRule>)._routeRule;

							expect(routeRule).to.be.a('object');

							expect(routeRule).to.be.a('object');
							expect(routeRule).to.have.property('/');

							expect(routeRule['/']).to.have.property(testUriRefined);
							expect((routeRule['/'] as RouteRule)[testUriRefined]).to.have.property(setMethod);

							await getReqFnc(testMethod)
								// path exists for other method : 405
								.expect(setMethod === testMethod ? 200 : 405);
						});
					});
				});
			});
		});

		it('after clear - can\'t set', async () => {
			await app.config('defaultMethod', 'GET');

			await app.route({
				[testUri]: echoFnc
			});

			await app.config('defaultMethod', null);

			await promiseFail(
				app.route({
					[testUri]: echoFnc
				})
			);
		});
	});

	describe('bodyLimit', () => {
		const jsonOfSize = (size: number): string => {
			// {"a":"xxx..."} : 8 bytes + size
			return JSON.stringify({ a: 'x'.repeat(size - 8) });
		};

		// send body with chunked transfer encoding, no content-length
		const sendChunked = (body: string): Promise<number | undefined> => {
			return new Promise((resolve, reject): void => {
				const req = httpRequest({
					port: TestPort,
					method: 'POST',
					path: '/test',
					headers: {
						'content-type': 'application/json'
					}
				}, (res): void => {
					res.resume();
					res.on('end', (): void => resolve(res.statusCode));
				});

				req.on('error', reject);

				for (let i: number = 0; i < body.length; i += 16 * 1024) {
					req.write(body.slice(i, i + 16 * 1024));
				}

				req.end();
			});
		};

		let routeFncRunFlag: boolean = false;

		beforeEach(() => {
			routeFncRunFlag = false;
		});

		const listen = async (): Promise<void> => {
			await app.post('/test', (): string => {
				routeFncRunFlag = true;
				return 'ok';
			});

			await app.listen(TestPort);
		};

		describe('invalid value', () => {
			[0, -1, NaN, 0.5, 1024.5, -Infinity, '1000', true, null].forEach((value: unknown): void => {
				it(String(value), () => {
					return promiseFail(
						app.config('bodyLimit', value)
					);
				});

				it(String(value) + ' - in constructor', () => {
					expect(() => new Badak({ bodyLimit: value as number })).to.throw();
				});
			});
		});

		it('default is 100KB', async () => {
			await listen();

			await request(app.getHttpServer())
				.post('/test')
				.set('Content-Type', 'application/json')
				.send(jsonOfSize(DEFAULT_BODY_LIMIT))
				.expect(200);

			expect(routeFncRunFlag).to.be.true;
			routeFncRunFlag = false;

			await request(app.getHttpServer())
				.post('/test')
				.set('Content-Type', 'application/json')
				.send(jsonOfSize(DEFAULT_BODY_LIMIT + 1))
				.expect(413);

			expect(routeFncRunFlag).to.be.false;
		});

		it('set by config()', async () => {
			await app.config('bodyLimit', 100);
			await listen();

			await request(app.getHttpServer())
				.post('/test')
				.set('Content-Type', 'application/json')
				.send(jsonOfSize(100))
				.expect(200);

			await request(app.getHttpServer())
				.post('/test')
				.set('Content-Type', 'application/json')
				.send(jsonOfSize(101))
				.expect(413);
		});

		it('set by constructor', async () => {
			app = new Badak({
				catchErrorLog: false,
				bodyLimit: 100
			});

			await listen();

			await request(app.getHttpServer())
				.post('/test')
				.set('Content-Type', 'application/json')
				.send(jsonOfSize(101))
				.expect(413);
		});

		it('chunked request without content-length', async () => {
			await app.config('bodyLimit', 1024);
			await listen();

			expect(await sendChunked(jsonOfSize(1024))).to.be.eql(200);
			expect(await sendChunked(jsonOfSize(64 * 1024))).to.be.eql(413);

			expect(routeFncRunFlag).to.be.true; // only for the first request
		});

		it('multipart/form-data file', async () => {
			await app.config('bodyLimit', 1024);
			await listen();

			await request(app.getHttpServer())
				.post('/test')
				.attach('file', Buffer.alloc(2048), 'big.bin')
				.expect(413);

			expect(routeFncRunFlag).to.be.false;
		});

		it('Infinity removes the limit', async () => {
			await app.config('bodyLimit', Infinity);
			await listen();

			await request(app.getHttpServer())
				.post('/test')
				.set('Content-Type', 'application/json')
				.send(jsonOfSize(DEFAULT_BODY_LIMIT * 10))
				.expect(200);
		});

		it('same keep-alive connection works after rejecting large body', async () => {
			await app.config('bodyLimit', 1024);
			await listen();

			const agent: Agent = new Agent({ keepAlive: true, maxSockets: 1 });
			const sockets: Set<unknown> = new Set();

			const send = (body: string): Promise<number | undefined> => {
				return new Promise((resolve, reject): void => {
					const req = httpRequest({
						port: TestPort,
						method: 'POST',
						path: '/test',
						agent,
						headers: {
							'content-type': 'application/json',
							'content-length': Buffer.byteLength(body)
						}
					}, (res): void => {
						sockets.add(res.socket);

						res.resume();
						res.on('end', (): void => resolve(res.statusCode));
					});

					req.on('error', reject);
					req.end(body);
				});
			};

			try {
				// rejected by content-length before receiving body
				expect(await send(jsonOfSize(1024 * 1024))).to.be.eql(413);
				expect(await send(jsonOfSize(100))).to.be.eql(200);
				expect(await send(jsonOfSize(100))).to.be.eql(200);

				expect(sockets.size).to.be.eql(1);
			}
			finally {
				agent.destroy();
			}
		});

		it('server works after rejecting large body', async () => {
			await app.config('bodyLimit', 1024);
			await listen();

			await request(app.getHttpServer())
				.post('/test')
				.set('Content-Type', 'application/json')
				.send(jsonOfSize(1024 * 1024))
				.expect(413);

			await request(app.getHttpServer())
				.post('/test')
				.set('Content-Type', 'application/json')
				.send(jsonOfSize(100))
				.expect(200);
		});
	});

	describe('option validation', () => {
		it('not defined key', () => {
			expect(() => new Badak({ somethingNotDefinedKey: true })).to.throw();
		});

		it('invalid boolean value', () => {
			expect(() => new Badak({ parseNumber: 'yes' as unknown as boolean })).to.throw();
		});

		it('undefined value is ignored', () => {
			expect(() => new Badak({ bodyLimit: undefined })).not.to.throw();
		});

		it('catchErrorLog & preventError by config()', async () => {
			await app.config('catchErrorLog', true);
			await app.config('preventError', false);

			// @ts-expect-error: private property
			const config: BadakOption = app._config;

			expect(config.catchErrorLog).to.be.true;
			expect(config.preventError).to.be.false;
		});
	});
});
