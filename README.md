![npm](https://img.shields.io/npm/v/badak?logo=npm)
![NPM Last Update](https://img.shields.io/npm/last-update/ejv)

![logo](https://github.com/han41858/badak/raw/main/docs/logo/badak_200.png)

[한국어](https://github.com/han41858/badak/blob/main/README-KR.md)

# badak

![TypeScript](https://img.shields.io/badge/TypeScript-black?color=3178C6&logo=typescript&logoColor=white)
![TypeScript](https://img.shields.io/badge/node.js-black?color=5FA04E&logo=nodedotjs&logoColor=white)

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
import { Badak } from 'badak';

const rule: RouteRule = {
	users: {
		GET: () => {
			// returns a list of users.
			return {
				list: ['han', 'kim', 'lee']
			}
		},
		POST: (user: User) => {
			// add a user.
			return {
				result: 'ok'
			}
		}
	}
};


const app: Badak = new Badak();
await app.route(routeRule);
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
The registered function is executed after `before()` and before the routing function is executed.
If an error occurs in this middleware function, a `401 Unauthorized` error occurs.

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

### `stop(): Promise<void>`

Stop the HTTP server.

### `route(rule: RouteRule): Promise<void>`

Register a routing function.

### `get(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

Registers a routing function that responds to `GET` method requests.

### `post(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

Registers a routing function that responds to `POST` method requests.

### `put(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

Registers a routing function that responds to `PUT` method requests.

### `delete(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

Registers a routing function that responds to `DELETE` method requests.

### `static(uri: string, path: string): Promise<void>`

Concatenate the address and file path to be provided as a static file.

### `setSPARoot(uri: string, path: string): Promise<void>`

Connect the address and file path to be used with the SPA app.
Files within the specified folder are served statically and cached.

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

### `BadakOption`

Specifies how the badak app should behave.

#### `catchErrorLog: boolean`

If an error occurs, a log is output to the console.

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

The default is `false`.

#### `parseDate: boolean`

Converts the date in string format passed as an argument to the `Date` type.

The default is `false`.

#### `bodyLimit: number`

The maximum size of the request body in bytes, a positive integer.
If the request body is larger than this value, a `413 Payload Too Large` error occurs.
For `multipart/form-data`, the whole request body is counted, including part headers and boundaries,
so increase this value if you accept file uploads.
Specify `Infinity` to remove the limit.

The default is `102400` (100KB).

### `RouteOption`

Determines the behavior of routing functions.

#### `auth: boolean`

If specified as `false`, the `auth()` function will not be executed when this routing function is executed.

The default is `true`.

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

When requesting the `GET` method, the query string argument is parsed and passed to the routing function.

The examples below all match the `/path` path, and the arguments passed are as follows.

```bash
/path?          # {}
/path?key       # { key: null }
/path?key=      # { key: '' }
/path?key=value # { key: 'value' }
```
