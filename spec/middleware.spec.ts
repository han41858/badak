import 'mocha';

import { expect } from 'chai';
import * as request from 'supertest';

import { Badak } from '../src';

const fail = async () => {
	throw new Error('this should be not execute');
};

const port = 65030;

describe('middleware', () => {
	let app = null; // no type for test

	beforeEach(() => {
		app = new Badak;
	});

	afterEach(() => {
		return app.isRunning() ?
			app.stop() :
			Promise.resolve();
	});

	describe('auth()', () => {
		describe('error', () => {
			it('no auth param', () => {
				return app.auth()
					.then(fail, (err) => {
						expect(err).to.be.ok;
						expect(err).to.be.instanceof(Error);
					});
			});
		});

		describe('assign', () => {
			it('normal function', () => {
				return app.auth(() => {
				});
			});

			it('async function', async () => {
				let runFlag = false;

				await app.auth(async () => {
					runFlag = true;
				});

				// not execute yet
				expect(runFlag).to.be.false;
			});
		});

		describe('run', () => {
			describe('with headers', () => {
				const authFnc = (req) => {
					if (!req.headers['auth']) {
						throw new Error('auth failed');
					}
				};

				it('with auth ok', async () => {
					await app.auth(authFnc);

					await app.route({
						'/test' : {
							'GET' : () => {
								// dummy function
							}
						}
					});

					await app.listen(port);

					await request(app.getHttpServer())
						.get('/test')
						.set('auth', 'ok')
						.expect(200);
				});

				it('with auth failed', async () => {
					await app.auth(authFnc);

					await app.route({
						'/test' : {
							'GET' : () => {
								// dummy function
							}
						}
					});

					await app.listen(port);

					await request(app.getHttpServer())
						.get('/test')
						.expect(401);
				});
			});
		});
	});

	describe('before() & after()', () => {
		const targetFncNames : string[] = ['before', 'after'];
		const targetArrNames : string[] = ['_middlewaresBefore', '_middlewaresAfter'];

		targetFncNames.forEach((fncName, i) => {
			describe(`common - ${ fncName }`, () => {
				it('defined', () => {
					expect(app[fncName]).to.be.ok;
					expect(app[fncName]).to.be.instanceof(Function);
				});

				describe('error', () => {
					it('no parameter', () => {
						return app[fncName](undefined)
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('invalid parameter - null', () => {
						return app[fncName](null)
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('invalid parameter - string', () => {
						return app[fncName]('hello')
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('invalid parameter - number', () => {
						return app[fncName](123)
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});

					it('after listen()', async () => {
						// no route rule
						await app.listen(port);

						return app[fncName](() => {
						})
							.then(fail, err => {
								expect(err).to.be.ok;
								expect(err).to.be.instanceof(Error);
							});
					});
				});

				describe('assign', () => {
					it('normal function', async () => {
						const beforeArrLength : number = app[targetArrNames[i]].length;

						await app[fncName](() => {
						});

						const afterArrLength : number = app[targetArrNames[i]].length;

						expect(afterArrLength).to.be.eql(beforeArrLength + 1);
					});

					it('async function', async () => {
						const beforeArrLength : number = app[targetArrNames[i]].length;

						await app[fncName](async () => {
						});

						const afterArrLength : number = app[targetArrNames[i]].length;

						expect(afterArrLength).to.be.eql(beforeArrLength + 1);
					});
				});
			});
		});

		describe('run test', () => {
			let beforeFncRunFlag : boolean = false;
			let routeFncRunFlag : boolean = false;
			let afterFncRunFlag : boolean = false;

			beforeEach(async () => {
				beforeFncRunFlag = false;
				routeFncRunFlag = false;
				afterFncRunFlag = false;
			});

			it('normal functions', async () => {
				const beforeFnc : Function = () => {
					beforeFncRunFlag = true;
				};

				const afterFnc : Function = () => {
					afterFncRunFlag = true;
				};

				await app.before(beforeFnc);
				await app.after(afterFnc);

				await app.route({
					test : {
						GET : () => {
							routeFncRunFlag = true;
						}
					}
				});

				await app.listen(port);

				expect(beforeFncRunFlag).to.be.false;
				expect(routeFncRunFlag).to.be.false;
				expect(afterFncRunFlag).to.be.false;

				await request(app.getHttpServer())
					.get('/test')
					.expect(200);

				expect(beforeFncRunFlag).to.be.true;
				expect(routeFncRunFlag).to.be.true;
				expect(afterFncRunFlag).to.be.true;
			});

			it('async functions', async () => {
				const beforeFnc : Function = async () => {
					beforeFncRunFlag = true;
				};

				const afterFnc : Function = async () => {
					afterFncRunFlag = true;
				};

				await app.before(beforeFnc);
				await app.after(afterFnc);

				await app.route({
					test : {
						GET : async () => {
							routeFncRunFlag = true;
						}
					}
				});

				await app.listen(port);

				expect(beforeFncRunFlag).to.be.false;
				expect(routeFncRunFlag).to.be.false;
				expect(afterFncRunFlag).to.be.false;

				await request(app.getHttpServer())
					.get('/test')
					.expect(200);

				expect(beforeFncRunFlag).to.be.true;
				expect(routeFncRunFlag).to.be.true;
				expect(afterFncRunFlag).to.be.true;
			});

			it('with param', async () => {
				const beforeFnc : Function = async (req, res) => {
					expect(req).to.be.ok;
					expect(res).to.be.ok;
				};

				const routeFnc : Function = async (param) => {
					expect(param).to.be.ok;
					expect(param).to.have.property('initial');
					expect(param).to.not.have.property('before'); // param is not modified

					const newParam = { ...param };

					newParam['route'] = true;

					return newParam;
				};

				const afterFnc : Function = async (req, res) => {
					expect(req).to.be.ok;
					expect(res).to.be.ok;
				};

				await app.before(beforeFnc);
				await app.after(afterFnc);

				await app.route({
					test : {
						POST : routeFnc
					}
				});

				await app.listen(port);

				await request(app.getHttpServer())
					.post('/test')
					// send initial object
					.send({
						initial : true
					})
					.expect(200);
			});

			it('with internal failed response', async () => {
				const beforeFnc : Function = () => {
					beforeFncRunFlag = true;
				};

				const afterFnc : Function = () => {
					afterFncRunFlag = true;
				};

				await app.before(beforeFnc);
				await app.after(afterFnc);

				// no rule

				await app.listen(port);

				expect(beforeFncRunFlag).to.be.false;
				expect(afterFncRunFlag).to.be.false;

				await request(app.getHttpServer())
					.get('/test')
					.expect(404);

				expect(beforeFncRunFlag).to.be.true;
				expect(afterFncRunFlag).to.be.true;
			});

			it('with function failed response', async () => {
				const beforeFnc : Function = () => {
					beforeFncRunFlag = true;
				};

				const afterFnc : Function = () => {
					afterFncRunFlag = true;
				};

				await app.before(beforeFnc);
				await app.after(afterFnc);

				await app.route({
					test : {
						GET : () => {
							routeFncRunFlag = true;
							throw new Error('dev error');
						}
					}
				});

				await app.listen(port);

				expect(beforeFncRunFlag).to.be.false;
				expect(routeFncRunFlag).to.be.false;
				expect(afterFncRunFlag).to.be.false;

				await request(app.getHttpServer())
					.get('/test')
					.expect(500);

				expect(beforeFncRunFlag).to.be.true;
				expect(routeFncRunFlag).to.be.true;
				expect(afterFncRunFlag).to.be.true;
			});

			it('beforeFnc throw error, bug response is ok', async () => {
				await app.before(() => {
					throw new Error('dev error in before function');
				});

				await app.route({
					test : {
						GET : () => {
						}
					}
				});

				await app.listen(port);

				await request(app.getHttpServer())
					.get('/test')
					.expect(200);
			});
		});
	});
});