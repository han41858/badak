import { IncomingMessage } from 'http';
import * as fs from 'fs';
import * as path from 'path';

import { afterEach, before, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as request from 'supertest';
import { Response, Response as SuperTestResponse, Test as SuperTestExpect } from 'supertest';

import { Badak } from '../src/badak';
import { AnyObject, BadakOption, RouteFunction, RouteOption, RouteRule, RouteRuleSeed, StaticCache, StaticRule } from '../src/interfaces';
import { ContentType, Method } from '../src/constants';
import { promiseFail } from './test-util';

type SuperTestRequest = request.SuperTest<request.Test>;


const port: number = 65030;

describe('core', () => {
	let app!: Badak;

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

	describe('config()', () => {
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

					await app.listen(port);
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

					await app.listen(port);
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

						await app.listen(port);

						await request(app.getHttpServer())
							.post(testUrl)
							.send([num, float])
							.expect(200); // 200 means no error while call testFnc()
					});

					it('multipart/form-data', async () => {
						const testFnc = (param: {
							num: number[],
							float: number[]
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

						await app.listen(port);

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
							num: number[],
							float: number[]
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

						await app.listen(port);

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

						await app.listen(port);

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

					await app.listen(port);

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

					await app.listen(port);

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

					await app.listen(port);

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

					await app.listen(port);

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

					await app.listen(port);

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

					await app.listen(port);

					await request(app.getHttpServer())
						.post(testUrl)
						.send(`num=${ num }&float=${ float }&date=${ dateStr }&noDate=${ noDateStr }`)
						.expect(200); // 200 means no error while call testFncStr()
				});
			});

			describe('in array', () => {
				describe('single value', () => {
					const testFnc = (param: {
						arr: Date[]
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

						await app.listen(port);
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

						await app.listen(port);

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

			const methods: Method[] = [Method.GET, Method.POST, Method.PUT, Method.DELETE];

			const echoFnc = <T> (param: T): T => {
				return param;
			};

			const getReqFnc = (method: string): SuperTestExpect => {
				const requestObj: SuperTestRequest = request(app.getHttpServer());

				let requestFnc: SuperTestExpect | undefined;

				switch (method) {
					case Method.GET:
						requestFnc = requestObj.get(testUri);
						break;

					case Method.POST:
						requestFnc = requestObj.post(testUri);
						break;

					case Method.PUT:
						requestFnc = requestObj.put(testUri);
						break;

					case Method.DELETE:
						requestFnc = requestObj.delete(testUri);
						break;
				}

				return requestFnc as SuperTestExpect;
			};

			describe('function itself', () => {
				methods.forEach((method: Method): void => {
					describe(method, () => {
						it('set value - capital', async () => {
							await app.config('defaultMethod', method);
						});

						it('set value - lower case', async () => {
							await app.config('defaultMethod', method.toLowerCase());

							const appConfig: BadakOption = (app as unknown as AnyObject<BadakOption>)._config;
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
				methods.forEach((setMethod: Method) => {
					describe('set ' + setMethod, () => {
						beforeEach(async () => {
							await app.config('defaultMethod', setMethod);

							await app.route({
								[testUri]: echoFnc
							});

							await app.listen(port);
						});

						methods.forEach((testMethod: Method) => {
							it('test ' + testMethod, async () => {
								const routeRules: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;

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

	describe('_paramParser()', () => {
		const testUrl: string = '/paramParser';

		describe('single string', () => {
			const str: string = 'string_value';
			const testFnc = (param: {
				str: string
			}): void => {
				expect(param).to.be.ok;
				expect(param).to.be.a('object');
				expect(param.str).to.be.eql(str);
			};

			it('application/json', async () => {
				await app.route({
					[testUrl]: {
						POST: testFnc
					}
				});

				await app.listen(port);

				await request(app.getHttpServer())
					.post(testUrl)
					.send({ str })
					.expect(200); // 200 means no error while call testFnc()
			});

			it('multipart/form-data', async () => {
				await app.route({
					[testUrl]: {
						POST: testFnc
					}
				});

				await app.listen(port);

				await request(app.getHttpServer())
					.post(testUrl)
					.field('str', str)
					.expect(200); // 200 means no error while call testFnc()
			});

			it('application/x-www-form-urlencoded', async () => {
				await app.route({
					[testUrl]: {
						POST: testFnc
					}
				});

				await app.listen(port);

				await request(app.getHttpServer())
					.post(testUrl)
					.send(`str=${ str }`)
					.expect(200); // 200 means no error while call testFnc()
			});
		});

		describe('array string', () => {
			const strArr: string[] = ['str1', 'str2', 'str3'];

			const testFnc = (param: {
				strArr: string[]
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

			beforeEach(async () => {
				await app.route({
					[testUrl]: {
						POST: testFnc
					}
				});

				await app.listen(port);
			});

			it('application/json', async () => {
				await request(app.getHttpServer())
					.post(testUrl)
					.send({ strArr: strArr })
					.expect(200); // 200 means no error while call testFnc()
			});

			it('multipart/form-data', async () => {
				await request(app.getHttpServer())
					.post(testUrl)
					.field('strArr[]', strArr[0])
					.field('strArr[]', strArr[1])
					.field('strArr[]', strArr[2])
					.expect(200); // 200 means no error while call testFnc()
			});

			it('application/x-www-form-urlencoded', async () => {
				await request(app.getHttpServer())
					.post(testUrl)
					.send(`strArr[]=${ strArr[0] }&strArr[]=${ strArr[1] }&strArr[]=${ strArr[2] }`)
					.expect(200); // 200 means no error while call testFnc()
			});
		});

		// undefined converted to null while sending request
		describe('array contains undefined', () => {
			const strArr: (string | undefined)[] = ['str1', 'str2', undefined];

			const testFnc = (param: {
				strArr: (string | undefined)[]
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

			beforeEach(async () => {
				await app.route({
					[testUrl]: {
						POST: testFnc
					}
				});

				await app.listen(port);
			});

			it('application/json', async () => {
				await request(app.getHttpServer())
					.post(testUrl)
					.send({ strArr: strArr })
					.expect(200); // 200 means no error while call testFnc()
			});

			// no multipart/form-data
			// no application/x-www-form-urlencoded
		});

		describe('array contains null', () => {
			const strArr: (string | null)[] = ['str1', 'str2', null];

			const testFnc = (param: {
				strArr: (string | null)[]
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

			beforeEach(async () => {
				await app.route({
					[testUrl]: {
						POST: testFnc
					}
				});

				await app.listen(port);
			});

			it('application/json', async () => {
				await request(app.getHttpServer())
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
					app.listen(port)
						.then(() => {
							return app.listen(port);
						})
				);
			});
		});

		it('ok', () => {
			return app.listen(port);
		});

		describe('POST request with form body', () => {
			const testUri: string = '/users';

			const firstName: string = 'Janghyun';
			const lastName: string = 'Han';

			let testFncCalled: boolean = false;
			const testFnc = async <T> (param: T): Promise<T> => {
				testFncCalled = true;

				expect(param).to.be.ok;
				expect(param).to.be.instanceOf(Object);

				expect(param).to.have.property('firstName', firstName);
				expect(param).to.have.property('lastName', lastName);

				// returns param data
				return param;
			};

			beforeEach(async () => {
				testFncCalled = false;

				await app.route({
					[testUri]: {
						POST: testFnc
					}
				});

				await app.listen(port);
			});

			afterEach(async () => {
				await app.stop();
			});

			it('application/json', async () => {
				const res = await request(app.getHttpServer())
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
				const res = await request(app.getHttpServer())
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
				const res = await request(app.getHttpServer())
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

	describe('static()', () => {
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

				await app.listen(port);

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
				const staticRules: StaticRule[] = (app as unknown as AnyObject<StaticRule[]>)._staticRules;

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
								const staticCache: StaticCache[] = (app as unknown as AnyObject<StaticCache[]>)._staticCache;

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

					await app.listen(port);

					await checkAfter(fullUri);
				});
			});

			it('ok - end with /', async () => {
				const uri: string = '/static/';
				const fullUri: string = `${ uri }${ fileName }`;

				await app.static(uri, folderPath);

				checkBefore(uri);

				await app.listen(port);

				await checkAfter(fullUri);
			});

			it('ok - nested url', async () => {
				const uri: string = '/static/some/inner/path';
				const fullUri: string = `${ uri }/${ fileName }`;

				await app.static(uri, folderPath);

				checkBefore(uri);

				await app.listen(port);

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

				await app.listen(port);

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

			await app.listen(port);

			// check static cache
			const staticCache: StaticCache[] = (app as unknown as AnyObject<StaticCache[]>)._staticCache;

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

			await app.listen(port);

			// check static cache
			const staticCache: StaticCache[] = (app as unknown as AnyObject<StaticCache[]>)._staticCache;

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

					await app.listen(port);

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

	describe('setSPARoot()', () => {
		let publicPath: string;
		let indexFileContents: string;

		before(() => {
			publicPath = path.join(__dirname, 'static', 'public');
			indexFileContents = fs.readFileSync(path.join(publicPath, 'index.html')).toString();
		});

		it('defined', () => {
			expect(app.setSPARoot).to.be.ok;
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

			await app.listen(port);

			await request(app.getHttpServer()).get(spaRoot)
				.expect(200)
				.then((res: SuperTestResponse): void => {
					expect(res).to.be.ok;

					const contentType: string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});

			await request(app.getHttpServer()).get(spaRoot + '/somethingDeepLink')
				.expect(200)
				.then((res: SuperTestResponse): void => {
					expect(res).to.be.ok;

					const contentType: string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});
		});

		it('ok - /public', async () => {
			const spaRoot: string = '/public';

			await app.setSPARoot(spaRoot, publicPath);

			await app.listen(port);


			await request(app.getHttpServer()).get(spaRoot)
				.expect(200)
				.then((res: SuperTestResponse): void => {
					expect(res).to.be.ok;

					const contentType: string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});

			await request(app.getHttpServer()).get(spaRoot + '/somethingDeepLink')
				.expect(200)
				.then((res: SuperTestResponse): void => {
					expect(res).to.be.ok;

					const contentType: string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});
		});

		it('ok - / without auth', async () => {
			const spaRoot: string = '/';

			await app.auth(() => {
				throw new Error('should be pass this function');
			});

			await app.setSPARoot(spaRoot, publicPath);

			await app.listen(port);

			await request(app.getHttpServer()).get(spaRoot)
				.expect(200)
				.then((res: SuperTestResponse): void => {
					expect(res).to.be.ok;

					const contentType: string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});

			await request(app.getHttpServer()).get(spaRoot + 'index.html')
				.expect(200)
				.then((res: SuperTestResponse): void => {
					expect(res).to.be.ok;

					const contentType: string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});

			await request(app.getHttpServer()).get(spaRoot + 'somethingDeepLink')
				.expect(200)
				.then((res: SuperTestResponse): void => {
					expect(res).to.be.ok;

					const contentType: string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});
		});

		it('ok - /public without auth', async () => {
			const spaRoot: string = '/public';

			await app.auth(() => {
				throw new Error('should be pass this function');
			});

			await app.setSPARoot(spaRoot, publicPath);

			await app.listen(port);


			await request(app.getHttpServer()).get(spaRoot)
				.expect(200)
				.then((res: SuperTestResponse): void => {
					expect(res).to.be.ok;

					const contentType: string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});

			await request(app.getHttpServer()).get(spaRoot + '/index.html')
				.expect(200)
				.then((res: SuperTestResponse): void => {
					expect(res).to.be.ok;

					const contentType: string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});

			await request(app.getHttpServer()).get(spaRoot + '/somethingDeepLink')
				.expect(200)
				.then((res: SuperTestResponse): void => {
					expect(res).to.be.ok;

					const contentType: string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});
		});
	});

	describe('route()', () => {
		it('defined', () => {
			expect(app.route).to.be.ok;
		});

		describe('normal', () => {
			let fncRunFlag: boolean = false;

			const commonTestFnc = async (): Promise<void> => {
				fncRunFlag = true;
			};

			beforeEach(() => {
				fncRunFlag = false;
			});

			describe('error', () => {
				it('no param', () => {
					return promiseFail(
						app.route(undefined as unknown as RouteRule)
					);
				});

				it.only('empty address - \'\'', () => {
					return promiseFail(
						app.route({
							'aa': {
								GET: async () => {
									// do nothing
								}
							}
						})
					);
				});

				it('empty address - \' \'', () => {
					return promiseFail(
						app.route({
							' ': {
								GET: async () => {
									// do nothing
								}
							}
						})
					);
				});

				it('empty address - space', () => {
					return promiseFail(
						app.route({
							' ': {
								GET: async () => {
									// do nothing
								}
							}
						})
					);
				});

				it('uri include space', () => {
					return promiseFail(
						app.route({
							' users': {
								GET: async () => {
									// do nothing
								}
							}
						})
					);
				});

				it('uri include space', () => {
					return promiseFail(
						app.route({
							'users ': {
								GET: async () => {
									// do nothing
								}
							}
						})
					);
				});

				it('no rule', () => {
					return promiseFail(
						app.route({
							users: {}
						})
					);
				});

				it('invalid method', () => {
					return promiseFail(
						app.route({
							users: {
								'get': async () => {
									// do nothing
								}
							}
						})
					);
				});

				it('included invalid rule', () => {
					// setting defaultMethod cover this
					return promiseFail(
						app.route({
							users: {
								GET: async () => {
									// do nothing
								},
								something: async () => {
									// do nothing
								}
							}
						})
					);
				});

				it('undefined rule 404', async () => {
					await app.route({
						users: {
							POST: commonTestFnc
						}
					});

					await app.listen(port);

					const res = await request(app.getHttpServer())
						.get('/users')
						.expect(404);

					expect(res).to.be.ok;
					expect(fncRunFlag).to.be.false;
				});

				it('undefined inner rule', async () => {
					await app.route({
						users: {
							GET: commonTestFnc
						}
					});

					await app.listen(port);

					const res = await request(app.getHttpServer())
						.get('/users/notDefined')
						.expect(404);

					expect(res).to.be.ok;
					expect(fncRunFlag).to.be.false;
				});

				it('invalid root path', () => {
					return promiseFail(
						app.route({
							' /': {
								GET: async () => {
									// do nothing
								}
							}
						})
					);
				});

				it('invalid root path', () => {
					return promiseFail(
						app.route({
							'/ ': {
								GET: async () => {
									// do nothing
								}
							}
						})
					);
				});
			});

			const checkRuleFnc = (app: Badak, targetFnc: () => unknown): void => {
				const routeRules: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;
				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				const routeRule: RouteRule = routeRules[0];

				expect(routeRule['/']).to.be.ok;
				expect(routeRule['/']).to.be.instanceOf(Object);
				expect(routeRule['/']).to.have.property('users');

				const routeRuleRoot: RouteRule = routeRule['/'] as RouteRule;

				expect(routeRuleRoot['users']).to.be.ok;
				expect(routeRuleRoot['users']).to.be.instanceOf(Object);
				expect(routeRuleRoot['users']).to.have.property('GET');

				const routeRuleUsers: RouteRule = routeRuleRoot['users'] as RouteRule;

				const routeFnc = routeRuleUsers['GET'];
				expect(routeFnc).to.be.ok;
				expect(routeFnc).to.be.instanceOf(Function);
				expect(routeFnc).to.eql(targetFnc);
			};


			it('ok - normal function', async () => {
				const testFnc = (): void => {
					// do nothing
				};

				await app.route({
					users: {
						GET: testFnc
					}
				});

				checkRuleFnc(app, testFnc);

				await app.listen(port);

				await request(app.getHttpServer())
					.get('/users')
					.expect(200);
			});

			it('ok - async function', async () => {
				const testFnc = async (): Promise<void> => {
					fncRunFlag = true;
				};

				await app.route({
					users: {
						GET: testFnc
					}
				});

				checkRuleFnc(app, testFnc);

				await app.listen(port);

				const res = await request(app.getHttpServer())
					.get('/users')
					.expect(200);

				expect(res).to.be.ok;
				expect(fncRunFlag).to.be.true;
			});

			it('ok - with response', async () => {
				const testFnc = async (): Promise<string> => {
					return 'ok';
				};

				await app.route({
					users: {
						GET: testFnc
					}
				});

				await app.listen(port);

				const res = await request(app.getHttpServer())
					.get('/users')
					.expect(200);

				expect(res).to.be.ok;
				expect(res.text).to.be.eql('ok');
			});

			it('ok - with response (empty array)', async () => {
				const testFnc = async (): Promise<void[]> => {
					return [];
				};

				await app.route({
					users: {
						GET: testFnc
					}
				});

				await app.listen(port);

				const res = await request(app.getHttpServer())
					.get('/users')
					.expect(200);

				expect(res).to.be.ok;
				expect(res.body).to.be.ok;
			});

			it('ok - start with slash', async () => {
				await app.route({
					'/users': {
						GET: commonTestFnc
					}
				});

				checkRuleFnc(app, commonTestFnc);

				await app.listen(port);

				expect(fncRunFlag).to.be.false;

				await request(app.getHttpServer())
					.get('/users')
					.expect(200);

				expect(fncRunFlag).to.be.true;
			});

			it('ok - end with slash', async () => {
				await app.route({
					'users/': {
						GET: commonTestFnc
					}
				});

				checkRuleFnc(app, commonTestFnc);

				await app.listen(port);

				expect(fncRunFlag).to.be.false;

				await request(app.getHttpServer())
					.get('/users')
					.expect(200);

				expect(fncRunFlag).to.be.true;
			});

			it('ok - start & end with slash', async () => {
				await app.route({
					'/users/': {
						GET: commonTestFnc
					}
				});

				checkRuleFnc(app, commonTestFnc);

				await app.listen(port);

				expect(fncRunFlag).to.be.false;

				await request(app.getHttpServer())
					.get('/users')
					.expect(200);

				expect(fncRunFlag).to.be.true;
			});

			it('ok - GET root', async () => {
				const rootGetFnc = async (): Promise<void> => {
					fncRunFlag = true;
				};

				await app.route({
					'/': {
						GET: rootGetFnc
					}
				});

				expect(fncRunFlag).to.be.false;

				await app.listen(port);

				await request(app.getHttpServer())
					.get('/')
					.expect(200);

				expect(fncRunFlag).to.be.true;
			});

			it('ok - POST root', async () => {
				const firstName: string = 'Janghyun';
				const lastName: string = 'Han';

				const rootPostFnc = async <T> (param: T): Promise<T> => {
					fncRunFlag = true;

					// return param data;
					return param;
				};

				await app.route({
					'/': {
						POST: rootPostFnc
					}
				});

				expect(fncRunFlag).to.be.false;

				await app.listen(port);

				const res = await request(app.getHttpServer())
					.post('/')
					.send({
						firstName,
						lastName
					})
					.expect(200);

				expect(fncRunFlag).to.be.true;

				expect(res).to.be.ok;
				expect(res.body).to.be.ok;

				expect(res.body).to.have.property('firstName', firstName);
				expect(res.body).to.have.property('lastName', lastName);
			});

			it('multiple methods in different time', async () => {
				const fncA = async (): Promise<void> => {
					// do nothing
				};
				const fncB = async (): Promise<void> => {
					// do nothing
				};

				await app.route({
					users: {
						GET: fncA
					}
				});

				await app.route({
					users: {
						POST: fncB
					}
				});

				const routeRules: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(2);

				routeRules.forEach((rule: RouteRule, i: number): void => {
					expect(rule).to.have.property('/');

					expect(rule['/']).to.have.property('users');

					const routeRuleRoot: RouteRule = rule['/'] as RouteRule;

					expect(routeRuleRoot['users']).to.be.instanceOf(Object);

					switch (i) {
						case 0:
							expect(routeRuleRoot['users']).to.have.property('GET', fncA);
							break;

						case 1:
							expect(routeRuleRoot['users']).to.have.property('POST', fncB);
							break;
					}
				});
			});

			it('ok - multiple assign from root', async () => {
				let fncARunFlag: boolean = false;
				let fncBRunFlag: boolean = false;

				const fncA = async (): Promise<void> => {
					fncARunFlag = true;
				};
				const fncB = async (): Promise<void> => {
					fncBRunFlag = true;
				};

				await app.route({
					'users/a': {
						GET: fncA
					},
					'users/b': {
						GET: fncB
					}
				});

				const routeRules: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				const routeRule: RouteRule = routeRules[0];

				expect(routeRule).to.be.ok;
				expect(routeRule).to.be.instanceOf(Object);
				expect(routeRule).to.have.property('/');

				expect(routeRule['/']).to.be.ok;
				expect(routeRule['/']).to.be.instanceOf(Object);
				expect(routeRule['/']).to.have.property('users');

				const routeRuleRoot: RouteRule = routeRule['/'] as RouteRule;

				const routeRuleInsideUser: RouteRule = routeRuleRoot['users'] as RouteRule;

				expect(routeRuleInsideUser).to.have.property('a');
				expect(routeRuleInsideUser['a']).to.be.instanceOf(Object);
				expect(routeRuleInsideUser['a']).to.have.property('GET', fncA);

				expect(routeRuleInsideUser).to.have.property('b');
				expect(routeRuleInsideUser['b']).to.be.instanceOf(Object);
				expect(routeRuleInsideUser['b']).to.have.property('GET', fncB);

				await app.listen(port);

				await request(app.getHttpServer())
					.get('/users/a')
					.expect(200);

				expect(fncARunFlag).to.be.true;

				await request(app.getHttpServer())
					.get('/users/b')
					.expect(200);

				expect(fncBRunFlag).to.be.true;
			});

			it('ok - multiple root', async () => {
				let usersRunFlag: boolean = false;
				let recordsRunFlag: boolean = false;

				const usersGetFnc = async (): Promise<void> => {
					usersRunFlag = true;
				};
				const recordsGetFnc = async (): Promise<void> => {
					recordsRunFlag = true;
				};

				await app.route({
					users: {
						GET: usersGetFnc
					},
					records: {
						GET: recordsGetFnc
					}
				});

				const routeRules: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				const routeRule: RouteRule = routeRules[0];

				expect(routeRule).to.be.ok;
				expect(routeRule).to.be.instanceOf(Object);
				expect(routeRule).to.have.property('/');

				expect(routeRule['/']).to.be.ok;
				expect(routeRule['/']).to.be.instanceOf(Object);

				const routeRuleRoot: RouteRule = routeRule['/'] as RouteRule;

				expect(routeRuleRoot).to.have.property('users');
				expect(routeRuleRoot['users']).to.be.instanceOf(Object);
				expect(routeRuleRoot['users']).to.have.property('GET', usersGetFnc);

				expect(routeRuleRoot).to.have.property('records');
				expect(routeRuleRoot['records']).to.be.instanceOf(Object);
				expect(routeRuleRoot['records']).to.have.property('GET', recordsGetFnc);

				await app.listen(port);

				await request(app.getHttpServer())
					.get('/users')
					.expect(200);

				expect(usersRunFlag).to.be.true;

				await request(app.getHttpServer())
					.get('/records')
					.expect(200);

				expect(recordsRunFlag).to.be.true;
			});

			it('ok - tree', async () => {
				let fnc1RunFlag: boolean = false;
				let fnc2RunFlag: boolean = false;
				let fnc3RunFlag: boolean = false;

				const fnc1 = async (): Promise<void> => {
					fnc1RunFlag = true;
				};
				const fnc2 = async (): Promise<void> => {
					fnc2RunFlag = true;
				};
				const fnc3 = async (): Promise<void> => {
					fnc3RunFlag = true;
				};

				await app.route({
					root: {
						GET: fnc1,
						branch1: {
							GET: fnc2,
							branch2: {
								GET: fnc3
							}
						}
					}
				});

				const routeRules: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				const routeRule: RouteRule = routeRules[0];

				expect(routeRule['/']).to.be.ok;
				expect(routeRule['/']).to.be.instanceOf(Object);
				expect(routeRule['/']).to.have.property('root');

				const routeRuleRoot: RouteRule = routeRule['/'] as RouteRule;

				expect(routeRuleRoot['root']).to.be.ok;
				expect(routeRuleRoot['root']).to.be.instanceOf(Object);
				expect(routeRuleRoot['root']).to.have.property('GET', fnc1);

				const routeRuleRootInside: RouteRule = routeRuleRoot['root'] as RouteRule;

				expect(routeRuleRootInside).to.have.property('branch1');
				expect(routeRuleRootInside['branch1']).to.be.instanceOf(Object);
				expect(routeRuleRootInside['branch1']).to.have.property('GET', fnc2);

				expect(routeRuleRootInside['branch1']).to.have.property('branch2');

				const routeRuleRootInsideDeep: RouteRule = routeRuleRootInside['branch1'] as RouteRule;

				expect(routeRuleRootInsideDeep['branch2']).to.be.instanceOf(Object);
				expect(routeRuleRootInsideDeep['branch2']).to.have.property('GET', fnc3);

				await app.listen(port);

				await request(app.getHttpServer())
					.get('/root')
					.expect(200);

				expect(fnc1RunFlag).to.be.true;

				await request(app.getHttpServer())
					.get('/root/branch1')
					.expect(200);

				expect(fnc2RunFlag).to.be.true;

				await request(app.getHttpServer())
					.get('/root/branch1/branch2')
					.expect(200);

				expect(fnc3RunFlag).to.be.true;
			});
		});

		describe('nested', () => {
			it('undefined nested rule 404', async () => {
				let fncRunFlag: boolean = false;

				const testFnc = async (): Promise<void> => {
					fncRunFlag = true;
				};

				await app.route({
					'users/a/b/c': {
						POST: testFnc
					}
				});

				await app.listen(port);

				const res = await request(app.getHttpServer())
					.get('/users/a/b/c')
					.expect(404);

				expect(res).to.be.ok;
				expect(fncRunFlag).to.be.false;
			});

			it('ok', async () => {
				const testFnc = async (): Promise<string> => {
					return 'ok';
				};

				await app.route({
					users: {
						a: {
							b: {
								c: {
									GET: testFnc
								}
							}
						}
					}
				});

				const routeRules: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				const routeRule: RouteRule = routeRules[0];

				expect(routeRule['/']).to.be.ok;
				expect(routeRule['/']).to.be.instanceOf(Object);
				expect(routeRule['/']).to.have.property('users');

				const routeRuleRoot: RouteRule = routeRule['/'] as RouteRule;

				expect(routeRuleRoot['users']).to.be.instanceOf(Object);
				expect(routeRuleRoot['users']).to.have.property('a');

				const routeRuleUsers: RouteRule = routeRuleRoot['users'] as RouteRule;

				expect(routeRuleUsers['a']).to.be.instanceOf(Object);
				expect(routeRuleUsers['a']).to.have.property('b');

				const routeRuleUsersA: RouteRule = routeRuleUsers['a'] as RouteRule;

				expect(routeRuleUsersA['b']).to.be.instanceOf(Object);
				expect(routeRuleUsersA['b']).to.have.property('c');

				const routeRuleUsersAB: RouteRule = routeRuleUsersA['b'] as RouteRule;

				expect(routeRuleUsersAB['c']).to.be.instanceOf(Object);
				expect(routeRuleUsersAB['c']).to.have.property('GET', testFnc);

				await app.listen(port);

				const res = await request(app.getHttpServer())
					.get('/users/a/b/c')
					.expect(200);

				expect(res).to.be.ok;
				expect(res.text).to.be.eql('ok');
			});
		});

		describe('abbreviation', () => {
			const testFnc = async (): Promise<string> => {
				return 'ok';
			};

			describe('error', () => {
				it('invalid format', () => {
					return promiseFail(
						app.route({
							'users///a': {
								GET: testFnc
							}
						})
					);
				});

				it('include space', () => {
					return promiseFail(
						app.route({
							'users/ a': {
								GET: testFnc
							}
						})
					);
				});

				it('include space', () => {
					return promiseFail(
						app.route({
							'users/ /a': {
								GET: testFnc
							}
						})
					);
				});
			});

			it('ok - 2 depth', async () => {
				await app.route({
					'users/a': {
						GET: testFnc
					}
				});

				const routeRules: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				expect(routeRules[0]['/']).to.be.ok;
				expect(routeRules[0]['/']).to.be.instanceOf(Object);

				const userRule: RouteRule = (routeRules[0]['/'] as RouteRule)['users'] as RouteRule;
				expect(userRule).to.be.ok;
				expect(userRule).to.be.instanceOf(Object);
				expect(Object.keys(userRule)).to.includes('a');

				const secondDepthRule = userRule['a'];
				expect(secondDepthRule).to.be.ok;
				expect(secondDepthRule).to.be.instanceOf(Object);
				expect(Object.keys(secondDepthRule)).to.includes('GET');

				const secondDepthFnc: RouteFunction = (secondDepthRule as RouteRule)['GET'] as RouteFunction;
				expect(secondDepthFnc).to.be.ok;
				expect(secondDepthFnc).to.be.instanceOf(Function);
				expect(secondDepthFnc).to.eql(testFnc);

				await app.listen(port);

				const res = await request(app.getHttpServer())
					.get('/users/a')
					.expect(200);

				expect(res).to.be.ok;
				expect(res.text).to.be.eql('ok');
			});

			it('ok - 10 depth', async () => {
				const uri: string = 'users/a/b/c/d/e/f/g/h/i';

				await app.route({
					[uri]: {
						GET: testFnc
					}
				});

				const uriArr = uri.split('/');

				const routeRules: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				expect(routeRules[0]['/']).to.be.ok;
				expect(routeRules[0]['/']).to.be.instanceOf(Object);

				let targetRuleObj: RouteRule | RouteRuleSeed | RouteFunction = routeRules[0]['/'];

				uriArr.forEach((_uri: string, i: number, arr: string[]): void => {
					expect(Object.keys(targetRuleObj)).to.includes(_uri);

					targetRuleObj = (targetRuleObj as RouteRule)[_uri];

					if (i === arr.length - 1) {
						const targetFnc: RouteFunction | undefined = (targetRuleObj as RouteRuleSeed)['GET'] as RouteFunction | undefined;

						expect(targetFnc).to.be.ok;
						expect(targetFnc).to.be.instanceOf(Function);
						expect(targetFnc).to.eql(testFnc);
					}
				});
			});
		});

		// TODO: with query string param

		describe('with route param', () => {
			describe('colon routing', () => {
				describe('error', () => {
					it('colon in end index', () => {
						return promiseFail(
							app.route({
								'users/some:id': {
									GET: async () => {
										// do nothing
									}
								}
							})
						);
					});

					it('colon in middle index', () => {
						return promiseFail(
							app.route({
								'users/id:some': {
									GET: async () => {
										// do nothing
									}
								}
							})
						);
					});

					it('same level & multiple colon routing, in same time', () => {
						return promiseFail(
							app.route({
								users: {
									':id': {
										GET: async () => {
											// do nothing
										}
									},
									':name': {
										GET: async () => {
											// do nothing
										}
									}
								}
							})
						);
					});

					it('root level & multiple colon routing, in same time', () => {
						return promiseFail(
							app.route({
								':id': {
									GET: async () => {
										// do nothing
									}
								},
								':name': {
									GET: async () => {
										// do nothing
									}
								}
							})
						);
					});

					it('root level & multiple colon routing, in different time', async () => {
						await app.route({
							':id': {
								GET: async () => {
									// do nothing
								}
							}
						});

						await promiseFail(
							app.route({
								':name': {
									GET: async () => {
										// do nothing
									}
								}
							})
						);
					});

					it('same level & multiple colon routing, in different time', async () => {
						await app.route({
							users: {
								':id': {
									GET: async () => {
										// do nothing
									}
								}
							}
						});

						await promiseFail(
							app.route({
								users: {
									':name': {
										GET: async () => {
											// do nothing
										}
									}
								}
							})
						);
					});

					it('same level & multiple colon routing, in different time, in uri', async () => {
						await app.route({
							'users/:id': {
								GET: async () => {
									// do nothing
								}
							}
						});

						await promiseFail(
							app.route({
								'users/:name': {
									GET: async () => {
										// do nothing
									}
								}
							})
						);
					});
				});

				it('ok - GET', async () => {
					interface ReqParam {
						id: string;
					}

					const testId: string = 'this_is_id';
					let fncRunFlag: boolean = false;

					const testFnc = async (param: ReqParam): Promise<void> => {
						expect(param).to.be.ok;
						expect(param).to.be.instanceOf(Object);

						expect(param['id']).to.be.ok;
						expect(param['id']).to.be.eql(testId);

						fncRunFlag = true;
					};

					await app.route({
						'users/:id': {
							GET: testFnc
						}
					});

					await app.listen(port);

					const res = await request(app.getHttpServer())
						.get(`/users/${ testId }`)
						.expect(200);

					expect(res).to.be.ok;
					expect(fncRunFlag).to.be.true;
				});

				it('ok - GET with response', async () => {
					interface ReqParam {
						id: string;
					}

					interface ReturnObj {
						id: string;
					}

					const testId: string = 'this_is_id';
					let fncRunFlag: boolean = false;

					const testFnc = async (param: ReqParam): Promise<ReturnObj> => {
						expect(param).to.be.ok;
						expect(param).to.be.instanceOf(Object);

						expect(param['id']).to.be.ok;
						expect(param['id']).to.be.eql(testId);

						fncRunFlag = true;

						return {
							id: testId
						};
					};

					await app.route({
						'users/:id': {
							GET: testFnc
						}
					});

					await app.listen(port);

					const res = await request(app.getHttpServer())
						.get(`/users/${ testId }`)
						.expect(200);

					expect(res).to.be.ok;
					expect(fncRunFlag).to.be.true;

					expect(res.body).to.be.ok;
					expect(res.body).to.have.property('id', testId);
				});

				it('ok - GET, multiple route param', async () => {
					interface ReqParam {
						firstName: string;
						lastName: string;
					}

					const firstName: string = 'Janghyun';
					const lastName: string = 'Han';

					let fncRunFlag: boolean = false;

					const testFnc = async (param: ReqParam): Promise<void> => {
						expect(param).to.be.ok;
						expect(param).to.be.instanceOf(Object);

						expect(param).to.have.property('firstName', firstName);
						expect(param).to.have.property('lastName', lastName);

						fncRunFlag = true;
					};

					await app.route({
						'users/:firstName/some/:lastName': {
							GET: testFnc
						}
					});

					await app.listen(port);

					const res = await request(app.getHttpServer())
						.get(`/users/${ firstName }/some/${ lastName }`)
						.expect(200);

					expect(res).to.be.ok;
					expect(fncRunFlag).to.be.true;
				});

				it('ok - GET multiple route param with response', async () => {
					interface ReqParam {
						firstName: string;
						lastName: string;
					}

					interface ReturnObj {
						firstName: string;
						lastName: string;
					}

					const firstName: string = 'Janghyun';
					const lastName: string = 'Han';

					let fncRunFlag: boolean = false;

					const testFnc = async (param: ReqParam): Promise<ReturnObj> => {
						fncRunFlag = true;

						return {
							firstName: param.firstName,
							lastName: param.lastName
						};
					};

					await app.route({
						'users/:firstName/some/:lastName': {
							GET: testFnc
						}
					});

					await app.listen(port);

					const res = await request(app.getHttpServer())
						.get(`/users/${ firstName }/some/${ lastName }`)
						.expect(200);

					expect(res).to.be.ok;
					expect(fncRunFlag).to.be.true;

					expect(res.body).to.be.ok;
					expect(res.body).to.have.property('firstName', firstName);
					expect(res.body).to.have.property('lastName', lastName);
				});

				it('ok - POST', async () => {
					interface ReqParam {
						firstName: string;
						lastName: string;
					}

					const testId: string = 'this_is_id';
					const firstName: string = 'Janghyun';
					const lastName: string = 'Han';

					let fncRunFlag: boolean = false;

					const testFnc = async (param: ReqParam): Promise<void> => {
						expect(param).to.be.ok;
						expect(param).to.be.instanceOf(Object);
						expect(param).to.have.property('firstName', firstName);
						expect(param).to.have.property('lastName', lastName);

						fncRunFlag = true;
					};

					await app.route({
						'users/:id': {
							POST: testFnc
						}
					});

					await app.listen(port);

					const res = await request(app.getHttpServer())
						.post(`/users/${ testId }`)
						.send({
							firstName,
							lastName
						})
						.expect(200);

					expect(res).to.be.ok;
					expect(fncRunFlag).to.be.true;
				});
			});

			// ab?cd - abc, abcd
			describe('question routing', () => {
				describe('error', () => {
					it('start with \'?\'', () => {
						const testUri: string = '?users';

						return promiseFail(
							app.route({
								[testUri]: {
									GET: () => {
										// do nothing
									}
								}
							})
						);
					});

					it('duplicated routing - normal uri first with route() in same time', () => {
						const questionUri: string = 'users?';
						const normalUri: string = 'user';

						return promiseFail(
							app.route({
								[normalUri]: {
									GET: () => {
										// do nothing
									}
								},
								[questionUri]: {
									GET: () => {
										// do nothing
									}
								}
							})
						);
					});

					it('duplicated routing - normal uri first with route()', async () => {
						const questionUri: string = 'users?';
						const normalUri: string = 'user';

						await app.route({
							[normalUri]: {
								GET: () => {
									// do nothing
								}
							}
						});

						await promiseFail(
							app.route({
								[questionUri]: {
									GET: () => {
										// do nothing
									}
								}
							})
						);
					});

					it('duplicated routing - normal uri first with get()', async () => {
						const questionUri: string = 'users?';
						const normalUri: string = 'user';

						await app.get(normalUri, () => {
							// do nothing
						});

						await promiseFail(
							app.get(questionUri, () => {
								// do nothing
							})
						);
					});

					it('duplicated routing - question uri first with route()', async () => {
						const questionUri: string = 'users?';
						const normalUri: string = 'user';

						await app.route({
							[questionUri]: {
								GET: () => {
									// do nothing
								}
							}
						});


						await promiseFail(
							app.route({
								[normalUri]: {
									GET: () => {
										// do nothing
									}
								}
							})
						);
					});

					it('duplicated routing - question uri first with get()', async () => {
						const questionUri: string = 'users?';
						const normalUri: string = 'user';

						await app.get(questionUri, () => {
							// do nothing
						});


						await promiseFail(
							app.get(normalUri, () => {
								// do nothing
							})
						);
					});
				});

				describe('ok', () => {
					it('normal', async () => {
						const testUri: string = 'users?';

						let testFncRunFlag: boolean = false;

						const testFnc = async (param: AnyObject<string>): Promise<void> => {
							testFncRunFlag = true;

							expect(param).to.be.ok;

							expect(new RegExp(testUri).test(param[testUri])).to.be.true;
						};

						await app.route({
							[testUri]: {
								GET: testFnc
							}
						});

						await app.listen(port);

						await request(app.getHttpServer())
							.get('/user')
							.expect(200);

						await request(app.getHttpServer())
							.get('/users')
							.expect(200);

						expect(testFncRunFlag).to.be.true;
					});

					it('multiple \'?\' in one uri', async () => {
						const testUri: string = 'u?se?rs';

						let testFncRunCount: number = 0;
						const testFnc = (): void => {
							testFncRunCount++;
						};

						await app.route({
							[testUri]: {
								GET: testFnc
							}
						});

						await app.listen(port);

						expect(testFncRunCount).to.be.eql(0);

						await request(app.getHttpServer())
							.get('/users')
							.expect(200);

						expect(testFncRunCount).to.be.eql(1);

						await request(app.getHttpServer())
							.get('/sers')
							.expect(200);

						expect(testFncRunCount).to.be.eql(2);

						await request(app.getHttpServer())
							.get('/usrs')
							.expect(200);

						expect(testFncRunCount).to.be.eql(3);

						await request(app.getHttpServer())
							.get('/srs')
							.expect(200);

						expect(testFncRunCount).to.be.eql(4);
					});

					it('multiple question routing', async () => {
						const testUri1: string = 'users?';
						const testUri2: string = 'records?';

						let userRunCount: number = 0;
						let recordRunCount: number = 0;

						const userFnc = (): void => {
							userRunCount++;
						};

						const recordFnc = (): void => {
							recordRunCount++;
						};

						await app.route({
							[testUri1]: {
								GET: userFnc
							},
							[testUri2]: {
								GET: recordFnc
							}
						});

						const appRouteRule: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;

						expect(appRouteRule).to.be.lengthOf(1);

						expect(userRunCount).to.be.eql(0);
						expect(recordRunCount).to.be.eql(0);

						await app.listen(port);

						await request(app.getHttpServer())
							.get('/user')
							.expect(200);

						expect(userRunCount).to.be.eql(1);

						await request(app.getHttpServer())
							.get('/users')
							.expect(200);

						expect(userRunCount).to.be.eql(2);

						await request(app.getHttpServer())
							.get('/record')
							.expect(200);

						expect(recordRunCount).to.be.eql(1);

						await request(app.getHttpServer())
							.get('/records')
							.expect(200);

						expect(recordRunCount).to.be.eql(2);

						// no target
						await request(app.getHttpServer())
							.get('/userss')
							.expect(404);

						// no target
						await request(app.getHttpServer())
							.get('/someusers')
							.expect(404);

						// no target
						await request(app.getHttpServer())
							.get('/recordss')
							.expect(404);

						// no target
						await request(app.getHttpServer())
							.get('/somerecords')
							.expect(404);
					});

					it('mid question uri', async () => {
						const testUri: string = 'abc?d';

						let testFncRunCount: number = 0;

						const testFnc = (): void => {
							testFncRunCount++;
						};

						await app.route({
							[testUri]: {
								GET: testFnc
							}
						});

						await app.listen(port);

						expect(testFncRunCount).to.be.eql(0);

						await request(app.getHttpServer())
							.get('/abd')
							.expect(200);

						expect(testFncRunCount).to.be.eql(1);

						await request(app.getHttpServer())
							.get('/abcd')
							.expect(200);

						expect(testFncRunCount).to.be.eql(2);
					});

					it('group question uri', async () => {
						const testUri: string = 'ab(cd)?e';

						let outerCounter: number = 0;
						let testFncRunCount: number = 0;

						const testFnc = (): void => {
							testFncRunCount++;
						};

						await app.route({
							[testUri]: {
								GET: testFnc
							}
						});

						await app.listen(port);

						expect(testFncRunCount).to.be.eql(outerCounter++);

						await request(app.getHttpServer())
							.get('/abe')
							.expect(200);

						expect(testFncRunCount).to.be.eql(outerCounter++);

						await request(app.getHttpServer())
							.get('/abcde')
							.expect(200);

						expect(testFncRunCount).to.be.eql(outerCounter++);
					});
				});
			});

			// ab+cd - abcd, abbcd, abbbcd
			describe('plus routing', () => {
				describe('error', () => {
					it('start with \'+\'', () => {
						return promiseFail(
							app.route({
								'+abcd': {
									GET: () => {
										// do nothing
									}
								}
							})
						);
					});

					it('duplicated routing, normal uri first', async () => {
						await app.route({
							'abc': {
								GET: () => {
									// do nothing
								}
							}
						});

						await promiseFail(
							app.route({
								'ab+c': {
									GET: () => {
										// do nothing
									}
								}
							})
						);
					});

					it('duplicated routing, plus uri first', async () => {
						await app.route({
							'ab+c': {
								GET: () => {
									// do nothing
								}
							}
						});

						await promiseFail(
							app.route({
								'abc': {
									GET: () => {
										// do nothing
									}
								}
							})
						);
					});

					it('duplicated routing, duplicated plus uri', async () => {
						await app.route({
							'ab+c': {
								GET: () => {
									// do nothing
								}
							}
						});

						await promiseFail(
							app.route({
								'abc+': {
									GET: () => {
										// do nothing
									}
								}
							})
						);
					});
				});

				describe('ok', () => {
					it('normal', async () => {
						const testUri: string = 'ab+cd';

						let testFncRunCount: number = 0;
						const testFnc = (param: AnyObject<string>): void => {
							expect(param).to.be.ok;

							expect(param[testUri]).to.be.ok;
							expect(new RegExp(testUri).test(param[testUri])).to.be.true;

							testFncRunCount++;
						};

						await app.route({
							[testUri]: {
								GET: testFnc
							}
						});

						await app.listen(port);

						expect(testFncRunCount).to.be.eql(0);

						await request(app.getHttpServer())
							.get('/abcd')
							.expect(200);

						expect(testFncRunCount).to.be.eql(1);

						await request(app.getHttpServer())
							.get('/abbcd')
							.expect(200);

						expect(testFncRunCount).to.be.eql(2);

						await request(app.getHttpServer())
							.get('/abbbcd')
							.expect(200);

						expect(testFncRunCount).to.be.eql(3);
					});

					it('multiple \'+\' in one uri', async () => {
						let testFncRunCount: number = 0;
						const testFnc = (): void => {
							testFncRunCount++;
						};

						await app.route({
							'a+b+c': {
								GET: testFnc
							}
						});

						await app.listen(port);

						// belows are not targets
						expect(testFncRunCount).to.be.eql(0);

						await request(app.getHttpServer())
							.get('/bc')
							.expect(404);

						expect(testFncRunCount).to.be.eql(0);

						await request(app.getHttpServer())
							.get('/ac')
							.expect(404);

						expect(testFncRunCount).to.be.eql(0);

						await request(app.getHttpServer())
							.get('/ab')
							.expect(404);

						// belows are targets
						expect(testFncRunCount).to.be.eql(0);

						await request(app.getHttpServer())
							.get('/abc')
							.expect(200);

						expect(testFncRunCount).to.be.eql(1);

						await request(app.getHttpServer())
							.get('/aabc')
							.expect(200);

						expect(testFncRunCount).to.be.eql(2);

						await request(app.getHttpServer())
							.get('/abbc')
							.expect(200);

						expect(testFncRunCount).to.be.eql(3);

						await request(app.getHttpServer())
							.get('/abcc')
							.expect(200);
					});
				});
			});

			// asterisk routing
			// ** : all after this
			// * : all uri fragment
			// ab*cd : abcd, abxcd, abblahcd
			describe('asterisk routing', () => {
				let validUrls: string[] = [];
				let invalidUrls: string[] = [];
				let calledUrls: string[] = [];

				beforeEach(() => {
					validUrls = [];
					invalidUrls = [];
					calledUrls = [];
				});

				afterEach(async () => {
					await Promise.all(validUrls.map((testUri: string): SuperTestExpect => {
						return request(app.getHttpServer())
							.get(testUri)
							.expect(200);
					}));

					validUrls.forEach((testUri: string): void => {
						expect(calledUrls).to.include(testUri);
					});

					await Promise.all(invalidUrls.map((testUri: string): SuperTestExpect => {
						return request(app.getHttpServer())
							.get(testUri)
							.expect(404);
					}));
				});

				describe('**', () => {
					const testFnc = (param: unknown, req: IncomingMessage): void => {
						expect(param).to.be.ok;
						expect(param).to.have.property('**');

						calledUrls.push(req.url as string);
					};

					[
						'',
						'/nested'
					].forEach((prefix: string): void => {
						it(prefix + '/**', async () => {
							await app.route({
								[prefix + '/**']: {
									GET: testFnc
								}
							});

							await app.listen(port);

							const routeRules: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;
							expect(routeRules).to.be.instanceOf(Array);
							expect(routeRules).to.be.lengthOf(1);

							validUrls.push(
								`${ prefix }/a`,
								`${ prefix }/b`,
								`${ prefix }/a/b/c/d/e/f/g`
							);
						});
					});
				});

				describe('*', () => {
					const testFnc = (param: unknown, req: IncomingMessage): void => {
						expect(param).to.be.ok;
						expect(param).to.have.property('*');

						calledUrls.push(req.url as string);
					};

					describe('last frag', () => {
						[
							'',
							'/nested'
						].forEach((prefix: string) => {
							it(prefix + '/*', async () => {
								await app.route({
									[prefix + '/*']: {
										GET: testFnc
									}
								});

								await app.listen(port);

								const routeRules: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;
								expect(routeRules).to.be.instanceOf(Array);
								expect(routeRules).to.be.lengthOf(1);

								validUrls.push(
									`${ prefix }/`,
									`${ prefix }/a`,
									`${ prefix }/b`
								);

								invalidUrls.push(
									`${ prefix }/a/c`
								);
							});
						});
					});

					describe('in the middle', () => {
						[
							'',
							'/nested'
						].forEach((prefix: string): void => {
							it(prefix + '/*/a', async () => {
								await app.route({
									[prefix + '/*/a']: {
										GET: testFnc
									}
								});

								await app.listen(port);

								const routeRules: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;
								expect(routeRules).to.be.instanceOf(Array);
								expect(routeRules).to.be.lengthOf(1);

								validUrls.push(
									`${ prefix }/a/a`,
									`${ prefix }/b/a`
								);

								invalidUrls.push(
									`${ prefix }`,
									`${ prefix }/a`
								);
							});
						});
					});
				});

				describe('partial *', () => {
					const testFrag: string = 'ab*cd';

					const testFnc = (param: AnyObject<string>, req: IncomingMessage): void => {
						expect(param).to.be.ok;

						const regExpKey: string = param[testFrag].replace('*', '(\\w)*');
						expect(param[testFrag]).to.be.ok;
						expect(new RegExp(regExpKey).test(param[testFrag])).to.be.true;

						calledUrls.push(req.url as string);
					};

					[
						// '',
						'/nested'
					].forEach((prefix: string): void => {
						it(prefix + '/ab*cd', async () => {
							await app.route({
								[`${ prefix }/${ testFrag }`]: {
									GET: testFnc
								}
							});

							await app.listen(port);

							const routeRules: RouteRule[] = (app as unknown as AnyObject<RouteRule[]>)._routeRules;
							expect(routeRules).to.be.instanceOf(Array);
							expect(routeRules).to.be.lengthOf(1);

							validUrls.push(
								prefix + '/abcd',
								prefix + '/abbcd',
								prefix + '/abbecd',
								prefix + '/abbasdflkjsaecd'
							);

							invalidUrls.push(
								prefix + '/a',
								prefix + '/bd'
							);
						});
					});
				});
			});

			// TODO: regular expression
		});
	});

	describe('4-methods', () => {
		const methodArr: (keyof Badak)[] = ['get', 'post', 'put', 'delete'];

		methodArr.forEach((method: keyof Badak): void => {
			type MethodType = (address: string, fnc: RouteFunction, option?: RouteOption) => Promise<void>;

			let routeFnc: MethodType;
			const testFnc: RouteFunction = (): void => {
				// do nothing
			};

			before(() => {
				routeFnc = app[method] as MethodType;
			});

			describe(`${ method }()`, () => {
				it('defined', () => {
					expect(routeFnc).to.be.ok;
				});

				describe('error', () => {
					it('no address', () => {
						return promiseFail(
							routeFnc(undefined as unknown as string, testFnc)
						);
					});

					it('no function', () => {
						return promiseFail(
							routeFnc('/users', undefined as unknown as RouteFunction)
						);
					});
				});

				it('ok - normal function', async () => {
					const uri: string = '/users';
					let fncRun: boolean = false;

					await routeFnc(uri, async () => {
						fncRun = true;

						return {
							data: ['user1', 'user2']
						};
					});

					await app.listen(port);

					const requestObj = request(app.getHttpServer());
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

					await routeFnc(uri, async () => {
						fncRun = true;

						return {
							data: ['user1', 'user2']
						};
					});

					await app.listen(port);

					const requestObj = request(app.getHttpServer());
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

					await routeFnc(uri, async () => {
						fncRun = true;

						return {
							data: ['user1', 'user2']
						};
					});

					await app.listen(port);

					const requestObj = request(app.getHttpServer());
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

					await routeFnc(uri1, fnc1);
					await routeFnc(uri2, fnc2);

					await app.listen(port);

					const requestObj1 = request(app.getHttpServer());
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

					const requestObj2 = request(app.getHttpServer());
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
			await app.listen(port);

			await app.stop();
		});
	});
});
