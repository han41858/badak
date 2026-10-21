import { IncomingMessage, ServerResponse } from 'http';

import { beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { ParamContext } from '../src/interfaces';
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

				const routeFnc: RouteFunction = async (ctx: ParamContext): Promise<unknown> => {
					const param = ctx.query as TypedObject<unknown>;
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
					expect(responseBody).to.be.eql('Internal Server Error');
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

			describe('beforeFnc throw error, route function is not executed', () => {
				let throwTestRouteRunFlag: boolean = false;
				let afterResponseBody: unknown;

				beforeEach(async () => {
					throwTestRouteRunFlag = false;
					afterResponseBody = undefined;

					await app.after((req: IncomingMessage, res: ServerResponse, responseBody?: unknown): void => {
						afterResponseBody = responseBody;
					});

					await app.route({
						test: {
							GET: () => {
								throwTestRouteRunFlag = true;
								return 'route';
							}
						}
					});
				});

				it('Error responds 500', async () => {
					await app.before(() => {
						throw new Error('dev error in before function');
					});

					await app.listen(port);

					const res = await request(app.getHttpServer())
						.get('/test')
						.expect(500);

					expect(res.text).to.be.eql('Internal Server Error');
					expect(throwTestRouteRunFlag).to.be.false;

					// after() still runs
					expect(afterResponseBody).to.be.eql('Internal Server Error');
				});

				it('async rejection responds 500', async () => {
					await app.before(async (): Promise<void> => {
						throw new Error('dev error in async before function');
					});

					await app.listen(port);

					await request(app.getHttpServer())
						.get('/test')
						.expect(500);

					expect(throwTestRouteRunFlag).to.be.false;
				});

				[
					['Unauthorized', 401],
					['Forbidden', 403]
				].forEach(([message, code]: (string | number)[]): void => {
					it(`Error('${ message }') responds ${ code }`, async () => {
						await app.before(() => {
							throw new Error(message as string);
						});

						await app.listen(port);

						await request(app.getHttpServer())
							.get('/test')
							.expect(code as number);

						expect(throwTestRouteRunFlag).to.be.false;
					});
				});

				it('one of multiple before() throws', async () => {
					let otherBeforeRunFlag: boolean = false;

					await app.before(() => {
						otherBeforeRunFlag = true;
					});

					await app.before(() => {
						throw new Error('Forbidden');
					});

					await app.listen(port);

					await request(app.getHttpServer())
						.get('/test')
						.expect(403);

					expect(otherBeforeRunFlag).to.be.true;
					expect(throwTestRouteRunFlag).to.be.false;
				});
			});
		});
	});

	describe('response already sent', () => {
		let unhandledCount: number = 0;
		let routeFncRunFlag: boolean = false;
		let afterFncRunFlag: boolean = false;

		const onUnhandled = (): void => {
			++unhandledCount;
		};

		beforeEach(async () => {
			unhandledCount = 0;
			routeFncRunFlag = false;
			afterFncRunFlag = false;

			process.on('unhandledRejection', onUnhandled);

			await app.after(() => {
				afterFncRunFlag = true;
			});

			await app.get('/alive', (): string => 'alive');
		});

		afterEach(async () => {
			// server should be still alive
			await request(app.getHttpServer())
				.get('/alive')
				.expect(200, 'alive');

			// let pending rejections be reported
			await new Promise((resolve) => setImmediate(resolve));

			process.off('unhandledRejection', onUnhandled);

			expect(unhandledCount).to.be.eql(0);
		});

		it('before() responds by itself, route function is skipped', async () => {
			await app.before((req: IncomingMessage, res: ServerResponse): void => {
				if (req.url === '/blocked') {
					res.statusCode = 429;
					res.end('blocked');
				}
			});

			await app.get('/blocked', (): string => {
				routeFncRunFlag = true;
				return 'route';
			});

			await app.listen(port);

			await request(app.getHttpServer())
				.get('/blocked')
				.expect(429, 'blocked');

			expect(routeFncRunFlag).to.be.false;
			expect(afterFncRunFlag).to.be.true;
		});

		it('auth() responds by itself, route function is skipped', async () => {
			await app.auth((req: IncomingMessage, res: ServerResponse): void => {
				if (req.url === '/private') {
					res.statusCode = 401;
					res.end('need login');
				}
			});

			await app.get('/private', (): string => {
				routeFncRunFlag = true;
				return 'route';
			});

			await app.listen(port);

			await request(app.getHttpServer())
				.get('/private')
				.expect(401, 'need login');

			expect(routeFncRunFlag).to.be.false;
		});

		it('route function ends response and returns value', async () => {
			await app.get('/manual', (ctx: ParamContext, req: IncomingMessage, res: ServerResponse): string => {

				res.end('manual');
				return 'ignored';
			});

			await app.listen(port);

			await request(app.getHttpServer())
				.get('/manual')
				.expect(200, 'manual');
		});

		it('route function ends response and throws', async () => {
			await app.get('/manual', (ctx: ParamContext, req: IncomingMessage, res: ServerResponse): never => {

				res.statusCode = 202;
				res.end('done');
				throw new Error('after response');
			});

			await app.listen(port);

			await request(app.getHttpServer())
				.get('/manual')
				.expect(202, 'done');
		});

		it('route function starts response and returns value, ending is left to route function', async () => {
			await app.get('/stream', (ctx: ParamContext, req: IncomingMessage, res: ServerResponse): string => {

				res.writeHead(200, { 'Content-Type': 'text/plain' });
				res.write('partial');

				// streaming, end later
				setTimeout((): void => {
					res.end('-end');
				}, 20);

				return 'ignored';
			});

			await app.listen(port);

			await request(app.getHttpServer())
				.get('/stream')
				.expect(200, 'partial-end');
		});

		it('route function sends headers and throws', async () => {
			await app.get('/partial', (ctx: ParamContext, req: IncomingMessage, res: ServerResponse): never => {

				res.writeHead(200, { 'Content-Type': 'text/plain' });
				res.write('partial');
				throw new Error('in the middle of response');
			});

			await app.listen(port);

			await request(app.getHttpServer())
				.get('/partial')
				.expect(200, 'partial');
		});
	});
});
