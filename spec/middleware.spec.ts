import { IncomingMessage, ServerResponse } from 'http';

import { beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { MiddlewareFunction, RouteFunction, TypedObject } from '../src/interfaces';
import { emptyAsyncFnc, emptyFnc, promiseFail } from './test-util';


const port = 65030;

describe('middleware', () => {
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

	describe('auth()', () => {
		describe('error', () => {
			it('no auth param', () => {
				return promiseFail(
					app.auth(undefined as unknown as MiddlewareFunction)
				);
			});
		});

		describe('assign', () => {
			it('normal function', async () => {
				await app.auth(emptyFnc);
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
			describe('with headers', (): void => {
				const authFnc = (req: IncomingMessage): void => {
					if (!req.headers['auth']) {
						throw new Error('auth failed');
					}
				};

				it('with auth ok', async () => {
					await app.auth(authFnc);

					await app.route({
						'/test': {
							'GET': emptyFnc
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
						'/test': {
							'GET': emptyFnc
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
		const targetFncNames: (keyof Badak)[] = ['before', 'after'];
		const targetArrNames: string[] = ['_middlewaresBefore', '_middlewaresAfter'];

		targetFncNames.forEach((fncName: keyof Badak, i: number): void => {
			describe(`common - ${ fncName }`, () => {
				it('defined', () => {
					expect(app[fncName]).to.be.a('function');
					expect(typeof app[fncName]).to.be.eql('function');
				});

				describe('error', () => {
					it('no parameter', () => {
						return promiseFail(
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(app as any)[fncName](undefined as unknown as MiddlewareFunction)
						);
					});

					it('invalid parameter - null', () => {
						return promiseFail(
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(app as any)[fncName](null as unknown as MiddlewareFunction)
						);
					});

					it('invalid parameter - string', () => {
						return promiseFail(
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(app as any)[fncName]('hello' as unknown as MiddlewareFunction)
						);
					});

					it('invalid parameter - number', async () => {
						return promiseFail(
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(app as any)[fncName](123 as unknown as MiddlewareFunction)
						);
					});

					it('after listen()', async () => {
						// no route rule
						await app.listen(port);

						await promiseFail(
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(app as any)[fncName](emptyFnc)
						);
					});
				});

				describe('assign', () => {
					it('normal function', async () => {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const middlewareArr: MiddlewareFunction[] = (app as any)[targetArrNames[i]] as MiddlewareFunction[];

						const beforeArrLength: number = middlewareArr.length;

						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						await (app as any)[fncName](emptyFnc);

						const afterArrLength: number = middlewareArr.length;

						expect(afterArrLength).to.be.eql(beforeArrLength + 1);
					});

					it('async function', async () => {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const middlewareArr: MiddlewareFunction[] = (app as any)[targetArrNames[i]] as MiddlewareFunction[];

						const beforeArrLength: number = middlewareArr.length;

						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						await (app as any)[fncName](emptyAsyncFnc);

						const afterArrLength: number = middlewareArr.length;

						expect(afterArrLength).to.be.eql(beforeArrLength + 1);
					});
				});
			});
		});

		describe('run test', () => {
			let beforeFncRunFlag: boolean = false;
			let routeFncRunFlag: boolean = false;
			let afterFncRunFlag: boolean = false;

			beforeEach(async () => {
				beforeFncRunFlag = false;
				routeFncRunFlag = false;
				afterFncRunFlag = false;
			});

			it('normal functions', async () => {
				const beforeFnc: MiddlewareFunction = () => {
					beforeFncRunFlag = true;
				};

				const afterFnc: MiddlewareFunction = () => {
					afterFncRunFlag = true;
				};

				await app.before(beforeFnc);
				await app.after(afterFnc);

				await app.route({
					test: {
						GET: () => {
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
				const beforeFnc: MiddlewareFunction = async () => {
					beforeFncRunFlag = true;
				};

				const afterFnc: MiddlewareFunction = async () => {
					afterFncRunFlag = true;
				};

				await app.before(beforeFnc);
				await app.after(afterFnc);

				await app.route({
					test: {
						GET: async () => {
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
				const beforeFnc: MiddlewareFunction = async (req: IncomingMessage, res: ServerResponse) => {
					expect(req).to.be.a('object');
					expect(res).to.be.a('object');
				};

				const routeFnc: RouteFunction = async (param: TypedObject<unknown>): Promise<unknown> => {
					expect(param).to.be.a('object');
					expect(param).to.have.property('initial');
					expect(param).to.not.have.property('before'); // param is not modified

					const newParam = { ...param };

					newParam['route'] = true;

					return newParam;
				};

				const afterFnc: MiddlewareFunction = async (req: IncomingMessage, res: ServerResponse) => {
					expect(req).to.be.a('object');
					expect(res).to.be.a('object');
				};

				await app.before(beforeFnc);
				await app.after(afterFnc);

				await app.route({
					test: {
						POST: routeFnc
					}
				});

				await app.listen(port);

				await request(app.getHttpServer())
					.post('/test')
					// send initial object
					.send({
						initial: true
					})
					.expect(200);
			});

			it('with internal failed response', async () => {
				const beforeFnc: MiddlewareFunction = () => {
					beforeFncRunFlag = true;
				};

				const afterFnc: MiddlewareFunction = () => {
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
				const beforeFnc: MiddlewareFunction = () => {
					beforeFncRunFlag = true;
				};

				const afterFnc: MiddlewareFunction = (req, res, responseBody) => {
					afterFncRunFlag = true;

					expect(responseBody).to.be.a('string');
					expect(responseBody).to.be.eql('dev error');
				};

				await app.before(beforeFnc);
				await app.after(afterFnc);

				await app.route({
					test: {
						GET: () => {
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
					test: {
						GET: emptyFnc
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
