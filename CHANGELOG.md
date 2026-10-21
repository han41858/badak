# Changelog

## Unreleased

### Others

- The TypeScript source (`src/`) and declaration maps (`.d.ts.map`) are published with the package. ([#51](https://github.com/han41858/badak/pull/51))
  - "Go to Definition" in editors (tsserver) opens the TypeScript source instead of `.d.ts`, for both `import` and `require`.
  - files referred by source maps exist in the package, so debuggers can show the TypeScript source. Stack traces with `node --enable-source-maps` point to existing files.
  - the package size is about 74kB (it was about 52kB).

## 2.1.0 (2026-10-21)

This release adds cache headers for static files and a request body size limit for each route,
and runs `auth()` before receiving the request body.

### Added

- Static files have `ETag` and `Last-Modified`, and respond `304 Not Modified` for `If-None-Match` and `If-Modified-Since`. ([#44](https://github.com/han41858/badak/pull/44))
  - `Cache-Control` is `no-cache` by default (cached, but revalidated every time), and can be changed with the `cacheControl` option of `static()` and `setSPARoot()`, e.g. `{ cacheControl: 'public, max-age=31536000, immutable' }`, or `false` to omit the header.
  - `StaticOption` type is exported.
- `bodyLimit` of `RouteOption` to set the request body size limit for each routing function, e.g. `app.post('/upload', fnc, { bodyLimit: 10 * 1024 * 1024 })`. ([#45](https://github.com/han41858/badak/pull/45))
- `auth` of `RouteOption` is optional in the type, so that `{ bodyLimit }` can be passed alone. ([#45](https://github.com/han41858/badak/pull/45))

### Changed

- The `auth()` function is executed before the request body is received. It was executed after the request body was received and parsed. ([#46](https://github.com/han41858/badak/pull/46))
  - an unauthenticated request is rejected without receiving its body, so a route with a large `bodyLimit` doesn't receive it.
  - for an unauthenticated request, `auth()` responds first (e.g. `401`) instead of `413` for a large body or `400` for a malformed body.
  - `auth()` doesn't receive the parsed body as before, so authentication logic is not affected.

### Fixed

- A request hung if `before()` or `auth()` read the request body. It responds `500` now. ([#46](https://github.com/han41858/badak/pull/46))

### Others

- Update dev dependencies (mocha 12) to fix `yarn audit` vulnerabilities. No runtime dependency is changed, badak has none. ([#43](https://github.com/han41858/badak/pull/43))

## 2.0.0 (2026-10-21)

This release fixes many bugs found in request handling, routing and packaging,
and adds `HttpError`, `PATCH`, `HEAD`, stream responses and a request body size limit.
Several fixes change existing behavior, see [Breaking changes](#breaking-changes) and [Migration](#migration) first.

### Breaking changes

#### Package

- The ESM build (`import`) is now real ES modules. It was CommonJS before, loaded through CommonJS interop. ([#19](https://github.com/han41858/badak/pull/19))
  If you use both `import` and `require` for badak in one project, they load different module instances.

#### Options

- `bodyLimit` (default 100KB) limits the request body size, and a larger body responds `413 Payload Too Large`. There was no limit before. ([#25](https://github.com/han41858/badak/pull/25))
  It applies to `multipart/form-data` file uploads too.
- Options passed to the constructor are validated in the same way as `config()`. An unknown key or an invalid value throws an error. ([#25](https://github.com/han41858/badak/pull/25))
- `parseNumber` converts plain decimal numbers only (`'5'`, `'-1.5'`). `'007'`, `'0x10'`, `'1e3'`, `' 5'` and integers out of the safe integer range are kept as strings. ([#31](https://github.com/han41858/badak/pull/31))
- `parseNumber` and `parseDate` also apply to the query string. They applied to the request body only before. Route params (e.g. `:id`) are not converted. ([#29](https://github.com/han41858/badak/pull/29))

#### Error responses

- An `Error` thrown in a routing function responds `Internal Server Error` as the body. The error message was sent to the client before. ([#18](https://github.com/han41858/badak/pull/18))
- An error thrown in a `before()` middleware function stops routing and responds an error status code. It was only logged and the routing function was executed before. ([#27](https://github.com/han41858/badak/pull/27))
- A request to an existing path with an unregistered method responds `405 Method Not Allowed` with the `Allow` header. It responded `404` before. ([#30](https://github.com/han41858/badak/pull/30))
- `404`, `405`, `400` and `413` responded by badak have the status text as the body (e.g. `Not Found`). The body was empty before. ([#37](https://github.com/han41858/badak/pull/37))
- A malformed JSON body, or `multipart/form-data` without boundary, responds `400 Bad Request`. The request hung before. ([#18](https://github.com/han41858/badak/pull/18), [#22](https://github.com/han41858/badak/pull/22))
- `catchErrorLog` doesn't log 4xx `HttpError` (including `404`, `405`, `400`, `413` responded by badak). Other errors and 5xx are logged. ([#37](https://github.com/han41858/badak/pull/37))

#### Request params

- Route params, the query string and the request body are merged into one object in this order, and the latter wins for the same key. ([#18](https://github.com/han41858/badak/pull/18), [#30](https://github.com/han41858/badak/pull/30))
  - the query string is parsed for every method, not only `GET`.
  - in 1.0.11, the `GET` query string replaced route params (e.g. `/users/7?sort=name` passed `{ sort: 'name' }` without `id`), and the query string of other methods was ignored.
  - e.g. `PATCH /users/7?id=8` with body `{ "id": 9 }` passes `{ id: 9 }` to `/users/:id`.
- A request body that is not an object (e.g. a JSON array) is passed as it is. It was merged into route params as `{ '0': ..., '1': ... }` before. ([#30](https://github.com/han41858/badak/pull/30))
- `application/x-www-form-urlencoded` body and route params are URL-decoded (`+`, `%20`). ([#18](https://github.com/han41858/badak/pull/18))
- A route param with malformed percent-encoding responds `400`. ([#18](https://github.com/han41858/badak/pull/18))

#### Responses

- A value returned by a routing function is serialized as below. ([#39](https://github.com/han41858/badak/pull/39))
  - number and boolean are sent as JSON. They responded `500` before.
  - `0`, `false`, `''` and `null` are sent as their values. They responded an empty body before.
  - only `undefined` (no return value) responds an empty body.
  - the returned object is no longer modified. `Buffer` in it was replaced with a base64 string in place before.
- Text responses have `charset=utf-8` in `Content-Type` (`text/*`, `application/javascript`). ([#34](https://github.com/han41858/badak/pull/34))
- A static file of unknown extension (or without extension) responds `application/octet-stream`. It responded `text/plain` before. ([#40](https://github.com/han41858/badak/pull/40))

#### Routing

- `+` and partial `*` routes match the whole URI fragment. `ab+c` matched `/xxabbbcyy` before. ([#20](https://github.com/han41858/badak/pull/20))
- Route duplication is checked among siblings only. Routes like `/users/:id` and `/posts/:postId` threw `duplicated colon routing` before. ([#21](https://github.com/han41858/badak/pull/21))

### Added

- `HttpError` and `isHttpError()` to respond with a specific status code, body and headers, e.g. `throw new HttpError(422, { body: { field: 'email' } })`. ([#35](https://github.com/han41858/badak/pull/35))
- `PATCH` method: `patch()` and `PATCH` key in `route()`. ([#30](https://github.com/han41858/badak/pull/30))
- `HEAD` requests are handled by the `GET` routing function, including static files. ([#30](https://github.com/han41858/badak/pull/30))
- A `Readable` stream returned by a routing function is piped to the response. ([#36](https://github.com/han41858/badak/pull/36))
- `bodyLimit` option. ([#25](https://github.com/han41858/badak/pull/25))
- `stop(timeout)` closes remaining connections (e.g. Server-Sent Events) after the timeout. ([#32](https://github.com/han41858/badak/pull/32))
- Type declarations for each module format, for TypeScript `moduleResolution` `node16`, `nodenext` and `bundler`. ([#19](https://github.com/han41858/badak/pull/19))
- MIME types: `svg`, `avif`, `woff`, `woff2`, `ttf`, `otf`, `mp3`, `mp4`, `webm`, `mjs`, `cjs`, `map`, `webmanifest`, `wasm`, `xml`, `csv`, `md`. ([#28](https://github.com/han41858/badak/pull/28))
- `Content-Length` for static files and values returned by routing functions. ([#30](https://github.com/han41858/badak/pull/30))

### Fixed

- The process terminated when a middleware or routing function ended the response by itself (e.g. `res.end()` in `before()`). ([#23](https://github.com/han41858/badak/pull/23))
- The process terminated when an error response body couldn't be sent, e.g. `throw 123`. ([#35](https://github.com/han41858/badak/pull/35))
- `multipart/form-data`: multiline values were dropped, files other than `text/plain` and `application/octet-stream` were dropped, boundary parameter was not found unless it was the first one. ([#22](https://github.com/han41858/badak/pull/22))
- Static files: `app.min.js` was served as `text/plain`, file signature was preferred to the extension. ([#28](https://github.com/han41858/badak/pull/28))
- A route with `*` at the end (e.g. `user1*`) never matched. ([#20](https://github.com/han41858/badak/pull/20))
- Duplicated `+` routes (e.g. `ab+c` and `abbc`) were not detected, and `ab+c` and `ac` were detected as duplicated. ([#21](https://github.com/han41858/badak/pull/21))
- `parseNumber` result was overwritten when `parseDate` was also set. ([#18](https://github.com/han41858/badak/pull/18))
- `config('catchErrorLog' | 'preventError', value)` was ignored. ([#25](https://github.com/han41858/badak/pull/25))
- Static files had no `Content-Length`, they were sent with chunked encoding. ([#30](https://github.com/han41858/badak/pull/30))

### Documentation

- `preventError` described the opposite of the actual behavior. ([#26](https://github.com/han41858/badak/pull/26))
- The usage example didn't compile, the npm badge pointed to another package, and query string examples didn't match the actual results. ([#33](https://github.com/han41858/badak/pull/33))

### Others

- Only `build/` is published to npm. The package was 3.0MB with tests and a logo source file, it is about 0.3MB now. ([#19](https://github.com/han41858/badak/pull/19))
- CI with GitHub Actions: lint, test and build with Node.js 22 and 24. ([#24](https://github.com/han41858/badak/pull/24))
- `npm pack` and `npm publish` build the package automatically (`prepack` script), so a stale or missing `build/` is not published.

### Migration

| If you ... | then |
|---|---|
| accept request bodies larger than 100KB, including file uploads | set `bodyLimit`, e.g. `new Badak({ bodyLimit: 10 * 1024 * 1024 })`, or `Infinity` to remove the limit |
| read the error message from `500` responses on the client | throw `HttpError` with a `body`, e.g. `throw new HttpError(500, { body: { reason } })` |
| throw in `before()` to log but continue | catch the error in the middleware function |
| expect `404` for an unregistered method | expect `405` |
| use `parseNumber` with values like `'1e3'` or `'0x10'` | convert them in the routing function |
| expect `id` from route params not to be overridden | name route params not to collide with query and body keys (e.g. `/users/:userId`) |
| return `null`, `0`, `false` or `''` to respond an empty body | return nothing (`undefined`) |
| serve files without extension as text | add an extension such as `.txt` |
| depend on the `Error('Forbidden')` message mapping | use `HttpError(403)` (the mapping still works, but it is logged) |

## 1.0.11

See the [commit history](https://github.com/han41858/badak/commits/main) for the changes up to 1.0.11.
