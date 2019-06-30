import * as fs from 'fs';
import * as path from 'path';

import 'mocha';

import { expect } from 'chai';
import * as request from 'supertest';

import { Badak } from '../src/badak';

const fail = async () => {
	throw new Error('this should be not execute');
};

const port = 65030;

describe('core', () => {
	let app = null;

	beforeEach(() => {
		app = new Badak;
	});

	afterEach(() => {
		return app.isRunning() ? app.stop() : Promise.resolve();
	});

	it('creating instance', () => {
		expect(Badak).to.be.ok;

		const app = new Badak;

		expect(app).to.be.ok;
		expect(app).to.be.instanceof(Badak);
	});

	describe('config()', () => {
		it('config itself defined', () => {
			expect(app.config).to.be.ok;
		});

		it('not defined key', () => {
			return app.config('somethingNotDefinedKey', true)
				.then(fail, (err) => {
					expect(err).to.be.ok;
					expect(err).to.be.instanceof(Error);
				});
		});

		describe('invalid value', () => {
			const booleanKeys : string[] = ['parseNumber', 'parseDate'];

			booleanKeys.forEach(key => {
				it(key + ' - undefined', () => {
					return app.config(key, undefined)
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});

				it(key + ' - null', () => {
					return app.config(key, null)
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});

				it(key + ' - string', () => {
					return app.config(key, 'hello')
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});

				it(key + ' - number', () => {
					return app.config(key, 123)
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
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

					expect(param.date).to.be.instanceof(Date);

					expect(param.noDate).to.be.a('string');
					expect(param.noDate).to.be.eql(noDateStr);
				};

				const testFncStr = (param) => {
					expect(param).to.be.ok;

					expect(param.num).to.be.a('string');
					expect(param.num).to.be.eql('' + num);

					expect(param.float).to.be.a('string');
					expect(param.float).to.be.eql('' + float);

					expect(param.date).to.be.instanceof(Date);

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

						it('set value - lower case', () => {
							return app.config('defaultMethod', method.toLowerCase())
								.then(fail, err => {
									expect(err).to.be.ok;
									expect(err).to.be.instanceof(Error);
								});
						});
					});
				});

				it('set value failed - not string', async () => {
					await app.config('defaultMethod', true)
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});

					await app.config('defaultMethod', false)
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});

					await app.config('defaultMethod', 123)
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});

				// TODO: method included in uri
				// TODO: lower case

				it('set value failed - not defined method', async () => {
					return app.config('defaultMethod', 'something_method')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});

				// TODO: same uri with METHOD
			});

			it('default - can\'t set', () => {
				return app.route({
						[testUri] : echoFnc
					})
					.then(fail, err => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceof(Error);
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
								const routeRule = (app as any)._routeRule;

								expect(routeRule).to.be.ok;
								expect(routeRule).to.have.property(testUriRefined);
								expect(routeRule[testUriRefined]).to.have.property(setMethod);

								return getReqFnc(testMethod)
									.expect(setMethod === testMethod ? 200 : 404);
							});
						});
					});

					// TODO: nested route
				});
			});
		});
	});

	describe('listen()', () => {
		it('defined', () => {
			expect(app.listen).to.be.ok;
		});

		describe('error', () => {
			it('no port param', () => {
				return app.listen()
					.then(fail, (err) => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceof(Error);
					});
			});

			it('port param - string', () => {
				return app.listen('3000')
					.then(fail, (err) => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceof(Error);
					});
			});

			it('run twice', () => {
				return app.listen(port)
					.then(() => {
						return app.listen(port);
					})
					.then(fail, (err) => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceof(Error);
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
				expect(param).to.be.instanceof(Object);

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
				expect(res.body).to.be.instanceof(Object);
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
				expect(res.body).to.be.instanceof(Object);
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
				expect(res.body).to.be.instanceof(Object);
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
		let app : Badak = null;

		beforeEach(() => {
			app = new Badak;
		});

		afterEach(() => {
			return app.isRunning() ?
				app.stop() :
				Promise.resolve();
		});

		it('defined', () => {
			expect(app.static).to.be.ok;
		});

		describe('error', () => {
			describe('uri', () => {
				it('no parameter', () => {
					return app.static(undefined, '.')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});

				it('invalid parameter === null', () => {
					return app.static(null, '.')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});

				it('not absolute path', () => {
					return app.static('someUri', 'something')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});

				it('invalid path', () => {
					return app.static('/some///thing', 'something')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});
			});

			describe('path', () => {
				it('no parameter', () => {
					return app.static('/', undefined)
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});

				it('invalid parameter === null', () => {
					return app.static('/', null)
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});

				it('not absolute path', () => {
					return app.static('/', 'something')
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});
			});
		});

		it('not exist file', async () => {
			const fullUri : string = `/static/notExistFile.text'`;
			const filePath = path.join(__dirname, '/static');

			await app.static('/static', filePath);

			await app.listen(port);

			await request(app.getHttpServer()).post(fullUri).expect(404);
			await request(app.getHttpServer()).post(fullUri).expect(404);
			await request(app.getHttpServer()).put(fullUri).expect(404);
			await request(app.getHttpServer()).delete(fullUri).expect(404);
		});

		describe('about uri', () => {
			let fileName : string;
			let filePath : string;
			let fullPath : string;

			let fileData : string;

			const checkBefore = (keyUri : string) => {
				const staticRules = (app as any)._staticRules;

				expect(staticRules).to.be.ok;
				expect(staticRules).to.be.instanceof(Object);

				expect(staticRules[keyUri]).to.be.ok;
				expect(staticRules[keyUri]).to.be.a('string');
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
								const staticCache = (app as any)._staticCache;

								expect(staticCache).to.be.ok;
								expect(staticCache).to.be.instanceof(Object);
								expect(staticCache[fullUri]).to.be.ok;
								expect(staticCache[fullUri].mime).to.be.eql('text/plain');
								expect(staticCache[fullUri].fileData).to.be.ok;
							}
						})
				);
			};

			before(async () => {
				fileName = 'test.text';
				filePath = path.join(__dirname, '/static');
				fullPath = path.join(filePath, fileName);

				fileData = await new Promise<string>((resolve, reject) => {
					fs.readFile(fullPath, (err : Error, data : Buffer) => {
						if (!err) {
							resolve(data.toString());
						} else {
							reject(err);
						}
					});
				});
			});

			['/', '/static',].forEach(uri => {
				it(`ok : ${ uri }`, async () => {
					const fullUri : string = `${ uri === '/' ? '' : uri }/${ fileName }`;

					await app.static(uri, filePath);

					checkBefore(uri);

					await app.listen(port);

					await checkAfter(fullUri);
				});
			});

			it('ok - end with /', async () => {
				const uri : string = '/static/';
				const fullUri : string = `${ uri }${ fileName }`;

				await app.static(uri, filePath);

				checkBefore(uri);

				await app.listen(port);

				await checkAfter(fullUri);
			});

			it('ok - nested url', async () => {
				const uri : string = '/static/some/inner/path';
				const fullUri : string = `${ uri }/${ fileName }`;

				await app.static(uri, filePath);

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
						await app.static(uri, filePath);

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

			it('ok - override same url', async () => {
				const uri : string = '/static';
				const fullUri : string = `${ uri }${ fileName }`;

				await app.static(uri, path.join(__dirname, '/1'));
				await app.static(uri, path.join(__dirname, '/2'));
				await app.static(uri, path.join(__dirname, '/3'));
				await app.static(uri, path.join(__dirname, '/4'));
				await app.static(uri, path.join(__dirname, '/5'));
				await app.static(uri, path.join(__dirname, '/6'));
				await app.static(uri, filePath);

				checkBefore(uri);

				await app.listen(port);

				await checkAfter(fullUri);
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
					await Promise.all([
						request(app.getHttpServer())
							.get(fullUri)
							.expect(200)
							.then((_res : any) : void => {
								const res : Response = _res as Response;

								expect(res).to.be.ok;

								const contentType : string = res.headers['content-type'];
								expect(contentType).to.be.eql(mime);

								expect(!!res.body || !!res.text).to.be.ok;
							}),
						request(app.getHttpServer()).post(fullUri).expect(404),
						request(app.getHttpServer()).put(fullUri).expect(404),
						request(app.getHttpServer()).delete(fullUri).expect(404)
					]);

					// request twice to check cache working
					await Promise.all([
						request(app.getHttpServer())
							.get(fullUri)
							.expect(200)
							.then((_res : any) : void => {
								const res : Response = _res as Response;

								expect(res).to.be.ok;

								const contentType : string = res.headers['content-type'];
								expect(contentType).to.be.eql(mime);

								expect(!!res.body || !!res.text).to.be.ok;
							}),
						request(app.getHttpServer()).post(fullUri).expect(404),
						request(app.getHttpServer()).put(fullUri).expect(404),
						request(app.getHttpServer()).delete(fullUri).expect(404)
					]);
				});
			});
		});
	});

	describe('route()', () => {
		let app : Badak = null;

		beforeEach(() => {
			app = new Badak;
		});

		afterEach(() => {
			return app.isRunning() ?
				app.stop() :
				Promise.resolve();
		});

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
							expect(err).to.be.instanceof(Error);
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
							expect(err).to.be.instanceof(Error);
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
							expect(err).to.be.instanceof(Error);
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
							expect(err).to.be.instanceof(Error);
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
							expect(err).to.be.instanceof(Error);
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
							expect(err).to.be.instanceof(Error);
						});
				});

				it('no rule', () => {
					return app.route({
							'users' : {}
						})
						.then(fail, err => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
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
							expect(err).to.be.instanceof(Error);
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
							expect(err).to.be.instanceof(Error);
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
							expect(err).to.be.instanceof(Error);
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
							expect(err).to.be.instanceof(Error);
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

				const routeRule = (app as any)._routeRule;

				expect(routeRule).to.be.ok;
				expect(routeRule).to.be.instanceof(Object);
				expect(Object.keys(routeRule)).to.includes('users');

				expect(routeRule['users']).to.be.ok;
				expect(routeRule['users']).to.be.instanceof(Object);
				expect(Object.keys(routeRule['users'])).to.includes('GET');

				const routeFnc = routeRule['users']['GET'];
				expect(routeFnc).to.be.ok;
				expect(routeFnc).to.be.instanceof(Function);
				expect(routeFnc).to.eql(testFnc);

				await app.listen(port);

				return request(app.getHttpServer())
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

				const routeRule = (app as any)._routeRule;

				expect(routeRule).to.be.ok;
				expect(routeRule).to.be.instanceof(Object);
				expect(Object.keys(routeRule)).to.includes('users');

				expect(routeRule['users']).to.be.ok;
				expect(routeRule['users']).to.be.instanceof(Object);
				expect(Object.keys(routeRule['users'])).to.includes('GET');

				const routeFnc = routeRule['users']['GET'];
				expect(routeFnc).to.be.ok;
				expect(routeFnc).to.be.instanceof(Function);
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

			it('ok - start with slash', async () => {
				await app.route({
					'/users' : {
						'GET' : testFnc
					}
				});

				const routeRule = (app as any)._routeRule;

				expect(routeRule).to.be.ok;
				expect(routeRule).to.be.instanceof(Object);
				expect(Object.keys(routeRule)).to.includes('users');

				expect(routeRule['users']).to.be.ok;
				expect(routeRule['users']).to.be.instanceof(Object);
				expect(Object.keys(routeRule['users'])).to.includes('GET');

				const routeFnc = routeRule['users']['GET'];
				expect(routeFnc).to.be.ok;
				expect(routeFnc).to.be.instanceof(Function);
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

				const routeRule = (app as any)._routeRule;

				expect(routeRule).to.be.ok;
				expect(routeRule).to.be.instanceof(Object);
				expect(Object.keys(routeRule)).to.includes('users');

				expect(routeRule['users']).to.be.ok;
				expect(routeRule['users']).to.be.instanceof(Object);
				expect(Object.keys(routeRule['users'])).to.includes('GET');

				const routeFnc = routeRule['users']['GET'];
				expect(routeFnc).to.be.ok;
				expect(routeFnc).to.be.instanceof(Function);
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

				const routeRule = (app as any)._routeRule;

				expect(routeRule).to.be.ok;
				expect(routeRule).to.be.instanceof(Object);
				expect(Object.keys(routeRule)).to.includes('users');

				expect(routeRule['users']).to.be.ok;
				expect(routeRule['users']).to.be.instanceof(Object);
				expect(Object.keys(routeRule['users'])).to.includes('GET');

				const routeFnc = routeRule['users']['GET'];
				expect(routeFnc).to.be.ok;
				expect(routeFnc).to.be.instanceof(Function);
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

				expect((app as any)._routeRule).to.be.ok;
				expect((app as any)._routeRule).to.be.instanceof(Object);
				expect((app as any)._routeRule).to.have.property('users');

				expect((app as any)._routeRule['users']).to.be.ok;
				expect((app as any)._routeRule['users']).to.be.instanceof(Object);

				expect((app as any)._routeRule['users']).to.have.property('GET', fncA);
				expect((app as any)._routeRule['users']).to.have.property('POST', fncB);
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

				expect((app as any)._routeRule).to.be.ok;
				expect((app as any)._routeRule).to.be.instanceof(Object);
				expect((app as any)._routeRule).to.have.property('users');

				expect((app as any)._routeRule['users']).to.be.ok;
				expect((app as any)._routeRule['users']).to.be.instanceof(Object);

				expect((app as any)._routeRule['users']['a']).to.be.ok;
				expect((app as any)._routeRule['users']['a']).to.be.instanceof(Object);
				expect((app as any)._routeRule['users']['a']).to.have.property('GET', fncA);

				expect((app as any)._routeRule['users']['b']).to.be.ok;
				expect((app as any)._routeRule['users']['b']).to.be.instanceof(Object);
				expect((app as any)._routeRule['users']['b']).to.have.property('GET', fncB);

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

				expect((app as any)._routeRule).to.be.ok;
				expect((app as any)._routeRule).to.be.instanceof(Object);

				expect((app as any)._routeRule).to.have.property('users');
				expect((app as any)._routeRule['users']).to.be.instanceof(Object);
				expect((app as any)._routeRule['users']).to.have.property('GET');
				expect((app as any)._routeRule['users']['GET']).to.be.eql(usersGetFnc);

				expect((app as any)._routeRule).to.have.property('records');
				expect((app as any)._routeRule['records']).to.be.instanceof(Object);
				expect((app as any)._routeRule['records']).to.have.property('GET');
				expect((app as any)._routeRule['records']['GET']).to.be.eql(recordsGetFnc);

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
						GET : fnc1,
						'branch1' : {
							GET : fnc2,
							'branch2' : {
								GET : fnc3
							}
						}
					}
				});

				expect((app as any)._routeRule).to.be.ok;
				expect((app as any)._routeRule).to.be.instanceof(Object);

				expect((app as any)._routeRule).to.have.property('root');
				expect((app as any)._routeRule['root']).to.be.instanceof(Object);
				expect((app as any)._routeRule['root']).to.have.property('GET', fnc1);

				expect((app as any)._routeRule['root']).to.have.property('branch1');
				expect((app as any)._routeRule['root']['branch1']).to.be.instanceof(Object);
				expect((app as any)._routeRule['root']['branch1']).to.have.property('GET', fnc2);

				expect((app as any)._routeRule['root']['branch1']).to.have.property('branch2');
				expect((app as any)._routeRule['root']['branch1']['branch2']).to.be.instanceof(Object);
				expect((app as any)._routeRule['root']['branch1']['branch2']).to.have.property('GET', fnc3);

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

				expect((app as any)._routeRule).to.be.ok;
				expect((app as any)._routeRule).to.have.property('users');
				expect((app as any)._routeRule['users']).to.have.property('a');
				expect((app as any)._routeRule['users']['a']).to.have.property('b');
				expect((app as any)._routeRule['users']['a']['b']).to.have.property('c');
				expect((app as any)._routeRule['users']['a']['b']['c']).to.have.property('GET', testFnc);

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
				it('invalid format', () => {
					return app.route({
							'users///a' : {
								'GET' : testFnc
							}
						})
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});

				it('include space', () => {
					return app.route({
							'users/ a' : {
								'GET' : testFnc
							}
						})
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});

				it('include space', () => {
					return app.route({
							'users/ /a' : {
								'GET' : testFnc
							}
						})
						.then(fail, (err) => {
							expect(err).to.be.ok;
							expect(err).to.be.instanceof(Error);
						});
				});
			});

			it('ok - 2 depth', async () => {
				await app.route({
					'users/a' : {
						'GET' : testFnc
					}
				});

				const routeRule = (app as any)._routeRule;

				expect(routeRule).to.be.ok;
				expect(routeRule).to.be.instanceof(Object);
				expect(Object.keys(routeRule)).to.includes('users');

				const userRule = routeRule['users'];
				expect(userRule).to.be.ok;
				expect(userRule).to.be.instanceof(Object);
				expect(Object.keys(userRule)).to.includes('a');

				const secondDepthRule = userRule['a'];
				expect(secondDepthRule).to.be.ok;
				expect(secondDepthRule).to.be.instanceof(Object);
				expect(Object.keys(secondDepthRule)).to.includes('GET');

				const secondDepthFnc = secondDepthRule['GET'];
				expect(secondDepthFnc).to.be.ok;
				expect(secondDepthFnc).to.be.instanceof(Function);
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

				const routeRule = (app as any)._routeRule;

				expect(routeRule).to.be.ok;
				expect(routeRule).to.be.instanceof(Object);

				let targetRuleObj = routeRule;

				uriArr.forEach((uri, i, arr) => {
					expect(Object.keys(targetRuleObj)).to.includes(uri);

					targetRuleObj = targetRuleObj[uri];

					if (i === arr.length - 1) {
						const targetFnc = targetRuleObj['GET'];
						expect(targetFnc).to.be.ok;
						expect(targetFnc).to.be.instanceof(Function);
						expect(targetFnc).to.eql(testFnc);
					}
				});
			});
		});

		describe('with route param', () => {
			describe('colon routing', () => {
				describe('error', () => {
					it('colon in end index', () => {
						return app.route({
								'users/some:id' : {
									'GET' : async () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('colon in middle index', () => {
						return app.route({
								'users/id:some' : {
									'GET' : async () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('same level & multiple colon routing, in same time', () => {
						return app.route({
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
								expect(err).to.be.instanceof(Error);
							});
					});

					it('root level & multiple colon routing, in same time', () => {
						return app.route({
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
								expect(err).to.be.instanceof(Error);
							});
					});

					it('root level & multiple colon routing, in different time', () => {
						return app.route({
								':id' : {
									GET : async () => {
									}
								}
							})
							.then(() => {
								return app.route({
									':name' : {
										GET : async () => {
										}
									}
								});
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('same level & multiple colon routing, in different time', () => {
						return app.route({
								'users' : {
									':id' : {
										'GET' : async () => {
										}
									}
								}
							})
							.then(() => {
								return app.route({
									'users' : {
										':name' : {
											'GET' : async () => {
											}
										}
									}
								});
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('same level & multiple colon routing, in different time, in uri', () => {
						return app.route({
								'users/:id' : {
									'GET' : async () => {
									}
								}
							})
							.then(() => {
								return app.route({
									'users/:name' : {
										'GET' : async () => {
										}
									}
								});
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});
				});

				it('ok - GET', async () => {
					const testId = 'this_is_id';
					let fncRunFlag = false;

					const testFnc = async (param) => {
						expect(param).to.be.ok;
						expect(param).to.be.instanceof(Object);

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
						expect(param).to.be.instanceof(Object);

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
						expect(param).to.be.instanceof(Object);

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
						expect(param).to.be.instanceof(Object);
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

				it('overwrite', async () => {
					let fnc1RunFlag : boolean = false;
					let fnc2RunFlag : boolean = false;


					const fnc1 = () => {
						fnc1RunFlag = true;
					};

					const fnc2 = () => {
						fnc2RunFlag = true;
					};

					await app.route({
						'users' : {
							':id' : {
								'GET' : fnc1
							}
						}
					});

					await app.route({
						'users/:id' : {
							'GET' : fnc2
						}
					});

					await app.listen(port);

					await request(app.getHttpServer())
						.get('/users/123')
						.expect(200);

					expect(fnc1RunFlag).to.be.false;
					expect(fnc2RunFlag).to.be.true;
				});
			});

			// ab?cd - abc, abcd
			describe('question routing', () => {
				describe('error', () => {
					it('start with \'?\'', () => {
						const testUri = '?users';

						return app.route({
								[testUri] : {
									'GET' : () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('duplicated routing - normal uri first with route() in same time', () => {
						const questionUri = 'users?';
						const normalUri = 'user';

						return app.route({
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
								expect(err).to.be.instanceof(Error);
							});
					});

					it('duplicated routing - normal uri first with route()', () => {
						const questionUri = 'users?';
						const normalUri = 'user';

						return app.route({
								[normalUri] : {
									'GET' : () => {
									}
								}
							})
							.then(() => {
								return app.route({
									[questionUri] : {
										'GET' : () => {
										}
									}
								});
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('duplicated routing - normal uri first with get()', () => {
						const questionUri = 'users?';
						const normalUri = 'user';

						return app.get(normalUri, () => {
							})
							.then(() => {
								return app.get(questionUri, () => {
								});
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('duplicated routing - question uri first with route()', () => {
						const questionUri = 'users?';
						const normalUri = 'user';

						return app.route({
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
								expect(err).to.be.instanceof(Error);
							});
					});

					it('duplicated routing - question uri first with get()', () => {
						const questionUri = 'users?';
						const normalUri = 'user';

						return app.get(questionUri, () => {
							})
							.then(() => {
								return app.get(normalUri, () => {
								});
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
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

						const routeRule = (app as any)._routeRule;
						expect(routeRule).to.be.ok;

						expect(routeRule[testUri]).to.be.ok;
						expect(routeRule[testUri]).to.have.property('GET', testFnc);

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

						expect(Object.keys((app as any)._routeRule).length).to.be.eql(2);

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
					it('start with \'+\'', () => {
						return app.route({
								'+abcd' : {
									'GET' : () => {
									}
								}
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('duplicated routing, normal uri first', () => {
						return app.route({
								'abc' : {
									'GET' : () => {
									}
								}
							})
							.then(() => {
								return app.route({
									'ab+c' : {
										'GET' : () => {
										}
									}
								});
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('duplicated routing, plus uri first', () => {
						return app.route({
								'ab+c' : {
									'GET' : () => {
									}
								}
							})
							.then(() => {
								return app.route({
									'abc' : {
										'GET' : () => {
										}
									}
								});
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('duplicated routing, duplicated plus uri', () => {
						return app.route({
								'ab+c' : {
									'GET' : () => {
									}
								}
							})
							.then(() => {
								return app.route({
									'abc+' : {
										'GET' : () => {
										}
									}
								});
							})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
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

			// asterisk routing : ab*cd - abcd, abxcd, abblahcd
			describe('asterisk routing', () => {
				it('normal', async () => {
					const testUri = 'ab*cd';
					let outerCount = 0;

					let testFncRunCount = 0;
					const testFnc = (param) => {
						expect(param).to.be.ok;

						const regExpKey : string = param[testUri].replace('*', '(\\w)*');
						expect(param[testUri]).to.be.ok;
						expect(new RegExp(regExpKey).test(param[testUri])).to.be.true;

						testFncRunCount++;
					};

					await app.route({
						[testUri] : {
							'GET' : testFnc
						}
					});

					await app.listen(port);

					expect(testFncRunCount).to.be.eql(outerCount++);

					await request(app.getHttpServer())
						.get('/abcd')
						.expect(200);

					expect(testFncRunCount).to.be.eql(outerCount++);

					await request(app.getHttpServer())
						.get('/abbcd')
						.expect(200);

					expect(testFncRunCount).to.be.eql(outerCount++);

					await request(app.getHttpServer())
						.get('/abbecd')
						.expect(200);

					expect(testFncRunCount).to.be.eql(outerCount++);

					await request(app.getHttpServer())
						.get('/abbasdflkjsaecd')
						.expect(200);

					expect(testFncRunCount).to.be.eql(outerCount++);
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
					it('no address', () => {
						return app[method]()
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('no function', () => {
						return app[method]('/users')
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
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

					const res = await requestFnc
						.expect(200);

					expect(res).to.be.ok;
					expect(fncRun).to.be.true;

					expect(res.body).to.be.ok;
					expect(res.body).to.be.instanceof(Object);
					expect(res.body.data).to.be.ok;
					expect(res.body.data).to.be.instanceof(Array);
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

					const res = await requestFnc
						.expect(200);

					expect(res).to.be.ok;
					expect(fncRun).to.be.true;

					expect(res.body).to.be.ok;
					expect(res.body).to.be.instanceof(Object);
					expect(res.body.data).to.be.ok;
					expect(res.body.data).to.be.instanceof(Array);
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

					const res = await requestFnc
						.expect(200);

					expect(res).to.be.ok;
					expect(fncRun).to.be.true;

					expect(res.body).to.be.ok;
					expect(res.body).to.be.instanceof(Object);
					expect(res.body.data).to.be.ok;
					expect(res.body.data).to.be.instanceof(Array);
					expect(res.body.data.length).to.be.eql(2);
				});

				it('ok - assign same uri twice', async () => {
					const uri = '/users';

					let beforeFncRunFlag = false;
					let afterFncRunFlag = false;

					const beforeFnc = async () => {
						beforeFncRunFlag = true;
					};
					const afterFnc = async () => {
						afterFncRunFlag = true;
					};

					await app[method](uri, beforeFnc);
					await app[method](uri, afterFnc);

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

					const res = await requestFnc
						.expect(200);

					expect(res).to.be.ok;
					expect(beforeFncRunFlag).to.be.false;
					expect(afterFncRunFlag).to.be.true;
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

					const res1 = await requestFnc1
						.expect(200);

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

					const res2 = await requestFnc2
						.expect(200);

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
				return app.stop()
					.then(fail, (err) => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceof(Error);
					});
			});
		});

		it('ok', async () => {
			await app.listen(port);

			await app.stop();
		});
	});
});