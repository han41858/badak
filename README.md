![npm](https://img.shields.io/npm/v/badak?logo=npm)
![NPM Last Update](https://img.shields.io/npm/last-update/badak)

![logo](https://github.com/han41858/badak/raw/main/docs/logo/badak_200.png)

[한국어](https://github.com/han41858/badak/blob/main/README-KR.md)

# badak

![TypeScript](https://img.shields.io/badge/TypeScript-black?color=3178C6&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/node.js-black?color=5FA04E&logo=nodedotjs&logoColor=white)

badak is a backend framework developed based on Promises and TypeScript.

> badak is written in TypeScript and is compiled and distributed as JavaScript code.
> So, it can be used in TypeScript syntax or JavaScript syntax.

## Install

badak is distributed with npm and can be installed with npm/yarn.

```bash
npm install badak
# or
yarn add badak
```

## Usage

```typescript
import { Badak, HttpError } from 'badak';

interface User {
	id: string;
	name: string;
}

const users: Map<string, User> = new Map();
const app: Badak = new Badak();

// returned values are the response : object -> JSON, string -> text
await app.get('/users', () => [...users.values()]);

// typed route captures, e.g. GET /users/7 -> params.id === '7'
await app.get<{ params: { id: string } }>('/users/:id', ({ params }) => {
	const user: User | undefined = users.get(params.id);

	if (user === undefined) {
		throw new HttpError(404);
	}

	return user;
});

// the request body is parsed for POST, PUT and PATCH (JSON, form, multipart)
// it is not validated, check it before use
await app.post('/users', ({ body }) => {
	const name: unknown = (body as { name?: unknown } | undefined)?.name;

	if (typeof name !== 'string') {
		throw new HttpError(400, { body: { message: 'name is required' } });
	}

	const user: User = { id: String(users.size + 1), name };
	users.set(user.id, user);

	return user;
});

await app.listen(3000);
```

Routing functions receive `ctx` (`{ params, query, body }`), and the Node.js `req` and `res`, see [Routing parameters](#routing-parameters).
See [Examples](#examples) for authentication, file upload, streaming and SPA.

## Methods

### `new Badak(option?: Partial<BadakOption>)`

Create a badak instance. You can pass options to the constructor.

```typescript
const app: Badak = new Badak();

const appWithLog: Badak = new Badak({
	catchErrorLog: true
});
```

### `auth(fnc: MiddlewareFunction): Promise<void>`

Set a middleware function for authentication. Only one authentication function can be specified.
The registered function is executed after `before()`, and before the request body is received and the routing function is executed.
So an unauthenticated request is rejected without receiving its body, even for a route with a large `bodyLimit`.
If an error occurs in this middleware function, a `401 Unauthorized` error occurs.
If the error is an `HttpError`, its status code is used instead (e.g. `throw new HttpError(403)`).

Don't read the request body (`req`) in this function or in `before()`, badak responds `500 Internal Server Error` if the body is read already.

### `before(fnc: MiddlewareFunction): Promise<void>`

Registers a middleware function to run **before** the routing function is executed.
Multiple middleware functions can be specified,
and they are executed in parallel regardless of the order in which they are specified.

If a middleware function throws an error (or returns a rejected Promise), the routing function is not executed
and badak responds with an error status code, in the same way as an error thrown in the routing function.
For example, `throw new Error('Forbidden')` responds `403 Forbidden`, and other errors respond `500 Internal Server Error`.
If a middleware function responds by itself (e.g. `res.end()`), the routing function is not executed either.

### `after(fnc: MiddlewareFunction): Promise<void>`

Registers a middleware function to run **after** the routing function is executed.
Multiple middleware functions can be specified,
and they are executed in parallel regardless of the order in which they are specified.

`after()` functions run for every request, also if the client closed the connection before the response.
If the client closed the connection while sending the request body, the routing function is not executed,
no response is sent, and `res.writableEnded` is `false` in `after()` functions.

### `config(key: string, value: unknown): Promise<void>`

Controls how badak apps run.

### `listen(port: number): Promise<void>`

The server starts responding.

### `isRunning(): boolean`

Checks if the server is running and returns the results.
The initial state is `false`, becomes `true` after the `listen()` function is executed,
and becomes `false` after terminating with `stop()`.

### `getHttpServer(): Server | undefined`

Returns the HTTP server instance.
Used to access badak internal members.

### `stop(timeout?: number): Promise<void>`

Stop the HTTP server.
It stops accepting new connections, closes idle keep-alive connections,
and waits for in-flight requests to finish.

If `timeout` (ms) is specified, the remaining connections are closed forcibly after this time.
`timeout` should be an integer from `0` to `2147483647` (about 24.8 days, the limit of Node.js timers), or `Infinity` to wait without limit.
Use it if there are long-running responses like long polling or Server-Sent Events,
because `stop()` doesn't resolve until they finish.

### `route(rule: RouteRule): Promise<void>`

Register a routing function.

If a request matches a registered path but no routing function is registered for its method,
badak responds `405 Method Not Allowed` with the `Allow` header listing the available methods.
If no path matches, badak responds `404 Not Found`.

### `get(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

Registers a routing function that responds to `GET` method requests.
`HEAD` requests are also handled by this routing function, and only the headers are sent without the body.

### `post(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

Registers a routing function that responds to `POST` method requests.

### `put(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

Registers a routing function that responds to `PUT` method requests.

### `delete(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

Registers a routing function that responds to `DELETE` method requests.

### `patch(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

Registers a routing function that responds to `PATCH` method requests.
The request body is parsed in the same way as `POST` and `PUT`.

### `static(uri: string, path: string, option?: StaticOption): Promise<void>`

Concatenate the address and file path to be provided as a static file.

The `Content-Type` is determined by the file extension.
For an unknown extension or a file without extension, it is determined by the file signature (e.g. PNG),
and `application/octet-stream` is used if it is not known either.
Text files (`text/*`) and JavaScript files are served with `charset=utf-8`, so save them in UTF-8.

Files are loaded into memory when `listen()` is called, so restart the server to serve changed files.

Static files are served with `ETag` (from the file content) and `Last-Modified` (from the file modification time),
and respond `304 Not Modified` without the body if `If-None-Match` or `If-Modified-Since` of the request matches.
`If-Modified-Since` is ignored if `If-None-Match` exists, and `If-None-Match` with invalid syntax doesn't match.

`Cache-Control` is `no-cache` by default: browsers cache the file, but check whether it is changed every time.
Set `cacheControl` to change it.

```typescript
// files with hashed names, e.g. main.3f2a1b.js
await app.static('/assets', '/var/www/assets', { cacheControl: 'public, max-age=31536000, immutable' });

// no Cache-Control header, ETag and Last-Modified are still sent
await app.static('/public', '/var/www/public', { cacheControl: false });
```

| option | type | default | description |
|---|---|---|---|
| `cacheControl` | `string \| false` | `'no-cache'` | `Cache-Control` header value, `false` to omit the header |

### `setSPARoot(uri: string, path: string, option?: StaticOption): Promise<void>`

Connect the address and file path to be used with the SPA app.
Files within the specified folder are served statically and cached, in the same way as `static()`.
`option` is the same as `static()`.

## Error Response

### `HttpError`

Throw an `HttpError` in routing functions or middleware functions to respond with a specific status code.

```typescript
import { HttpError } from 'badak';

app.get('/admin', () => {
	throw new HttpError(403); // 403, 'Forbidden'
});

app.post('/users', () => {
	// object body is sent as JSON
	throw new HttpError(422, { body: { field: 'email', reason: 'invalid' } });
});

app.get('/limited', () => {
	throw new HttpError(429, { headers: { 'Retry-After': 60 } });
});
```

- `status` : an integer from `400` to `599`.
- `option.body` : the response body. A string is sent as text, a `Buffer` as binary, and other values (object, array, number, boolean) as JSON.
  If omitted, `null`, or not serializable (e.g. circular reference), the status text (e.g. `Forbidden`) is sent.
- `option.headers` : response headers. `Content-Type` in it is kept.
- `option.cause` : the original error, for logging.

Other errors respond `500 Internal Server Error`, without the error message.
For compatibility, an `Error` whose message is a status text such as `new Error('Forbidden')` responds with the matching status code
(`Bad Request`, `Unauthorized`, `Forbidden`, `Not Found`, `Method Not Allowed`, `Not Acceptable`, `Payload Too Large`).

Use `isHttpError(value)` to check if a value is an `HttpError`.

## Interfaces

### `MiddlewareFunction`

```typescript
export type MiddlewareFunction = (req: IncomingMessage, res: ServerResponse, responseBody?: unknown) => void | Promise<void>;
```

This is a function registered in `before()` and `after()`.
Middleware functions cannot change the arguments passed to the routing function.

### `RouteFunction`

```typescript
export type RouteFunction = (ctx: ParamContext, req: IncomingMessage, res: ServerResponse) => unknown | Promise<unknown>;
```

Register a routing function to respond to HTTP requests.
The value returned by the routing function is returned as an HTTP response.

| returned value | response |
|---|---|
| `string` | text (`text/plain; charset=utf-8`) |
| `Buffer` | binary, `Content-Type` by its signature |
| object, array, number, boolean, `null` | JSON (`application/json`), `Buffer` in an object as base64 |
| `undefined` (no return value) | empty body |

A value that can't be serialized to JSON (e.g. circular reference, `BigInt`) responds `500 Internal Server Error`.

If the routing function returns a `Readable` stream, badak pipes it to the response.
`Content-Type` is `application/octet-stream` unless the routing function sets it.

```typescript
import { createReadStream } from 'node:fs';

app.get('/download', (_ctx, req, res) => {
	res.setHeader('Content-Type', 'application/pdf');
	return createReadStream('/path/to/file.pdf');
});
```

If the stream fails before sending data, badak responds `500 Internal Server Error`.
If it fails while sending data, the connection is closed so that the client can know the response is incomplete.

### `BadakOption`

Specifies how the badak app should behave.

#### `catchErrorLog: boolean`

If an error occurs, a log is output to the console.

- Logged : `5xx` `HttpError`, and other errors such as `Error`, including an error thrown in the `auth()` function.
- Not logged : `4xx` `HttpError`, and `4xx` responses made by badak such as `404 Not Found`, `405 Method Not Allowed`,
  `400 Bad Request` (malformed body) and `413 Payload Too Large`, because they are intended client error responses.
- Not logged : the client closing the connection, e.g. while sending the request body (`ECONNRESET`). It is not a server error, and nothing can be responded.

The default is `true`.

#### `preventError: boolean`

Determines whether an error that occurs while handling a request stays in badak.

- `true` : badak catches the error and responds with an error status code. The server keeps running.
- `false` : badak responds with an error status code, and then rethrows the error.
  The error is rethrown inside the request handler, so it becomes an unhandled promise rejection,
  and the process terminates with the Node.js default setting (`--unhandled-rejections=throw`).
  Use this value only if you want the process to stop on errors (fail-fast), e.g. with a process manager that restarts it.

The default is `true`.

#### `defaultMethod: METHOD | undefined`

Specifies the default HTTP method type to use for routing.
Specifying this value allows you to omit specifying the HTTP method when using the `Badak.route()` method.

- before :

```typescript
app.route({
	users: {
		GET: getUserList
	}
});
```

- after `app.config('defaultMethod', 'GET')` :

```typescript
app.route({
	users: getUserList
});
```

#### `parseNumber: boolean`

Converts the string-type number passed as an argument to the `number` type.
Only plain decimal numbers such as `5`, `-1.5` are converted.
Values like `007` (leading zero), `1e3`, `0x10`, ` 5` (with spaces), and integers out of the safe integer range are kept as strings,
so zip codes and IDs are not changed.
It applies to the query string of all HTTP methods and the body of `POST`/`PUT`/`PATCH` requests, not to route params such as `:id`.

The default is `false`.

#### `parseDate: boolean`

Converts the date in string format passed as an argument to the `Date` type.
It applies to the query string of `GET` requests and the body of `POST`/`PUT` requests, not to route params such as `:id`.

The default is `false`.

#### `bodyLimit: number`

The maximum size of the request body in bytes, a positive integer.
If the request body is larger than this value, a `413 Payload Too Large` error occurs.
For `multipart/form-data`, the whole request body is counted, including part headers and boundaries,
so increase this value if you accept file uploads.
Specify `Infinity` to remove the limit.
To allow a larger body for specific routes only (e.g. file uploads), use `bodyLimit` of `RouteOption`.

The default is `102400` (100KB).

### `RouteOption`

Determines the behavior of routing functions.

#### `auth: boolean`

If specified as `false`, the `auth()` function will not be executed when this routing function is executed.

The default is `true`.

#### `bodyLimit: number`

The maximum size of the request body in bytes for this routing function, used instead of `bodyLimit` of the app option.
The value is the same as `bodyLimit` of the app option: a positive integer, or `Infinity` to remove the limit.
It applies to `POST`, `PUT` and `PATCH`, whose request body is parsed.

```typescript
const app: Badak = new Badak({ bodyLimit: 100 * 1024 }); // 100KB for other routes

await app.post('/upload', uploadFnc, { bodyLimit: 10 * 1024 * 1024 }); // 10MB

await app.route({
	'/avatar': {
		PUT: {
			fnc: avatarFnc,
			option: { bodyLimit: 1024 * 1024 }
		}
	}
});
```

The `auth()` function is executed before the request body is received,
so an unauthenticated request is rejected without receiving the body up to this limit.

## Special Routing

Special routing can be used on the routes of the `route()`, `get()`, `post()`, `put()`, `patch()` and `delete()` functions.
**A request matches only one route per method** : routes that can match the same request path throw an error when they are registered, see [One route per request](#one-route-per-request).
The full specification is in [`docs/routing-spec-5.0.0.md`](https://github.com/han41858/badak/blob/main/docs/routing-spec-5.0.0.md) (Korean).

| Pattern | Meaning | Matches | Doesn't match |
|---|---|---|---|
| `users` | literal | `users` | `user` |
| `:id` | one uri fragment, 1 or more characters | `7`, `me` | |
| `*` | one uri fragment, 1 or more characters | `a.png` | |
| `ab?cd` | the character just before `?` 0 or 1 time | `acd`, `abcd` | `abbcd` |
| `ab+cd` | the character just before `+` 1 or more times | `abcd`, `abbcd` | `acd` |
| `ab*cd` | any characters (0 or more) between `ab` and `cd` | `abcd`, `abXYZcd` | `acd`, `aXcd` |
| `*.png` | any characters, then `.png` | `a.png` | `a.jpg` |
| `**` | the rest of the path, fallback | | |

- `?` and `+` apply to the one character just before them. `*` is a wildcard and doesn't apply to the character before it.
- They can be combined in a uri fragment, e.g. `ab?c+d`, `a*b*c`, `*abc`.
- Invalid patterns throw `invalid route '...'` when they are registered : `?` or `+` without a character before it (`?abc`), adjacent syntax characters (`ab??`, `ab?*`, `a**b`), and `:` not at the beginning (`ab:id`).
- Other characters are literal, including characters with special meaning in regular expressions (e.g. `.`, `(`, `)`). `/a.c?` matches `/a.c` and `/a.`, not `/abc`.
- Percent-encoded characters are always literal. `/a%2Ab` matches only `/a*b` (or `/a%2Ab`), `%2A%2A` is a normal uri fragment `**`, not a fallback.
- The matched uri fragment is in `ctx.params` : by the name for `:` routing (`{ id: '7' }`), by `'*'` for `*`, and by the routing pattern for others (`{ 'ab*cd': 'abXcd' }`).

### `:` routing

If you specify a routing path with `/:userId` and send an HTTP request to `/user1`,
the request is matched and `ctx.params` contains `{ userId: 'user1' }`.

### `*` routing

`*` as a whole uri fragment matches exactly one uri fragment; its value is available as `ctx.params['*']`.

```typescript
await app.get('/img/*', ({ params }) => params);

// GET /img/a.png -> { '*': 'a.png' }
// GET /img, /img/, /img/a/b -> 404
```

### `**` routing

`**` matches the rest of the path, including `/`.
The remaining path is available as `ctx.params['**']`: each fragment is decoded and joined with `/`.

```typescript
await app.get('/files/**', ({ params, query }) => ({ params, query }));

// GET /files/a/b%20c/d.txt -> { params: { '**': 'a/b c/d.txt' }, query: {} }
// GET /files/a/b?c=1       -> { params: { '**': 'a/b' }, query: { c: '1' } }
```

- `**` should be the last uri fragment of the routing path. A path like `/files/**/edit` throws an error when it is registered.
- `%2F` in a uri fragment is decoded to `/` too, so `/files/a%2Fb` and `/files/a/b` pass the same value.
- A malformed percent-encoding in the rest of the path responds `400 Bad Request`.
- `**` matches 0 or more uri fragments. `/files/**` matches `/files`, `/files/`, `/files/a` and `/files/a/b`, and `**` is `''` for `/files` and `/files/`. `/**` matches `/` too.
- `**` is a fallback. It is used only if the path doesn't match other routes fully, see [One route per request](#one-route-per-request).

### One route per request

Routes of the same method conflict if they have the same number of uri fragments and every uri fragment can match the same characters.
A conflict throws `Conflicting routes for <METHOD>` when the second one is registered, regardless of the registration order. There is no priority between routes.

| Routes | Result |
|---|---|
| `GET /users/me`, `GET /users/:id` | conflict, both match `/users/me` |
| `GET /img/*`, `GET /img/:id` | conflict |
| `GET /abc`, `GET /ab+c` | conflict, both match `/abc` |
| `GET /ab*cd`, `GET /ab%2Acd` | conflict, both match `/ab%2Acd` (`ab*cd`) |
| `GET /a/:id/details`, `GET /a/b+/settings` | registered, the last uri fragments don't overlap |
| `GET /users/:id/a`, `GET /users/:name/b` | registered |
| `GET /a/:id`, `POST /a/b+` | registered, different methods |
| `GET /users/:id`, `GET /users/:id` | registered again, the latter replaces the former |

Every route matching the request path is found, not only the first one, and the routing function is selected by the method.
If the path matches routes but none for the method, badak responds `405 Method Not Allowed` with the methods of all of them in the `Allow` header.

```typescript
await app.get('/a/:id', getFnc);
await app.post('/a/b+', postFnc);

// GET  /a/bb -> getFnc, { id: 'bb' }
// POST /a/bb -> postFnc, { 'b+': 'bb' }
// PUT  /a/bb -> 405, Allow: GET, HEAD, POST
```

`**` routes are not compared with other routes. They are used only if the request path doesn't match a route fully, and the deepest one is used.
`**` routes of the same method and the same depth (the number of uri fragments before `**`) conflict if the parts before `**` can match the same path, e.g. `/a/:id/**` and `/a/b+/**` throw `Conflicting fallback routes for GET at depth 2`.

For example, with `setSPARoot('/')` (`/**`), `/style.css` and `/api/users` are handled by their own routes, and other paths respond `index.html`.

```typescript
await app.get('/**', spaFnc);
await app.get('/api/users', usersFnc);
await app.get('/api/users/:id', userFnc);

// GET /api/users     -> usersFnc
// GET /api/users/7   -> userFnc, { id: '7' }
// GET /api/users/7/x -> spaFnc, { '**': 'api/users/7/x' }
// GET /api           -> spaFnc, { '**': 'api' }
```

If the path matches a route fully but no routing function is registered for the method, badak responds `405 Method Not Allowed` without using `**`.

Static file routes of `static()` and `setSPARoot()` are registered in `listen()` and checked in the same way, e.g. `static('/', dir)` with `style.css` conflicts with `GET /:slug`.
A conflict rejects `listen()` and the server doesn't start. Nothing is registered partially.

### Non-ASCII and percent-encoded paths

Routing paths can have non-ASCII characters, e.g. `/사용자/:id`.

- The request path is split by `/` first, then each uri fragment is decoded separately.
  So `%2F` is a `/` character in a uri fragment, not a path separator: `/files/:id` passes `{ id: 'a/b' }` for `/files/a%2Fb`, and doesn't match `/files/a/b`.
- A malformed percent-encoding in the request path responds `400 Bad Request`.
- Percent-encoded characters in routing paths are decoded for matching, so `/한글` and `/%ED%95%9C%EA%B8%80` are the same path.
  They are one routing node: routing functions of different methods are merged (e.g. `GET /한글` and `POST /%ED%95%9C%EA%B8%80`),
  and the same method registered again replaces the previous one, same as registering the same spelling again.
- Percent-encoded characters in routing paths are always literal, not routing syntax.
  For example, `/%2A` matches only `/*` (or `/%2A`), `/colou%3Fr` matches only `/colou%3Fr`, and `/%3Aid` matches only `/:id`.
- A malformed percent-encoding in a routing path (e.g. `/100%`) throws an error when it is registered. Use `%25` for `%`.
- Static file names are literal. Files like `한글.txt`, `a+b.txt` and `100%.txt` are served with their names.

## Generic request types

Specify only the request fields you need using one named type argument. The other fields retain their default types.

```typescript
interface User { name: string }
interface IdParams { id: string }

await app.post<{ body: User }>('/users', ({ body }) => body.name);
await app.get<{ params: IdParams }>('/users/:id', ({ params }) => params.id);
```

The generic type is a **TypeScript assertion, not runtime validation**. Validate untrusted HTTP input before using it. Typed handlers can also be registered through `app.route()`.

- Supported keys are `params`, `query`, and `body`. Other keys (e.g. a typo `bdy`) are compile errors, even together with correct keys.
- `params` values should be strings, because route captures are always decoded strings (`parseNumber` and `parseDate` don't apply to them). `{ params: { id: number } }` is a compile error. Interfaces and optional keys are supported, e.g. `interface IdParams { id: string }`, `{ id?: string }`.
- `params` should be an object of named captures, not an array.
- `query` should be an object, `body` can be any type.
- `app.get()` and `app.delete()` can't declare `body`, because the request body is not parsed for `GET` and `DELETE` (`ctx.body` is always `undefined`). A separately typed handler declaring `body` is rejected too. This is not checked for handlers in `app.route()`.

The declared types are not checked against the runtime values. Note the actual values :

- `query` values are strings, or arrays of strings for repeated keys (e.g. `?page=2&page=3` -> `['2', '3']`). They are numbers or `Date` only when `parseNumber` or `parseDate` is enabled. Declaring `{ query: { page: number } }` doesn't convert the value.
- `body` is `undefined` when a `POST`, `PUT` or `PATCH` request has no body, even if `body` is declared (e.g. `{ body: User }`).

## Routing parameters

Route callbacks receive `ParamContext` with three separate fields. Data sources never overwrite each other.

### Query string

Every HTTP method parses query parameters into `ctx.query`. Without query parameters, `ctx.query` is `{}`.

```text
GET /path?             → query: {}
GET /path?key          → query: { key: '' }
GET /path?key=         → query: { key: '' }
GET /path?key=value    → query: { key: 'value' }
```

### Route captures and body

`ctx.params` contains only decoded path captures (always strings). `ctx.body` is parsed for POST, PUT, and PATCH, and may be an object, array, JSON primitive, or `undefined`.

```typescript
await app.patch('/users/:id', (ctx) => ctx);

// PATCH /users/7?id=8 with JSON body { "id": 9 }
// {
//   params: { id: '7' },
//   query: { id: '8' },
//   body: { id: 9 }
// }
```

`parseNumber` and `parseDate` apply to query and body strings, but never to path captures. The original Node.js `req` and `res` are still available as the second and third callback parameters.

## Examples

[`sample/app.ts`](https://github.com/han41858/badak/blob/main/sample/app.ts) is a small app with the examples below, and it is tested with the current version. Run it with `npx tsx sample/index.ts`.

### Authentication and public routes

`auth()` runs before the request body is received. Routes with `{ auth: false }`, static files and the SPA skip it.

```typescript
await app.auth((req) => {
	if (req.headers.authorization !== `Bearer ${ token }`) {
		throw new HttpError(401, { headers: { 'WWW-Authenticate': 'Bearer' } });
	}
});

await app.get('/api/health', () => ({ status: 'ok' }), { auth: false });
```

### Status code and headers

Set them with `res`, and return the body.

```typescript
await app.post('/api/users', ({ body }, req, res) => {
	const user: User = createUser(body); // validate body, throw HttpError(400) if invalid

	res.statusCode = 201;
	res.setHeader('Location', `/api/users/${ user.id }`);

	return user;
});

await app.delete<{ params: { id: string } }>('/api/users/:id', ({ params }, req, res) => {
	deleteUser(params.id);
	res.statusCode = 204; // no return value : empty body
});
```

### File upload

For `multipart/form-data`, fields are strings, and files are `Buffer` (or strings for `text/plain` files).
`bodyLimit` of a route allows larger bodies for this route only.

```typescript
await app.post('/api/files', ({ body }) => {
	const { name, file } = body as { name?: string, file?: Buffer | string };

	if (file === undefined) {
		throw new HttpError(400);
	}

	return { name, size: Buffer.byteLength(file) };
}, { bodyLimit: 10 * 1024 * 1024 });
```

### Streaming response

```typescript
import { Readable } from 'node:stream';

await app.get('/api/users.csv', (ctx, req, res) => {
	res.setHeader('Content-Type', 'text/csv; charset=utf-8');

	// rows : CSV lines, escape the fields (see toCsvField() in sample/app.ts)
	return Readable.from(['id,name\r\n', ...rows]);
});
```

### API with a SPA

API routes and static files are matched first, and `index.html` is served for other paths.

```typescript
await app.get('/api/users', listUsers);
await app.setSPARoot('/', path.join(__dirname, 'public'));

// GET /api/users  -> listUsers
// GET /app.css    -> public/app.css
// GET /users/1    -> public/index.html
```

### Access log

```typescript
await app.after((req, res) => {
	// false if the client closed the connection while sending the request body
	const status = res.writableEnded ? res.statusCode : 'closed';

	console.log(`${ req.method } ${ req.url } ${ status }`);
});
```
