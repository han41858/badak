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
import { Badak, RouteRule } from 'badak';

interface User {
	name: string;
}

const rule: RouteRule = {
	users: {
		GET: () => {
			// returns a list of users.
			return {
				list: ['han', 'kim', 'lee']
			};
		},
		POST: (user: User) => {
			// add a user.
			return {
				result: 'ok'
			};
		}
	}
};


const app: Badak = new Badak();
await app.route(rule);
await app.listen(3000);
```

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
export type RouteFunction = (param: any, req: IncomingMessage, res: ServerResponse) => unknown | Promise<unknown>;
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

app.get('/download', (param, req, res) => {
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
It applies to the query string of `GET` requests and the body of `POST`/`PUT` requests, not to route params such as `:id`.

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

Special routing can be used on the routes of the `route()`, `get()`, `post()`, `put()`, and `delete()` functions.

### `:` routing

If you specify a routing path with `/:userId` and send an HTTP request to `/user1`,
the request is matched and `{ userId: 'user1' }` is passed as an argument to the routing function.

### `?` routing

If you specify the routing path as `/users?`, you can match the `/user` and `/users` paths.

### `+` routing

If you specify the routing path as `/user1+`, you can match paths such as `/user1` and `/user11`.

### `*` routing

If you specify a routing path as `/user1*`, you can match paths such as `/user`, `/user1`, and `/user11`.

## Routing Param

### query string

The query string is parsed and passed to the routing function, for every method.

The examples below all match the `/path` path, and the arguments passed are as follows.

```bash
/path?          # undefined
/path?key       # { key: '' }
/path?key=      # { key: '' }
/path?key=value # { key: 'value' }
```

### merging params

Route params (e.g. `:id`), the query string and the request body (`POST`, `PUT`, `PATCH`) are merged into one object in this order.
If the same key exists, the latter wins.

```bash
PATCH /users/7?name=a  with body { "name": "b" }  # { id: '7', name: 'b' }
```

> **Warning** : the query string and the request body can override route params.
> For example, `PATCH /users/7?id=8` with body `{ "id": 9 }` passes `{ id: 9 }` to the route function `/users/:id`.
> Don't trust a key that can come from the client as the route param.
> Name route params so that they don't collide with query and body keys (e.g. `/users/:userId`).

If the request body is not an object (e.g. a JSON array), it is passed as it is, without route params and the query string.
