import * as fs from 'fs';
import * as path from 'path';

import 'mocha';

import { expect } from 'chai';
import * as request from 'supertest';

import { Badak } from '../src/badak';
import { RouteRule, RouteRuleSeed, StaticCache, StaticRule } from '../src/interfaces';

const fail = async () => {
	throw new Error('this should be not execute');
};

const port = 65030;

describe('core', () => {
	let app : Badak = null;

	beforeEach(() => {
		app = new Badak({
			catchErrorLog : false
		});
	});

	afterEach(() => {
		return app.isRunning() ? app.stop() : Promise.resolve();
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

		it('not defined key', async () => {
			await app.config('somethingNotDefinedKey', true)
				.then(fail, (err) => {
					expect(err).to.be.ok;
					expect(err).to.be.instanceOf(Error);
				});
		});

		describe('invalid value', () => {
			const booleanKeys : string[] = ['parseNumber', 'parseDate'];

			booleanKeys.forEach(key => {
				it(key + ' - undefined', async () => {
					await app.config(key, undefined)
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it(key + ' - null', async () => {
					await app.config(key, null)
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it(key + ' - string', async () => {
					await app.config(key, 'hello')
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it(key + ' - number', async () => {
					await app.config(key, 123)
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});
			});
		});

		describe('parseNumber', () => {
			// no application/json, it can parse already

			const testUrl : string = '/parseNumber';

			const num : number = 123;
			const float : number = 123.45;

			const testFncStr = (param) => {
				expect(param).to.be.ok;

				expect(param.num).to.be.a('string');
				expect(param.num).to.be.eql('' + num);

				expect(param.float).to.be.a('string');
				expect(param.float).to.be.eql('' + float);
			};

			const testFncNum = (param) => {
				expect(param).to.be.ok;

				expect(param.num).to.be.a('number');
				expect(param.num).to.be.eql(num);

				expect(param.float).to.be.a('number');
				expect(param.float).to.be.eql(float);
			};

			describe('default - false', () => {
				beforeEach(async () => {
					await app.route({
						[testUrl] : {
							POST : testFncStr
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
						[testUrl] : {
							POST : testFncNum
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
						const testFnc = (param) => {
							expect(param).to.be.ok;
							expect(param).to.be.instanceOf(Array);

							param.every(value => {
								expect(value).to.be.a('number');
							});
						};

						await app.route({
							[testUrl] : {
								POST : testFnc
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
						const testFnc = (param) => {
							expect(param).to.be.ok;

							expect(param.num).to.be.instanceOf(Array);
							param.num.every(value => {
								expect(value).to.be.a('number');
							});

							param.float.every(value => {
								expect(value).to.be.a('number');
							});
						};

						await app.route({
							[testUrl] : {
								POST : testFnc
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
						const testFnc = (param) => {
							expect(param).to.be.ok;

							expect(param.num).to.be.instanceOf(Array);
							param.num.every(value => {
								expect(value).to.be.a('number');
							});

							param.float.every(value => {
								expect(value).to.be.a('number');
							});
						};

						await app.route({
							[testUrl] : {
								POST : testFnc
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
					const testFnc = (param) => {
						expect(param).to.be.ok;
						expect(param).to.be.instanceOf(Array);

						expect(param[0].num).to.be.a('number');
						expect(param[0].float).to.be.a('number');
					};

					it('application/json', async () => {
						await app.route({
							[testUrl] : {
								POST : testFnc
							}
						});

						await app.config('parseNumber', true);

						await app.listen(port);

						await request(app.getHttpServer())
							.post(testUrl)
							.send([{
								num : num,
								float : float
							}])
							.expect(200); // 200 means no error while call testFnc()
					});

					// TODO: multipart/form-data
					// TODO: application/x-www-form-urlencoded
				});
			});

			describe('in object', () => {
				const testFnc = (param) => {
					expect(param).to.be.ok;

					expect(param.num).to.be.a('number');
					expect(param.float).to.be.a('number');
				};

				it('application/json', async () => {
					await app.route({
						[testUrl] : {
							POST : testFnc
						}
					});

					await app.config('parseNumber', true);

					await app.listen(port);

					await request(app.getHttpServer())
						.post(testUrl)
						.send({
							num : num,
							float : float
						})
						.expect(200); // 200 means no error while call testFnc()
				});

				// TODO: multipart/form-data
				// TODO: application/x-www-form-urlencoded
			});
		});

		describe('parseDate', () => {
			const testUrl : string = '/parseDate';

			const num : number = 135; // should not parse
			const float : number = 246.89; // should not parse
			const dateStr : string = (new Date).toISOString();
			const noDateStr : string = 'noDateString';

			describe('default - false', () => {
				const testFncJson = (param) => {
					expect(param).to.be.ok;

					expect(param.num).to.be.a('number'); // not string
					expect(param.num).to.be.eql(num);

					expect(param.float).to.be.a('number'); // not string
					expect(param.float).to.be.eql(float);

					expect(param.date).to.be.a('string');

					expect(param.noDate).to.be.a('string');
					expect(param.noDate).to.be.eql(noDateStr);
				};

				const testFncStr = (param) => {
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
						[testUrl] : {
							POST : testFncJson
						}
					});

					await app.listen(port);

					await request(app.getHttpServer())
						.post(testUrl)
						.send({
							num : num,
							float : float,
							date : dateStr,
							noDate : noDateStr
						})
						.expect(200); // 200 means no error while call testFncStr()
				});

				it('multipart/form-data', async () => {
					await app.route({
						[testUrl] : {
							POST : testFncStr
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
						[testUrl] : {
							POST : testFncStr
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
				const testFncJson = (param) => {
					expect(param).to.be.ok;

					expect(param.num).to.be.a('number'); // not string
					expect(param.num).to.be.eql(num);

					expect(param.float).to.be.a('number'); // not string
					expect(param.float).to.be.eql(float);

					expect(param.date).to.be.instanceOf(Date);

					expect(param.noDate).to.be.a('string');
					expect(param.noDate).to.be.eql(noDateStr);
				};

				const testFncStr = (param) => {
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
						[testUrl] : {
							POST : testFncJson
						}
					});

					await app.config('parseDate', true);

					await app.listen(port);

					await request(app.getHttpServer())
						.post(testUrl)
						.send({
							num : num,
							float : float,
							date : dateStr,
							noDate : noDateStr
						})
						.expect(200); // 200 means no error while call testFncStr()
				});

				it('multipart/form-data', async () => {
					await app.route({
						[testUrl] : {
							POST : testFncStr
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
						[testUrl] : {
							POST : testFncStr
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
					const testFnc = (param) => {
						expect(param).to.be.ok;
						expect(param).to.be.instanceOf(Array);

						expect(param[0]).to.be.instanceOf(Date);
					};

					it('application/json', async () => {
						await app.route({
							[testUrl] : {
								POST : testFnc
							}
						});

						await app.config('parseDate', true);

						await app.listen(port);

						await request(app.getHttpServer())
							.post(testUrl)
							.send([dateStr])
							.expect(200); // 200 means no error while call testFnc()
					});

					// TODO: multipart/form-data
					// TODO: application/x-www-form-urlencoded
				});

				describe('object', () => {
					const testFnc = (param) => {
						expect(param).to.be.ok;
						expect(param).to.be.instanceOf(Array);

						expect(param[0].value).to.be.instanceOf(Date);
					};

					it('application/json', async () => {
						await app.route({
							[testUrl] : {
								POST : testFnc
							}
						});

						await app.config('parseDate', true);

						await app.listen(port);

						await request(app.getHttpServer())
							.post(testUrl)
							.send([{
								value : dateStr
							}])
							.expect(200); // 200 means no error while call testFnc()
					});

					// TODO: multipart/form-data
					// TODO: application/x-www-form-urlencoded
				});
			});

			describe('in object', () => {
				const testFnc = (param) => {
					expect(param).to.be.ok;
					expect(param.dateStr).to.be.instanceOf(Date);
				};

				it('application/json', async () => {
					await app.route({
						[testUrl] : {
							POST : testFnc
						}
					});

					await app.config('parseDate', true);

					await app.listen(port);

					await request(app.getHttpServer())
						.post(testUrl)
						.send({ dateStr })
						.expect(200); // 200 means no error while call testFnc()
				});

				// TODO: multipart/form-data
				// TODO: application/x-www-form-urlencoded
			});
		});

		describe('defaultMethod', () => {
			const testUri : string = '/defaultMethod';
			const testUriRefined : string = testUri.replace('/', '');

			const methods : string[] = ['GET', 'POST', 'PUT', 'DELETE'];

			const echoFnc = (param) => {
				return param;
			};

			const getReqFnc = (method : string) => {
				const requestObj = request(app.getHttpServer());

				let requestFnc = null;

				switch (method) {
					case 'GET':
						requestFnc = requestObj.get(testUri);
						break;

					case 'POST':
						requestFnc = requestObj.post(testUri);
						break;

					case 'PUT':
						requestFnc = requestObj.put(testUri);
						break;

					case 'DELETE':
						requestFnc = requestObj.delete(testUri);
						break;
				}

				return requestFnc;
			};

			describe('function itself', () => {
				methods.forEach(method => {
					describe(method, () => {
						it('set value - capital', async () => {
							await app.config('defaultMethod', method);
						});

						it('set value - lower case', async () => {
							await app.config('defaultMethod', method.toLowerCase());

							const appConfig = (app as any)._config;
							expect(appConfig.defaultMethod).to.be.eql(method.toUpperCase());
						});
					});
				});

				it('set value failed - not string', async () => {
					await app.config('defaultMethod', true)
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});

					await app.config('defaultMethod', false)
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});

					await app.config('defaultMethod', 123)
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('set value failed - not defined method', async () => {
					await app.config('defaultMethod', 'something_method')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});
			});

			it('default - can\'t set', async () => {
				await app.route({
						[testUri] : echoFnc
					})
					.then(fail, err => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceOf(Error);
					});
			});

			describe('after set', () => {
				methods.forEach((setMethod, i) => {
					describe('set ' + setMethod, () => {
						beforeEach(async () => {
							await app.config('defaultMethod', setMethod);

							await app.route({
								[testUri] : echoFnc
							});

							await app.listen(port);
						});

						methods.forEach((testMethod, j) => {
							it('test ' + testMethod, async () => {
								const routeRules : RouteRule[] = (app as any)._routeRules;

								expect(routeRules).to.be.ok;
								expect(routeRules).to.be.instanceOf(Array);
								expect(routeRules).to.be.lengthOf(1);

								expect(routeRules[0]).to.be.ok;
								expect(routeRules[0]).to.be.instanceOf(Object);
								expect(routeRules[0]).to.have.property('/');

								expect(routeRules[0]['/']).to.have.property(testUriRefined);
								expect(routeRules[0]['/'][testUriRefined]).to.have.property(setMethod);

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
					[testUri] : echoFnc
				});

				await app.config('defaultMethod', null);

				await app.route({
						[testUri] : echoFnc
					})
					.then(fail, err => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceOf(Error);
					});
			});
		});
	});

	describe('_paramParser()', () => {
		const testUrl : string = '/paramParser';

		describe('single string', () => {
			const str : string = 'string_value';
			const testFnc = (param) => {
				expect(param).to.be.ok;
				expect(param).to.be.a('object');
				expect(param.str).to.be.eql(str);
			};

			it('application/json', async () => {
				await app.route({
					[testUrl] : {
						POST : testFnc
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
					[testUrl] : {
						POST : testFnc
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
					[testUrl] : {
						POST : testFnc
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
			const strArr : string[] = ['str1', 'str2', 'str3'];

			const testFnc = (param) => {
				expect(param).to.be.ok;
				expect(param).to.be.a('object');

				expect(param.strArr).to.be.instanceOf(Array);
				expect(param.strArr).to.be.lengthOf(strArr.length);

				param.strArr.every((value, i) => {
					expect(value).to.be.a('string');
					expect(value).to.be.eql(strArr[i]);
				});
			};

			beforeEach(async () => {
				await app.route({
					[testUrl] : {
						POST : testFnc
					}
				});

				await app.listen(port);
			});

			it('application/json', async () => {
				await request(app.getHttpServer())
					.post(testUrl)
					.send({ strArr : strArr })
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
	});

	describe('listen()', () => {
		it('defined', () => {
			expect(app.listen).to.be.ok;
		});

		describe('error', () => {
			it('no port param', async () => {
				await app.listen(undefined)
					.then(fail, (err) => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceOf(Error);
					});
			});

			it('port param - string', async () => {
				await app.listen('3000' as any)
					.then(fail, (err) => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceOf(Error);
					});
			});

			it('run twice', async () => {
				await app.listen(port)
					.then(() => {
						return app.listen(port);
					})
					.then(fail, (err) => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceOf(Error);
					});
			});
		});

		it('ok', () => {
			return app.listen(port);
		});

		describe('POST request with form body', () => {
			const testUri : string = '/users';

			const firstName = 'Janghyun';
			const lastName = 'Han';

			let testFncCalled = false;
			const testFnc = async (param) => {
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
					[testUri] : {
						POST : testFnc
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
				it('no parameter', async () => {
					await app.static(undefined, '.')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('invalid parameter === null', async () => {
					await app.static(null, '.')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('not absolute path', async () => {
					await app.static('someUri', 'something')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('invalid path', async () => {
					await app.static('/some///thing', 'something')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});
			});

			describe('path', () => {
				it('no parameter', async () => {
					await app.static('/', undefined)
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('invalid parameter === null', async () => {
					await app.static('/', null)
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('not absolute path', async () => {
					await app.static('/', 'something')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('not folder', async () => {
					await app.static('/', path.join(__dirname, 'static', 'test.txt'))
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});
			});

			it('not exist file', async () => {
				const fullUri : string = `/static/notExistFile.text'`;
				const folderPath = path.join(__dirname, '/static');

				await app.static('/static', folderPath);

				await app.listen(port);

				await request(app.getHttpServer()).get(fullUri).expect(404);
				await request(app.getHttpServer()).post(fullUri).expect(404);
				await request(app.getHttpServer()).put(fullUri).expect(404);
				await request(app.getHttpServer()).delete(fullUri).expect(404);
			});

			it('not exist folder', async () => {
				const folderPath = path.join(__dirname, '/static/notExistFolder');

				return app.static('/static', folderPath)
					.then(fail, (err) => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceOf(Error);
					});
			});
		});

		describe('about uri', () => {
			let folderName : string;
			let fileName : string;

			let folderPath : string;
			let filePath : string;

			let fileData : string;

			const checkBefore = (keyUri : string) => {
				const staticRules : StaticRule[] = (app as any)._staticRules;

				expect(staticRules).to.be.ok;
				expect(staticRules).to.be.instanceOf(Array);

				const targetRule : StaticRule = staticRules.find(rule => {
					return rule.uri === keyUri;
				});

				expect(targetRule).to.be.ok;
			};

			const checkAfter = async (fullUri : string) => {
				// request twice to check cache working
				await Promise.all(
					new Array(2)
						.fill(undefined)
						.map(async (nothing, i) => {
							await Promise.all([
								request(app.getHttpServer())
									.get(fullUri)
									.expect(200)
									.then((_res : any) : void => {
										const res : Response = _res as Response;

										const contentType : string = res.headers['content-type'];
										expect(contentType).to.be.eql('text/plain');

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
								const staticCache : StaticCache[] = (app as any)._staticCache;

								expect(staticCache).to.be.ok;
								expect(staticCache).to.be.instanceOf(Array);

								const targetCache : StaticCache = staticCache.find(cache => {
									return cache.uri === fullUri;
								});

								expect(targetCache).to.be.ok;
								expect(targetCache).to.have.property('mime', 'text/plain');
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
					fs.readFile(filePath, (err : Error, data : Buffer) => {
						if (!err) {
							resolve(data.toString());
						} else {
							reject(err);
						}
					});
				});
			});

			[
				'/',
				'/static'
			].forEach(uri => {
				it(`ok : ${ uri }`, async () => {
					const fullUri : string = `${ uri === '/' ? '' : uri }/${ fileName }`;

					await app.static(uri, folderPath);

					checkBefore(uri);

					await app.listen(port);

					await checkAfter(fullUri);
				});
			});

			it('ok - end with /', async () => {
				const uri : string = '/static/';
				const fullUri : string = `${ uri }${ fileName }`;

				await app.static(uri, folderPath);

				checkBefore(uri);

				await app.listen(port);

				await checkAfter(fullUri);
			});

			it('ok - nested url', async () => {
				const uri : string = '/static/some/inner/path';
				const fullUri : string = `${ uri }/${ fileName }`;

				await app.static(uri, folderPath);

				checkBefore(uri);

				await app.listen(port);

				await checkAfter(fullUri);
			});

			it('ok - multiple assign', async () => {
				const uris : string[] = ['/static1', '/static2'];

				const testObj : [string, string][] = uris.map(uri => {
					return [uri, `${ uri }/${ fileName }`];
				});

				await Promise.all(
					testObj.map(async ([uri, fullUri] : [string, string]) => {
						await app.static(uri, folderPath);

						checkBefore(uri);
					})
				);

				await app.listen(port);

				await Promise.all(
					testObj.map(async ([uri, fullUri] : [string, string]) => {
						await checkAfter(fullUri);
					})
				);
			});
		});

		it('folder', async () => {
			const uri : string = '/static';

			await app.static(uri, path.join(__dirname, 'static'));

			await app.listen(port);

			// check static cache
			const staticCache : StaticCache[] = (app as any)._staticCache;

			expect(staticCache).to.be.instanceOf(Array);
			expect(staticCache.length).to.be.above(0);

			const targetStaticCache : StaticCache = staticCache[0];

			expect(targetStaticCache).to.be.instanceOf(Object);

			expect(targetStaticCache).to.have.property('uri');
			expect(targetStaticCache.uri).to.be.a('string');

			expect(targetStaticCache).to.have.property('mime');
			expect(targetStaticCache.mime).to.be.a('string');

			expect(targetStaticCache).to.have.property('fileData');

			await request(app.getHttpServer())
				.get('/static/test.txt')
				.expect(200)
				.then((_res : any) : void => {
					const res : Response = _res as Response;

					expect(res).to.be.ok;

					expect(!!res.body || !!res.text).to.be.ok;
				});
		});

		it('nested folder', async () => {
			const uri : string = '/static';

			await app.static(uri, path.join(__dirname, 'static'));

			await app.listen(port);

			// check static cache
			const staticCache : StaticCache[] = (app as any)._staticCache;

			expect(staticCache).to.be.instanceOf(Array);
			expect(staticCache.length).to.be.above(0);

			await request(app.getHttpServer())
				.get('/static/nested/test.txt')
				.expect(200)
				.then((_res : any) : void => {
					const res : Response = _res as Response;

					expect(res).to.be.ok;

					expect(!!res.body || !!res.text).to.be.ok;
				});
		});

		describe('about MIME', () => {
			[
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
			].forEach(([extension, mime] : [string, string]) => {
				it(`ok : .${ extension }`, async () => {
					const fileName : string = `test.${ extension }`;
					const filePath : string = path.join(__dirname, '/static');

					const fullUri : string = `/static/${ fileName }`;

					await app.static('/static', filePath);

					await app.listen(port);

					// check once
					await request(app.getHttpServer())
						.get(fullUri)
						.expect(200)
						.then((_res : any) : void => {
							const res : Response = _res as Response;

							expect(res).to.be.ok;

							const contentType : string = res.headers['content-type'];
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
						.then((_res : any) : void => {
							const res : Response = _res as Response;

							expect(res).to.be.ok;

							const contentType : string = res.headers['content-type'];
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
		let publicPath : string;
		let indexFileContents : string;

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
				it('no parameter', async () => {
					await app.setSPARoot(undefined, '.')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('invalid parameter === null', async () => {
					await app.setSPARoot(null, '.')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('not absolute path', async () => {
					await app.setSPARoot('someUri', 'something')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('invalid path', async () => {
					await app.setSPARoot('/some///thing', 'something')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});
			});

			describe('path', () => {
				it('no parameter', async () => {
					await app.setSPARoot('/', undefined)
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('invalid parameter === null', async () => {
					await app.setSPARoot('/', null)
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('not absolute path', async () => {
					await app.setSPARoot('/', 'something')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('not folder', async () => {
					await app.setSPARoot('/', path.join(__dirname, 'static', 'test.txt'))
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});
			});

			it('not exist folder', async () => {
				const folderPath = path.join(__dirname, '/static/notExistFolder');

				return app.setSPARoot('/public', folderPath)
					.then(fail, (err) => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceOf(Error);
					});
			});

			it('no index.html', () => {
				return app.setSPARoot('/public', path.join(__dirname, 'static'))
					.then(fail, (err) => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceOf(Error);
					});
			});
		});

		it('ok - /', async () => {
			const spaRoot : string = '/';

			await app.setSPARoot(spaRoot, publicPath);

			await app.listen(port);

			await request(app.getHttpServer()).get(spaRoot)
				.expect(200)
				.then((_res : any) : void => {
					const res : Response = _res as Response;

					expect(res).to.be.ok;

					const contentType : string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});

			await request(app.getHttpServer()).get(spaRoot + '/somethingDeepLink')
				.expect(200)
				.then((_res : any) : void => {
					const res : Response = _res as Response;

					expect(res).to.be.ok;

					const contentType : string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});
		});

		it('ok - /public', async () => {
			const spaRoot : string = '/public';

			await app.setSPARoot(spaRoot, publicPath);

			await app.listen(port);


			await request(app.getHttpServer()).get(spaRoot)
				.expect(200)
				.then((_res : any) : void => {
					const res : Response = _res as Response;

					expect(res).to.be.ok;

					const contentType : string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});

			await request(app.getHttpServer()).get(spaRoot + '/somethingDeepLink')
				.expect(200)
				.then((_res : any) : void => {
					const res : Response = _res as Response;

					expect(res).to.be.ok;

					const contentType : string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});
		});

		it('ok - / without auth', async () => {
			const spaRoot : string = '/';

			await app.auth(() => {
				throw new Error('should be pass this function');
			});

			await app.setSPARoot(spaRoot, publicPath);

			await app.listen(port);

			await request(app.getHttpServer()).get(spaRoot)
				.expect(200)
				.then((_res : any) : void => {
					const res : Response = _res as Response;

					expect(res).to.be.ok;

					const contentType : string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});

			await request(app.getHttpServer()).get(spaRoot + 'index.html')
				.expect(200)
				.then((_res : any) : void => {
					const res : Response = _res as Response;

					expect(res).to.be.ok;

					const contentType : string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});

			await request(app.getHttpServer()).get(spaRoot + 'somethingDeepLink')
				.expect(200)
				.then((_res : any) : void => {
					const res : Response = _res as Response;

					expect(res).to.be.ok;

					const contentType : string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});
		});

		it('ok - /public without auth', async () => {
			const spaRoot : string = '/public';

			await app.auth(() => {
				throw new Error('should be pass this function');
			});

			await app.setSPARoot(spaRoot, publicPath);

			await app.listen(port);


			await request(app.getHttpServer()).get(spaRoot)
				.expect(200)
				.then((_res : any) : void => {
					const res : Response = _res as Response;

					expect(res).to.be.ok;

					const contentType : string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});

			await request(app.getHttpServer()).get(spaRoot + '/index.html')
				.expect(200)
				.then((_res : any) : void => {
					const res : Response = _res as Response;

					expect(res).to.be.ok;

					const contentType : string = res.headers['content-type'];
					expect(contentType).to.be.eql('text/html');

					expect(res.text).to.be.eql(indexFileContents);
				});

			await request(app.getHttpServer()).get(spaRoot + '/somethingDeepLink')
				.expect(200)
				.then((_res : any) : void => {
					const res : Response = _res as Response;

					expect(res).to.be.ok;

					const contentType : string = res.headers['content-type'];
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
			let fncRunFlag = false;

			const testFnc = async () => {
				fncRunFlag = true;
			};

			beforeEach(() => {
				fncRunFlag = false;
			});

			describe('error', () => {
				it('no param', () => {
					return app.route(undefined)
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('empty address - \'\'', () => {
					return app.route({
							'' : {
								'GET' : async () => {
								}
							}
						})
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('empty address - \' \'', () => {
					return app.route({
							' ' : {
								'GET' : async () => {
								}
							}
						})
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('empty address - space', () => {
					return app.route({
							' ' : {
								'GET' : async () => {
								}
							}
						})
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('uri include space', () => {
					return app.route({
							' users' : {
								'GET' : async () => {
								}
							}
						})
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('uri include space', () => {
					return app.route({
							'users ' : {
								'GET' : async () => {
								}
							}
						})
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('no rule', () => {
					return app.route({
							'users' : {}
						})
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('invalid method', () => {
					return app.route({
							'users' : {
								'get' : async () => {
								}
							}
						})
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('included invalid rule', () => {
					// setting defaultMethod cover this
					return app.route({
							'users' : {
								'GET' : async () => {
								},
								'something' : async () => {
								}
							}
						})
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('undefined rule 404', async () => {
					await app.route({
						'users' : {
							'POST' : testFnc
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
						'users' : {
							'GET' : testFnc
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
					return app.route({
							' /' : {
								'GET' : async () => {
								}
							}
						})
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('invalid root path', () => {
					return app.route({
							'/ ' : {
								'GET' : async () => {
								}
							}
						})
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});
			});

			it('ok - normal function', async () => {
				const testFnc = () => {
				};

				await app.route({
					'users' : {
						'GET' : testFnc
					}
				});

				const routeRules = (app as any)._routeRules;
				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				expect(routeRules[0]['/']).to.be.ok;
				expect(routeRules[0]['/']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']).to.have.property('users');

				expect(routeRules[0]['/']['users']).to.be.ok;
				expect(routeRules[0]['/']['users']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']['users']).to.have.property('GET');

				const routeFnc = routeRules[0]['/']['users']['GET'];
				expect(routeFnc).to.be.ok;
				expect(routeFnc).to.be.instanceOf(Function);
				expect(routeFnc).to.eql(testFnc);

				await app.listen(port);

				await request(app.getHttpServer())
					.get('/users')
					.expect(200);
			});

			it('ok - async function', async () => {
				let fncRunFlag = false;

				const testFnc = async () => {
					fncRunFlag = true;
				};

				await app.route({
					'users' : {
						'GET' : testFnc
					}
				});

				const routeRules = (app as any)._routeRules;
				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				expect(routeRules[0]['/']).to.be.ok;
				expect(routeRules[0]['/']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']).to.have.property('users');

				expect(routeRules[0]['/']['users']).to.be.ok;
				expect(routeRules[0]['/']['users']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']['users']).to.have.property('GET');

				const routeFnc = routeRules[0]['/']['users']['GET'];
				expect(routeFnc).to.be.ok;
				expect(routeFnc).to.be.instanceOf(Function);
				expect(routeFnc).to.eql(testFnc);

				await app.listen(port);

				const res = await request(app.getHttpServer())
					.get('/users')
					.expect(200);

				expect(res).to.be.ok;
				expect(fncRunFlag).to.be.true;
			});

			it('ok - with response', async () => {
				const testFnc = async () => {
					return 'ok';
				};

				await app.route({
					'users' : {
						'GET' : testFnc
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
				const testFnc = async () => {
					return [];
				};

				await app.route({
					'users' : {
						'GET' : testFnc
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
					'/users' : {
						'GET' : testFnc
					}
				});

				const routeRules : RouteRule = (app as any)._routeRules;
				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				expect(routeRules[0]['/']).to.be.ok;
				expect(routeRules[0]['/']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']).to.have.property('users');

				expect(routeRules[0]['/']['users']).to.be.ok;
				expect(routeRules[0]['/']['users']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']['users']).to.have.property('GET');

				const routeFnc = routeRules[0]['/']['users']['GET'];
				expect(routeFnc).to.be.ok;
				expect(routeFnc).to.be.instanceOf(Function);
				expect(routeFnc).to.eql(testFnc);

				await app.listen(port);

				expect(fncRunFlag).to.be.false;

				await request(app.getHttpServer())
					.get('/users')
					.expect(200);

				expect(fncRunFlag).to.be.true;
			});

			it('ok - end with slash', async () => {
				await app.route({
					'users/' : {
						'GET' : testFnc
					}
				});

				const routeRules : RouteRule = (app as any)._routeRules;
				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				expect(routeRules[0]['/']).to.be.ok;
				expect(routeRules[0]['/']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']).to.have.property('users');

				expect(routeRules[0]['/']['users']).to.be.ok;
				expect(routeRules[0]['/']['users']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']['users']).to.have.property('GET');

				const routeFnc = routeRules[0]['/']['users']['GET'];
				expect(routeFnc).to.be.ok;
				expect(routeFnc).to.be.instanceOf(Function);
				expect(routeFnc).to.eql(testFnc);

				await app.listen(port);

				expect(fncRunFlag).to.be.false;

				await request(app.getHttpServer())
					.get('/users')
					.expect(200);

				expect(fncRunFlag).to.be.true;
			});

			it('ok - start & end with slash', async () => {
				await app.route({
					'/users/' : {
						'GET' : testFnc
					}
				});

				const routeRules : RouteRule = (app as any)._routeRules;
				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				expect(routeRules[0]['/']).to.be.ok;
				expect(routeRules[0]['/']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']).to.have.property('users');

				expect(routeRules[0]['/']['users']).to.be.ok;
				expect(routeRules[0]['/']['users']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']['users']).to.have.property('GET');

				const routeFnc = routeRules[0]['/']['users']['GET'];
				expect(routeFnc).to.be.ok;
				expect(routeFnc).to.be.instanceOf(Function);
				expect(routeFnc).to.eql(testFnc);

				await app.listen(port);

				expect(fncRunFlag).to.be.false;

				await request(app.getHttpServer())
					.get('/users')
					.expect(200);

				expect(fncRunFlag).to.be.true;
			});

			it('ok - GET root', async () => {
				let fncRunFlag = false;

				const rootGetFnc = async () => {
					fncRunFlag = true;
				};

				await app.route({
					'/' : {
						'GET' : rootGetFnc
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
				const firstName = 'Janghyun';
				const lastName = 'Han';

				let fncRunFlag = false;

				const rootPostFnc = async (param) => {
					fncRunFlag = true;

					// return param data;
					return param;
				};

				await app.route({
					'/' : {
						'POST' : rootPostFnc
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
				let fncARunFlag = false;
				let fncBRunFlag = false;

				const fncA = async () => {
					fncARunFlag = true;
				};
				const fncB = async () => {
					fncBRunFlag = true;
				};

				await app.route({
					'users' : {
						GET : fncA
					}
				});

				await app.route({
					'users' : {
						POST : fncB
					}
				});

				const routeRules : RouteRule[] = (app as any)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(2);

				routeRules.forEach((rule, i) => {
					expect(rule).to.have.property('/');

					expect(rule['/']).to.have.property('users');
					expect(rule['/']['users']).to.be.instanceOf(Object);

					switch (i) {
						case 0:
							expect(rule['/']['users']).to.have.property('GET', fncA);
							break;

						case 1:
							expect(rule['/']['users']).to.have.property('POST', fncB);
							break;
					}
				});
			});

			it('ok - multiple assign from root', async () => {
				let fncARunFlag = false;
				let fncBRunFlag = false;

				const fncA = async () => {
					fncARunFlag = true;
				};
				const fncB = async () => {
					fncBRunFlag = true;
				};

				await app.route({
					'users/a' : {
						'GET' : fncA
					},
					'users/b' : {
						'GET' : fncB
					}
				});

				const routeRules : RouteRule[] = (app as any)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				expect(routeRules[0]['/']).to.be.ok;
				;
				expect(routeRules[0]['/']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']).to.have.property('users');

				expect(routeRules[0]['/']['users']).to.have.property('a');
				expect(routeRules[0]['/']['users']['a']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']['users']['a']).to.have.property('GET', fncA);

				expect(routeRules[0]['/']['users']).to.have.property('b');
				expect(routeRules[0]['/']['users']['b']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']['users']['b']).to.have.property('GET', fncB);

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
				let usersRunFlag = false;
				let recordsRunFlag = false;

				const usersGetFnc = async () => {
					usersRunFlag = true;
				};
				const recordsGetFnc = async () => {
					recordsRunFlag = true;
				};

				await app.route({
					'users' : {
						'GET' : usersGetFnc
					},
					'records' : {
						'GET' : recordsGetFnc
					}
				});

				const routeRules : RouteRule[] = (app as any)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				expect(routeRules[0]['/']).to.be.ok;
				expect(routeRules[0]['/']).to.be.instanceOf(Object);

				expect(routeRules[0]['/']).to.have.property('users');
				expect(routeRules[0]['/']['users']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']['users']).to.have.property('GET', usersGetFnc);

				expect(routeRules[0]['/']).to.have.property('records');
				expect(routeRules[0]['/']['records']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']['records']).to.have.property('GET', recordsGetFnc);

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
				let fnc1RunFlag = false;
				let fnc2RunFlag = false;
				let fnc3RunFlag = false;

				const fnc1 = async () => {
					fnc1RunFlag = true;
				};
				const fnc2 = async () => {
					fnc2RunFlag = true;
				};
				const fnc3 = async () => {
					fnc3RunFlag = true;
				};

				await app.route({
					'root' : {
						'GET' : fnc1,
						'branch1' : {
							'GET' : fnc2,
							'branch2' : {
								'GET' : fnc3
							}
						}
					}
				});

				const routeRules : RouteRule[] = (app as any)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				expect(routeRules[0]['/']).to.be.ok;
				expect(routeRules[0]['/']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']).to.have.property('root');

				expect(routeRules[0]['/']['root']).to.be.ok;
				expect(routeRules[0]['/']['root']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']['root']).to.have.property('GET', fnc1);

				expect(routeRules[0]['/']['root']).to.have.property('branch1');
				expect(routeRules[0]['/']['root']['branch1']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']['root']['branch1']).to.have.property('GET', fnc2);

				expect(routeRules[0]['/']['root']['branch1']).to.have.property('branch2');
				expect(routeRules[0]['/']['root']['branch1']['branch2']).to.be.instanceOf(Object);
				expect(routeRules[0]['/']['root']['branch1']['branch2']).to.have.property('GET', fnc3);

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
				let fncRunFlag = false;

				const testFnc = async () => {
					fncRunFlag = true;
				};

				await app.route({
					'users/a/b/c' : {
						'POST' : testFnc
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
				const testFnc = async () => {
					return 'ok';
				};

				await app.route({
					'users' : {
						'a' : {
							'b' : {
								'c' : {
									'GET' : testFnc
								}
							}
						}
					}
				});

				const routeRules : RouteRule[] = (app as any)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				expect(routeRules[0]['/']).to.be.ok;
				expect(routeRules[0]['/']).to.be.instanceOf(Object);

				expect(routeRules[0]['/']).to.have.property('users');
				expect(routeRules[0]['/']['users']).to.be.instanceOf(Object);

				expect(routeRules[0]['/']['users']).to.have.property('a');
				expect(routeRules[0]['/']['users']['a']).to.be.instanceOf(Object);

				expect(routeRules[0]['/']['users']['a']).to.have.property('b');
				expect(routeRules[0]['/']['users']['a']['b']).to.be.instanceOf(Object);

				expect(routeRules[0]['/']['users']['a']['b']).to.have.property('c');
				expect(routeRules[0]['/']['users']['a']['b']['c']).to.be.instanceOf(Object);

				expect(routeRules[0]['/']['users']['a']['b']['c']).to.have.property('GET', testFnc);

				await app.listen(port);

				const res = await request(app.getHttpServer())
					.get('/users/a/b/c')
					.expect(200);

				expect(res).to.be.ok;
				expect(res.text).to.be.eql('ok');
			});
		});

		describe('abbreviation', () => {
			const testFnc = async () => {
				return 'ok';
			};

			describe('error', () => {
				it('invalid format', async () => {
					await app.route({
							'users///a' : {
								'GET' : testFnc
							}
						})
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('include space', async () => {
					await app.route({
							'users/ a' : {
								'GET' : testFnc
							}
						})
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});

				it('include space', async () => {
					await app.route({
							'users/ /a' : {
								'GET' : testFnc
							}
						})
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceOf(Error);
						});
				});
			});

			it('ok - 2 depth', async () => {
				await app.route({
					'users/a' : {
						'GET' : testFnc
					}
				});

				const routeRules : RouteRule[] = (app as any)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				expect(routeRules[0]['/']).to.be.ok;
				expect(routeRules[0]['/']).to.be.instanceOf(Object);

				const userRule = routeRules[0]['/']['users'];
				expect(userRule).to.be.ok;
				expect(userRule).to.be.instanceOf(Object);
				expect(Object.keys(userRule)).to.includes('a');

				const secondDepthRule = userRule['a'];
				expect(secondDepthRule).to.be.ok;
				expect(secondDepthRule).to.be.instanceOf(Object);
				expect(Object.keys(secondDepthRule)).to.includes('GET');

				const secondDepthFnc = secondDepthRule['GET'];
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
				const uri = 'users/a/b/c/d/e/f/g/h/i';

				await app.route({
					[uri] : {
						'GET' : testFnc
					}
				});

				const uriArr = uri.split('/');

				const routeRules : RouteRule[] = (app as any)._routeRules;

				expect(routeRules).to.be.ok;
				expect(routeRules).to.be.instanceOf(Array);
				expect(routeRules).to.be.lengthOf(1);

				expect(routeRules[0]).to.be.ok;
				expect(routeRules[0]).to.be.instanceOf(Object);
				expect(routeRules[0]).to.have.property('/');

				expect(routeRules[0]['/']).to.be.ok;
				expect(routeRules[0]['/']).to.be.instanceOf(Object);

				let targetRuleObj : RouteRule | RouteRuleSeed | Function = routeRules[0]['/'];

				uriArr.forEach((uri, i, arr) => {
					expect(Object.keys(targetRuleObj)).to.includes(uri);

					targetRuleObj = targetRuleObj[uri];

					if (i === arr.length - 1) {
						const targetFnc = targetRuleObj['GET'];

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
					it('colon in end index', async () => {
						await app.route({
								'users/some:id' : {
									'GET' : async () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('colon in middle index', async () => {
						await app.route({
								'users/id:some' : {
									'GET' : async () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('same level & multiple colon routing, in same time', async () => {
						await app.route({
								'users' : {
									':id' : {
										'GET' : async () => {
										}
									},
									':name' : {
										'GET' : async () => {
										}
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('root level & multiple colon routing, in same time', async () => {
						await app.route({
								':id' : {
									GET : async () => {
									}
								},
								':name' : {
									GET : async () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('root level & multiple colon routing, in different time', async () => {
						await app.route({
							':id' : {
								GET : async () => {
								}
							}
						});

						return app.route({
								':name' : {
									GET : async () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('same level & multiple colon routing, in different time', async () => {
						await app.route({
							'users' : {
								':id' : {
									'GET' : async () => {
									}
								}
							}
						});

						return app.route({
								'users' : {
									':name' : {
										'GET' : async () => {
										}
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('same level & multiple colon routing, in different time, in uri', async () => {
						await app.route({
							'users/:id' : {
								'GET' : async () => {
								}
							}
						});

						return app.route({
								'users/:name' : {
									'GET' : async () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});
				});

				it('ok - GET', async () => {
					const testId = 'this_is_id';
					let fncRunFlag = false;

					const testFnc = async (param) => {
						expect(param).to.be.ok;
						expect(param).to.be.instanceOf(Object);

						expect(param['id']).to.be.ok;
						expect(param['id']).to.be.eql(testId);

						fncRunFlag = true;
					};

					await app.route({
						'users/:id' : {
							'GET' : testFnc
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
					const testId = 'this_is_id';
					let fncRunFlag = false;

					const testFnc = async (param) => {
						expect(param).to.be.ok;
						expect(param).to.be.instanceOf(Object);

						expect(param['id']).to.be.ok;
						expect(param['id']).to.be.eql(testId);

						fncRunFlag = true;

						return {
							id : testId
						};
					};

					await app.route({
						'users/:id' : {
							'GET' : testFnc
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
					const firstName = 'Janghyun';
					const lastName = 'Han';

					let fncRunFlag = false;

					const testFnc = async (param) => {
						expect(param).to.be.ok;
						expect(param).to.be.instanceOf(Object);

						expect(param).to.have.property('firstName', firstName);
						expect(param).to.have.property('lastName', lastName);

						fncRunFlag = true;
					};

					await app.route({
						'users/:firstName/some/:lastName' : {
							'GET' : testFnc
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
					const firstName = 'Janghyun';
					const lastName = 'Han';

					let fncRunFlag = false;

					const testFnc = async (param) => {
						fncRunFlag = true;

						return {
							firstName : param.firstName,
							lastName : param.lastName
						};
					};

					await app.route({
						'users/:firstName/some/:lastName' : {
							'GET' : testFnc
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
					const testId = 'this_is_id';
					const firstName = 'Janghyun';
					const lastName = 'Han';

					let fncRunFlag = false;

					const testFnc = async (param) => {
						expect(param).to.be.ok;
						expect(param).to.be.instanceOf(Object);
						expect(param).to.have.property('firstName', firstName);
						expect(param).to.have.property('lastName', lastName);

						fncRunFlag = true;
					};

					await app.route({
						'users/:id' : {
							'POST' : testFnc
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
					it('start with \'?\'', async () => {
						const testUri = '?users';

						await app.route({
								[testUri] : {
									'GET' : () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('duplicated routing - normal uri first with route() in same time', async () => {
						const questionUri = 'users?';
						const normalUri = 'user';

						await app.route({
								[normalUri] : {
									'GET' : () => {
									}
								},
								[questionUri] : {
									'GET' : () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('duplicated routing - normal uri first with route()', async () => {
						const questionUri = 'users?';
						const normalUri = 'user';

						await app.route({
							[normalUri] : {
								'GET' : () => {
								}
							}
						});

						await app.route({
								[questionUri] : {
									'GET' : () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('duplicated routing - normal uri first with get()', async () => {
						const questionUri = 'users?';
						const normalUri = 'user';

						await app.get(normalUri, () => {
							})
							.then(() => {
								return app.get(questionUri, () => {
								});
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('duplicated routing - question uri first with route()', async () => {
						const questionUri = 'users?';
						const normalUri = 'user';

						await app.route({
								[questionUri] : {
									'GET' : () => {
									}
								}
							})
							.then(() => {
								return app.route({
									[normalUri] : {
										'GET' : () => {
										}
									}
								});
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('duplicated routing - question uri first with get()', async () => {
						const questionUri = 'users?';
						const normalUri = 'user';

						await app.get(questionUri, () => {
							})
							.then(() => {
								return app.get(normalUri, () => {
								});
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});
				});

				describe('ok', () => {
					it('normal', async () => {
						const testUri = 'users?';

						let testFncRunFlag = false;

						const testFnc = async (param) => {
							testFncRunFlag = true;

							expect(param).to.be.ok;

							expect(new RegExp(testUri).test(param[testUri])).to.be.true;
						};

						await app.route({
							[testUri] : {
								'GET' : testFnc
							}
						});

						await app.listen(port);

						await request(app.getHttpServer())
							.get('/user')
							.expect(200);

						await request(app.getHttpServer())
							.get('/users')
							.expect(200);
					});

					it('multiple \'?\' in one uri', async () => {
						const testUri = 'u?se?rs';

						let testFncRunCount = 0;
						const testFnc = () => {
							testFncRunCount++;
						};

						await app.route({
							[testUri] : {
								'GET' : testFnc
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
						const testUri1 = 'users?';
						const testUri2 = 'records?';

						let userRunCount = 0;
						let recordRunCount = 0;

						const userFnc = () => {
							userRunCount++;
						};

						const recordFnc = () => {
							recordRunCount++;
						};

						await app.route({
							[testUri1] : {
								'GET' : userFnc
							},
							[testUri2] : {
								'GET' : recordFnc
							}
						});

						const appRouteRule : RouteRule[] = (app as any)._routeRules;

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
						const testUri = 'abc?d';

						let testFncRunCount = 0;

						const testFnc = () => {
							testFncRunCount++;
						};

						await app.route({
							[testUri] : {
								'GET' : testFnc
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
						const testUri = 'ab(cd)?e';

						let outerCounter : number = 0;
						let testFncRunCount = 0;

						const testFnc = () => {
							testFncRunCount++;
						};

						await app.route({
							[testUri] : {
								'GET' : testFnc
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
					it('start with \'+\'', async () => {
						await app.route({
								'+abcd' : {
									'GET' : () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('duplicated routing, normal uri first', async () => {
						await app.route({
							'abc' : {
								'GET' : () => {
								}
							}
						});

						await app.route({
								'ab+c' : {
									'GET' : () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('duplicated routing, plus uri first', async () => {
						await app.route({
							'ab+c' : {
								'GET' : () => {
								}
							}
						});

						await app.route({
								'abc' : {
									'GET' : () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('duplicated routing, duplicated plus uri', async () => {
						await app.route({
							'ab+c' : {
								'GET' : () => {
								}
							}
						});

						await app.route({
								'abc+' : {
									'GET' : () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});
				});

				describe('ok', () => {
					it('normal', async () => {
						const testUri = 'ab+cd';

						let testFncRunCount = 0;
						const testFnc = (param) => {
							expect(param).to.be.ok;

							expect(param[testUri]).to.be.ok;
							expect(new RegExp(testUri).test(param[testUri])).to.be.true;

							testFncRunCount++;
						};

						await app.route({
							[testUri] : {
								'GET' : testFnc
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
						let testFncRunCount = 0;
						const testFnc = () => {
							testFncRunCount++;
						};

						await app.route({
							'a+b+c' : {
								'GET' : testFnc
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
				let validUrls : string[] = [];
				let invalidUrls : string[] = [];
				let calledUrls : string[] = [];

				beforeEach(() => {
					validUrls = [];
					invalidUrls = [];
					calledUrls = [];
				});

				afterEach(async () => {
					await Promise.all(validUrls.map(testUri => {
						return request(app.getHttpServer())
							.get(testUri)
							.expect(200);
					}));

					validUrls.forEach(testUri => {
						expect(calledUrls).to.include(testUri);
					});

					await Promise.all(invalidUrls.map(testUri => {
						return request(app.getHttpServer())
							.get(testUri)
							.expect(404);
					}));
				});

				describe('**', () => {
					const testFnc = (param, req) => {
						expect(param).to.be.ok;
						expect(param).to.have.property('**');

						calledUrls.push(req.url);
					};

					[
						'',
						'/nested'
					].forEach(prefix => {
						it(prefix + '/**', async () => {
							await app.route({
								[prefix + '/**'] : {
									'GET' : testFnc
								}
							});

							await app.listen(port);

							const routeRules : RouteRule = (app as any)._routeRules;
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
					const testFnc = (param, req) => {
						expect(param).to.be.ok;
						expect(param).to.have.property('*');

						calledUrls.push(req.url);
					};

					describe('last frag', () => {
						[
							'',
							'/nested'
						].forEach((prefix, i) => {
							it(prefix + '/*', async () => {
								await app.route({
									[prefix + '/*'] : {
										'GET' : testFnc
									}
								});

								await app.listen(port);

								const routeRules : RouteRule = (app as any)._routeRules;
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
						].forEach(prefix => {
							it(prefix + '/*/a', async () => {
								await app.route({
									[prefix + '/*/a'] : {
										'GET' : testFnc
									}
								});

								await app.listen(port);

								const routeRules : RouteRule = (app as any)._routeRules;
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
					const testFrag = 'ab*cd';

					const testFnc = (param, req) => {
						expect(param).to.be.ok;

						const regExpKey : string = param[testFrag].replace('*', '(\\w)*');
						expect(param[testFrag]).to.be.ok;
						expect(new RegExp(regExpKey).test(param[testFrag])).to.be.true;

						calledUrls.push(req.url);
					};

					[
						// '',
						'/nested'
					].forEach(prefix => {
						it(prefix + '/ab*cd', async () => {
							await app.route({
								[`${ prefix }/${ testFrag }`] : {
									'GET' : testFnc
								}
							});

							await app.listen(port);

							const routeRules : RouteRule = (app as any)._routeRules;
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
		const methodArr = ['get', 'post', 'put', 'delete'];

		methodArr.forEach(method => {
			describe(`${ method }()`, () => {
				it('defined', () => {
					expect(app[method]).to.be.ok;
				});

				describe('error', () => {
					it('no address', async () => {
						await app[method]()
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});

					it('no function', async () => {
						await app[method]('/users')
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceOf(Error);
							});
					});
				});

				it('ok - normal function', async () => {
					const uri = '/users';
					let fncRun = false;

					await app[method](uri, async () => {
						fncRun = true;

						return {
							data : ['user1', 'user2']
						};
					});

					await app.listen(port);

					const requestObj = request(app.getHttpServer());
					let requestFnc = null;

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

					const res = await requestFnc.expect(200);

					expect(res).to.be.ok;
					expect(fncRun).to.be.true;

					expect(res.body).to.be.ok;
					expect(res.body).to.be.instanceOf(Object);
					expect(res.body.data).to.be.ok;
					expect(res.body.data).to.be.instanceOf(Array);
					expect(res.body.data.length).to.be.eql(2);
				});

				it('ok - async function', async () => {
					const uri = '/users';
					let fncRun = false;

					await app[method](uri, async () => {
						fncRun = true;

						return {
							data : ['user1', 'user2']
						};
					});

					await app.listen(port);

					const requestObj = request(app.getHttpServer());
					let requestFnc = null;

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

					const res = await requestFnc.expect(200);

					expect(res).to.be.ok;
					expect(fncRun).to.be.true;

					expect(res.body).to.be.ok;
					expect(res.body).to.be.instanceOf(Object);
					expect(res.body.data).to.be.ok;
					expect(res.body.data).to.be.instanceOf(Array);
					expect(res.body.data.length).to.be.eql(2);
				});

				it('ok - url abbreviation', async () => {
					const uri = '/users/a/b/c';
					let fncRun = false;

					await app[method](uri, async () => {
						fncRun = true;

						return {
							data : ['user1', 'user2']
						};
					});

					await app.listen(port);

					const requestObj = request(app.getHttpServer());
					let requestFnc = null;

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

					const res = await requestFnc.expect(200);

					expect(res).to.be.ok;
					expect(fncRun).to.be.true;

					expect(res.body).to.be.ok;
					expect(res.body).to.be.instanceOf(Object);
					expect(res.body.data).to.be.ok;
					expect(res.body.data).to.be.instanceOf(Array);
					expect(res.body.data.length).to.be.eql(2);
				});

				it('ok - assign different uri', async () => {
					const uri1 = '/users/1';
					const uri2 = '/users/2';

					let fnc1RunFlag = false;
					let fnc2RunFlag = false;

					const fnc1 = async () => {
						fnc1RunFlag = true;
					};
					const fnc2 = async () => {
						fnc2RunFlag = true;
					};

					await app[method](uri1, fnc1);
					await app[method](uri2, fnc2);

					await app.listen(port);

					const requestObj1 = request(app.getHttpServer());
					let requestFnc1 = null;

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

					const res1 = await requestFnc1.expect(200);

					expect(res1).to.be.ok;
					expect(fnc1RunFlag).to.be.true;
					expect(fnc2RunFlag).to.be.false;

					const requestObj2 = request(app.getHttpServer());
					let requestFnc2 = null;

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

					const res2 = await requestFnc2.expect(200);

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
			it('not started', async () => {
				await app.stop()
					.then(fail, (err) => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceOf(Error);
					});
			});
		});

		it('ok', async () => {
			await app.listen(port);

			await app.stop();
		});
	});
});