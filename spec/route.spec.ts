import { IncomingMessage } from 'http';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as request from 'supertest';
import { Test as SuperTestExpect } from 'supertest';

import { Badak } from '../src/badak';
import { RouteFunction, RouteRule, RouteRuleSeed, TypedObject } from '../src/interfaces';
import { promiseFail, TestPort } from './test-util';


describe('route()', () => {
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

			it('empty address - \'\'', () => {
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

				await app.listen(TestPort);

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

				await app.listen(TestPort);

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

		const checkRuleFnc = (_app: Badak, targetFnc: () => unknown): void => {
			const routeRules: RouteRule[] = (_app as unknown as TypedObject<RouteRule[]>)._routeRules;
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

			await app.listen(TestPort);

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

			await app.listen(TestPort);

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

			await app.listen(TestPort);

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

			await app.listen(TestPort);

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

			await app.listen(TestPort);

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

			await app.listen(TestPort);

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

			await app.listen(TestPort);

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

			await app.listen(TestPort);

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

			await app.listen(TestPort);

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

			const routeRules: RouteRule[] = (app as unknown as TypedObject<RouteRule[]>)._routeRules;

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

			const routeRules: RouteRule[] = (app as unknown as TypedObject<RouteRule[]>)._routeRules;

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

			await app.listen(TestPort);

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

			const routeRules: RouteRule[] = (app as unknown as TypedObject<RouteRule[]>)._routeRules;

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

			await app.listen(TestPort);

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

			const routeRules: RouteRule[] = (app as unknown as TypedObject<RouteRule[]>)._routeRules;

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

			await app.listen(TestPort);

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

			await app.listen(TestPort);

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

			const routeRules: RouteRule[] = (app as unknown as TypedObject<RouteRule[]>)._routeRules;

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

			await app.listen(TestPort);

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

			const routeRules: RouteRule[] = (app as unknown as TypedObject<RouteRule[]>)._routeRules;

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

			await app.listen(TestPort);

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

			const routeRules: RouteRule[] = (app as unknown as TypedObject<RouteRule[]>)._routeRules;

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

				await app.listen(TestPort);

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

				await app.listen(TestPort);

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

				await app.listen(TestPort);

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

				await app.listen(TestPort);

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

				await app.listen(TestPort);

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

					const testFnc = async (param: TypedObject<string>): Promise<void> => {
						testFncRunFlag = true;

						expect(param).to.be.ok;

						expect(new RegExp(testUri).test(param[testUri])).to.be.true;
					};

					await app.route({
						[testUri]: {
							GET: testFnc
						}
					});

					await app.listen(TestPort);

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

					await app.listen(TestPort);

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

					const appRouteRule: RouteRule[] = (app as unknown as TypedObject<RouteRule[]>)._routeRules;

					expect(appRouteRule).to.be.lengthOf(1);

					expect(userRunCount).to.be.eql(0);
					expect(recordRunCount).to.be.eql(0);

					await app.listen(TestPort);

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

					await app.listen(TestPort);

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

					await app.listen(TestPort);

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
					const testFnc = (param: TypedObject<string>): void => {
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

					await app.listen(TestPort);

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

					await app.listen(TestPort);

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

						await app.listen(TestPort);

						const routeRules: RouteRule[] = (app as unknown as TypedObject<RouteRule[]>)._routeRules;
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

							await app.listen(TestPort);

							const routeRules: RouteRule[] = (app as unknown as TypedObject<RouteRule[]>)._routeRules;
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

							await app.listen(TestPort);

							const routeRules: RouteRule[] = (app as unknown as TypedObject<RouteRule[]>)._routeRules;
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

				const testFnc = (param: TypedObject<string>, req: IncomingMessage): void => {
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

						await app.listen(TestPort);

						const routeRules: RouteRule[] = (app as unknown as TypedObject<RouteRule[]>)._routeRules;
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