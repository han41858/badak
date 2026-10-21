import { afterEach, beforeEach } from 'mocha';
import { agent as request } from 'supertest';

import { Badak } from '../src/badak';
import { ParamContext } from '../src/interfaces';
import { TestPort } from './test-util';

describe('ParamContext', () => {
  let app: Badak;

  beforeEach(() => {
    app = new Badak({ catchErrorLog: false });
  });

  afterEach(() => app.isRunning() ? app.stop() : Promise.resolve());

  it('separates colliding params, query and body', async () => {
    await app.patch('/users/:id', (ctx: ParamContext): ParamContext => ctx);
    await app.listen(TestPort);

    await request(app.getHttpServer())
      .patch('/users/7?id=8')
      .send({ id: 9, name: 'Leo' })
      .expect(200, {
        params: { id: '7' },
        query: { id: '8' },
        body: { id: 9, name: 'Leo' }
      });
  });

  it('always supplies params and query as objects, body absent as undefined', async () => {
    await app.get('/health', (ctx: ParamContext): unknown => ({
      params: ctx.params,
      query: ctx.query,
      hasBody: ctx.body !== undefined
    }));
    await app.listen(TestPort);

    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { params: {}, query: {}, hasBody: false });
  });

  it('converts query and body, but not route params', async () => {
    await app.config('parseNumber', true);
    await app.post('/users/:id', (ctx: ParamContext): ParamContext => ctx);
    await app.listen(TestPort);

    await request(app.getHttpServer())
      .post('/users/7?count=8')
      .send({ count: '9' })
      .expect(200, {
        params: { id: '7' },
        query: { count: 8 },
        body: { count: 9 }
      });
  });

  it('preserves JSON primitive and array body', async () => {
    await app.post('/data', (ctx: ParamContext): unknown => ctx.body);
    await app.listen(TestPort);

    await request(app.getHttpServer())
      .post('/data')
      .set('Content-Type', 'application/json')
      .send('[1,"two"]')
      .expect(200, [1, 'two']);
  });

  it('separates wildcard params from query', async () => {
    await app.get('/files/**', (ctx: ParamContext): ParamContext => ctx);
    await app.listen(TestPort);

    await request(app.getHttpServer())
      .get('/files/a/b?sort=desc')
      .expect(200, {
        params: { '**': 'a/b' },
        query: { sort: 'desc' }
      });
  });
});
