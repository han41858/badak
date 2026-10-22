import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { ParamContext, RouteRule } from '../src/interfaces';
import { TestPort } from './test-util';


// static file routes are registered at once in listen() : docs/routing-spec-5.0.0.md 7.
describe('static file routes in listen() (5.0.0)', () => {
	let app: Badak;
	let unhandled: unknown[];
	let savedListeners: NodeJS.UnhandledRejectionListener[] = [];

	const publicDir: string = path.join(__dirname, 'static', 'public');

	const onUnhandledRejection = (reason: unknown): void => {
		unhandled.push(reason);
	};

	const internals = (): { routeRule: RouteRule, staticCache: unknown[] } => {
		const target = app as unknown as { _routeRule: RouteRule, _staticCache: unknown[] };

		return { routeRule: target._routeRule, staticCache: target._staticCache };
	};

	const listenError = async (): Promise<Error | undefined> => {
		try {
			await app.listen(TestPort);
		}
		catch (e) {
			return e as Error;
		}

		return undefined;
	};

	beforeEach(() => {
		app = new Badak({ catchErrorLog: false });
		unhandled = [];

		// keep mocha's handler away, unhandled rejections are checked by the tests
		savedListeners = process.listeners('unhandledRejection');
		process.removeAllListeners('unhandledRejection');
		process.on('unhandledRejection', onUnhandledRejection);
	});

	afterEach(async () => {
		process.off('unhandledRejection', onUnhandledRejection);
		savedListeners.forEach((listener: NodeJS.UnhandledRejectionListener): void => {
			process.on('unhandledRejection', listener);
		});

		if (app.isRunning()) {
			await app.stop(0);
		}
	});

	it('a static file conflicting with a route : listen() rejects, nothing is changed', async () => {
		await app.get('/:slug', ({ params }: ParamContext): unknown => params);
		await app.static('/', publicDir);

		const before: string = JSON.stringify(internals().routeRule);
		const error: Error | undefined = await listenError();

		expect(error?.message).to.include('Conflicting routes for GET:\n  /:slug\n  /');
		expect(error?.message).to.include(`static files :\n  / : ${ publicDir }`);

		expect(app.isRunning()).to.be.false;
		expect(JSON.stringify(internals().routeRule)).to.be.eql(before);
		expect(internals().staticCache).to.be.eql([]);

		// the same result again, no partially registered file routes
		const again: Error | undefined = await listenError();

		expect(again?.message).to.include('Conflicting routes for GET');
		expect(JSON.stringify(internals().routeRule)).to.be.eql(before);

		await new Promise((resolve): void => {
			setTimeout(resolve, 20);
		});

		expect(unhandled).to.be.eql([]);
	});

	it('a route not conflicting with static files : served together', async () => {
		await app.get('/api/:id', ({ params }: ParamContext): unknown => params);
		await app.static('/', publicDir);
		await app.listen(TestPort);

		await request(app.getHttpServer()).get('/style.css').expect(200).expect('content-type', 'text/css; charset=utf-8');
		await request(app.getHttpServer()).get('/api/7').expect(200, { id: '7' });
	});

	it('SPA : static files, routes and the fallback', async () => {
		await app.get('/api/users', (): string => 'users');
		await app.setSPARoot('/', publicDir);
		await app.listen(TestPort);

		const index = await request(app.getHttpServer()).get('/').expect(200);

		await request(app.getHttpServer()).get('/style.css').expect(200).expect('content-type', 'text/css; charset=utf-8');
		await request(app.getHttpServer()).get('/api/users').expect(200, 'users');
		await request(app.getHttpServer()).get('/client/route').expect(200, index.text);
	});

	describe('listen() after stop() with changed static files', () => {
		let dir: string;

		const write = (name: string, content: string): void => {
			fs.writeFileSync(path.join(dir, name), content);
		};

		beforeEach(() => {
			dir = fs.mkdtempSync(path.join(os.tmpdir(), 'badak-static-routes-'));

			write('a.txt', 'A');
			write('b.txt', 'B');
		});

		afterEach(() => {
			fs.rmSync(dir, { recursive: true, force: true });
		});

		it('a deleted file is not served, changed and added files are served', async () => {
			await app.static('/s', dir);
			await app.listen(TestPort);

			await request(app.getHttpServer()).get('/s/b.txt').expect(200, 'B');
			await app.stop(0);

			fs.rmSync(path.join(dir, 'b.txt'));
			write('a.txt', 'A2');
			write('c.txt', 'C');

			await app.listen(TestPort);

			await request(app.getHttpServer()).get('/s/b.txt').expect(404);
			await request(app.getHttpServer()).get('/s/a.txt').expect(200, 'A2');
			await request(app.getHttpServer()).get('/s/c.txt').expect(200, 'C');

			// the node of the deleted file is removed
			expect(Object.keys((internals().routeRule['/'] as RouteRule)['s'] as RouteRule).sort()).to.be.eql(['a.txt', 'c.txt']);
		});

		it('an added file conflicting with a route : listen() rejects, the previous routes and cache are kept', async () => {
			await app.get('/s/c*', (): string => 'route');
			await app.static('/s', dir);
			await app.listen(TestPort);
			await app.stop(0);

			const routes: string = JSON.stringify(internals().routeRule);
			const cache: unknown[] = internals().staticCache;

			write('c.txt', 'C');

			const error: Error | undefined = await listenError();

			expect(error?.message).to.include('Conflicting routes for GET:\n  /s/c*\n  /s/c.txt');
			expect(JSON.stringify(internals().routeRule)).to.be.eql(routes);
			expect(internals().staticCache).to.be.equal(cache);

			// fixed : listen() works again
			fs.rmSync(path.join(dir, 'c.txt'));

			await app.listen(TestPort);

			await request(app.getHttpServer()).get('/s/a.txt').expect(200, 'A');
			await request(app.getHttpServer()).get('/s/cx').expect(200, 'route');
		});

		it('a route registered by the user is not removed with the static routes', async () => {
			await app.static('/s', dir);
			await app.listen(TestPort);
			await app.get('/s/api/:id', ({ params }: ParamContext): unknown => params);
			await app.stop(0);

			await app.listen(TestPort);

			await request(app.getHttpServer()).get('/s/api/7').expect(200, { id: '7' });
			await request(app.getHttpServer()).get('/s/a.txt').expect(200, 'A');
		});
	});

	it('listen() after stop() : the files are loaded again, not duplicated', async () => {
		await app.static('/', publicDir);
		await app.listen(TestPort);

		const cacheLength: number = internals().staticCache.length;
		const routes: string = JSON.stringify(Object.keys(internals().routeRule['/'] as RouteRule));

		await app.stop(0);
		await app.listen(TestPort);

		expect(internals().staticCache.length).to.be.eql(cacheLength);
		expect(JSON.stringify(Object.keys(internals().routeRule['/'] as RouteRule))).to.be.eql(routes);

		await request(app.getHttpServer()).get('/style.css').expect(200);
	});
});
