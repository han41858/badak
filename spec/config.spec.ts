import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request, Test as SuperTestExpect } from 'supertest';

import { Badak } from '../src/badak';
import { METHOD } from '../src/constants';
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
		expect(app.config).to.be.ok;
	});

	it('not defined key', () => {
		return promiseFail(
			app.config('somethingNotDefinedKey', true)
		);
	});

	describe('invalid value', () => {
		const booleanKeys: string[] = ['parseNumber', 'parseDate'];

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

		const testFncStr = (param: TestObj): void => {
			expect(param).to.be.ok;

			expect(param.num).to.be.a('string');
			expect(param.num).to.be.eql('' + num);

			expect(param.float).to.be.a('string');
			expect(param.float).to.be.eql('' + float);
		};

		const testFncNum = (param: TestObj): void => {
			expect(param).to.be.ok;

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
					const testFnc = (param: number[]): void => {
						expect(param).to.be.ok;
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
					const testFnc = (param: {
						num: number[];
						float: number[];
					}): void => {
						expect(param).to.be.ok;

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
					const testFnc = (param: {
						num: number[];
						float: number[];
					}): void => {
						expect(param).to.be.ok;

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
					const testFnc = (param: TestObj[]): void => {
						expect(param).to.be.ok;
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

			const testFncJson = (param: TestObj): void => {
				expect(param).to.be.ok;

				expect(param.num).to.be.a('number'); // not string
				expect(param.num).to.be.eql(num);

				expect(param.float).to.be.a('number'); // not string
				expect(param.float).to.be.eql(float);

				expect(param.date).to.be.a('string');

				expect(param.noDate).to.be.a('string');
				expect(param.noDate).to.be.eql(noDateStr);
			};

			const testFncStr = (param: TestObj): void => {
				expect(param).to.be.ok;

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

			const testFncJson = (param: TestObj): void => {
				expect(param).to.be.ok;

				expect(param.num).to.be.a('number'); // not string
				expect(param.num).to.be.eql(num);

				expect(param.float).to.be.a('number'); // not string
				expect(param.float).to.be.eql(float);

				expect(param.date).to.be.instanceOf(Date);

				expect(param.noDate).to.be.a('string');
				expect(param.noDate).to.be.eql(noDateStr);
			};

			const testFncStr = (param: TestObj): void => {
				expect(param).to.be.ok;

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
				const testFnc = (param: {
					arr: Date[];
				}): void => {
					expect(param).to.be.ok;
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

				const testFnc = (param: TestObj[]): void => {
					expect(param).to.be.ok;
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

		const methods: METHOD[] = [METHOD.GET, METHOD.POST, METHOD.PUT, METHOD.DELETE];

		const echoFnc = <T> (param: T): T => {
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
							const routeRules: RouteRule[] = (app as unknown as TypedObject<RouteRule[]>)._routeRules;

							expect(routeRules).to.be.ok;
							expect(routeRules).to.be.instanceOf(Array);
							expect(routeRules).to.be.lengthOf(1);

							expect(routeRules[0]).to.be.ok;
							expect(routeRules[0]).to.be.instanceOf(Object);
							expect(routeRules[0]).to.have.property('/');

							expect(routeRules[0]['/']).to.have.property(testUriRefined);
							expect((routeRules[0]['/'] as RouteRule)[testUriRefined]).to.have.property(setMethod);

							await getReqFnc(testMethod)
								.expect(setMethod === testMethod ? 200 : 404);
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
});
