import { Badak, ParamContext, RouteFunction, RouteRule } from '../../src/index.js';

interface User {
	name: string;
	age: number;
}

interface IdParams {
	id: string;
}

interface PageQuery {
	page?: number;
}

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type DefaultContext = ParamContext;
type _DefaultParams = Assert<Equal<DefaultContext['params'], Record<string, string>>>;
type _DefaultQuery = Assert<Equal<DefaultContext['query'], Record<string, unknown>>>;
type _DefaultBody = Assert<Equal<DefaultContext['body'], unknown>>;
type TypedContext = ParamContext<{ params: IdParams; query: PageQuery; body: User }>;
type _TypedParams = Assert<Equal<TypedContext['params'], IdParams>>;
type _TypedQuery = Assert<Equal<TypedContext['query'], PageQuery>>;
type _TypedBody = Assert<Equal<TypedContext['body'], User>>;

const app = new Badak();

void app.post<{ body: User }>('/users', ({ body }) => body.name);
void app.patch<{ params: IdParams; body: User }>('/users/:id', ({ params, body }) => params.id + body.name);
void app.get<{ params: IdParams; query: PageQuery }>('/u/:id', ({ params, query }) => params.id + String(query.page));
void app.put<{ body: User }>('/u', ({ body }) => body.age);
void app.delete<{ params: IdParams }>('/u/:id', ({ params }) => params.id);

const handler: RouteFunction<{ body: User }> = ({ body }) => body.name;
const nestedRule: RouteRule = {
	'/users': {
		POST: handler,
		'/by-id/:id': {
			GET: ({ params }) => params.id
		}
	}
};
void app.route(nestedRule);
void app.route({ '/users': { POST: { fnc: handler, option: { auth: false } } } });

// A declared TypeScript type is not runtime validation.
// @ts-expect-error: the body is unknown by default
void app.post('/unknown', ({ body }) => body.name);
// @ts-expect-error: typo in the type key must not silently add an arbitrary property
void app.post<{ bdy: User }>('/typo', ({ body }) => body);
// @ts-expect-error: route captures must remain string-valued
void app.get<{ params: number }>('/wrong', ({ params }) => params);
// @ts-expect-error: declared type must be consistent with the callback
void app.post<{ body: User }>('/wrong-handler', (ctx: ParamContext<{ body: number }>) => ctx.body);
