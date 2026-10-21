import { afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { createApp } from '../sample/app';
import { TestPort } from './test-util';


// the example app in sample/ works as documented
describe('sample app', () => {
	let app: Badak;
	let logs: string[];

	const token: string = 'test-token';
	const auth: string = `Bearer ${ token }`;

	beforeEach(async () => {
		logs = [];

		app = await createApp({
			token,
			log: (line: string): void => {
				logs.push(line);
			}
		});

		await app.listen(TestPort);
	});

	afterEach(() => {
		return app.isRunning()
			? app.stop(0)
			: Promise.resolve();
	});

	it('public route without a token', async () => {
		await request(app.getHttpServer())
			.get('/api/health')
			.expect(200, { status: 'ok' });
	});

	it('API without a token : 401 with WWW-Authenticate', async () => {
		await request(app.getHttpServer())
			.get('/api/users')
			.expect(401)
			.expect('www-authenticate', 'Bearer');
	});

	it('create, read, list and delete users', async () => {
		const server = app.getHttpServer();

		await request(server)
			.post('/api/users')
			.set('Authorization', auth)
			.send({ name: ' han ' })
			.expect(201, { id: '1', name: 'han' })
			.expect('location', '/api/users/1');

		await request(server)
			.post('/api/users')
			.set('Authorization', auth)
			.send({ name: 'kim' })
			.expect(201, { id: '2', name: 'kim' });

		await request(server)
			.get('/api/users/1')
			.set('Authorization', auth)
			.expect(200, { id: '1', name: 'han' });

		await request(server)
			.get('/api/users?name=kim')
			.set('Authorization', auth)
			.expect(200, [{ id: '2', name: 'kim' }]);

		await request(server)
			.get('/api/users?name=kim&name=han')
			.set('Authorization', auth)
			.expect(200, [{ id: '1', name: 'han' }, { id: '2', name: 'kim' }]);

		await request(server)
			.delete('/api/users/1')
			.set('Authorization', auth)
			.expect(204, '');

		await request(server)
			.get('/api/users/1')
			.set('Authorization', auth)
			.expect(404, { message: 'user 1 not found' });
	});

	it('invalid body : 400', async () => {
		await request(app.getHttpServer())
			.post('/api/users')
			.set('Authorization', auth)
			.send({ name: 1 })
			.expect(400, { message: 'name is required' });

		await request(app.getHttpServer())
			.post('/api/users')
			.set('Authorization', auth)
			.send([{ name: 'han' }])
			.expect(400);
	});

	it('file upload', async () => {
		await request(app.getHttpServer())
			.post('/api/files')
			.set('Authorization', auth)
			.field('name', 'logo')
			.attach('file', Buffer.alloc(64 * 1024, 1), { filename: 'logo.png', contentType: 'image/png' })
			.expect(200, { name: 'logo', size: 64 * 1024 });
	});

	it('file upload without a token : 401 before receiving the body', async () => {
		await request(app.getHttpServer())
			.post('/api/files')
			.attach('file', Buffer.alloc(1024), { filename: 'a.bin', contentType: 'application/octet-stream' })
			.expect(401);
	});

	it('CSV download stream', async () => {
		await request(app.getHttpServer())
			.post('/api/users')
			.set('Authorization', auth)
			.send({ name: 'han' })
			.expect(201);

		await request(app.getHttpServer())
			.get('/api/users.csv')
			.set('Authorization', auth)
			.expect(200, 'id,name\n1,han\n')
			.expect('content-type', 'text/csv; charset=utf-8');
	});

	it('SPA : static files, and index.html for client routes', async () => {
		await request(app.getHttpServer())
			.get('/app.css')
			.expect(200)
			.expect('content-type', 'text/css; charset=utf-8');

		const index = await request(app.getHttpServer())
			.get('/')
			.expect(200)
			.expect('content-type', 'text/html; charset=utf-8');

		await request(app.getHttpServer())
			.get('/users/1/edit')
			.expect(200, index.text);
	});

	it('access log by after()', async () => {
		await request(app.getHttpServer())
			.get('/api/health')
			.expect(200);

		await request(app.getHttpServer())
			.get('/api/users')
			.expect(401);

		expect(logs).to.be.eql(['GET /api/health 200', 'GET /api/users 401']);
	});
});
