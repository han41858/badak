# Changelog

## Unreleased (5.0.0)

These changes break backward compatibility and are planned for 5.0.0. See [`docs/routing-spec-5.0.0.md`](https://github.com/han41858/badak/blob/main/docs/routing-spec-5.0.0.md) (Korean) for the full specification.

### Breaking changes

- **A request matches only one route per method.** Routes of the same method conflict if they have the same number of uri fragments and every uri fragment can match the same characters, regardless of the kind of routing (normal, `:`, `?`, `+`, `*`). A conflict throws `Conflicting routes for <METHOD>` when it is registered, regardless of the registration order. There is no priority between routes, normal routing doesn't win over `:` routing anymore.
- `**` routes are fallbacks, not compared with other routes. `**` routes of the same method and depth conflict if the parts before `**` can match the same path, and throw `Conflicting fallback routes for <METHOD> at depth <n>`.
- Every route matching the request path is found, not only the first one by priority, and the routing function is selected by the method. `405 Method Not Allowed` has the methods of all matched routes in the `Allow` header.
- `*` in a uri fragment is a wildcard : any characters, 0 or more. The character before it is literal. `ab*cd` matches `abcd` and `abXYZcd`, not `acd` and `aXcd`.
- `?`, `+` and `*` can be combined in a uri fragment, e.g. `ab?c+d`, `a*b*c`, `*abc`. Adjacent syntax characters (`ab??`, `ab?*`, `a**b`), `?` or `+` without a character before it, and `:` not at the beginning throw `invalid route '...'`.
- Static file routes of `static()` and `setSPARoot()` are checked in `listen()` with the other routes, at once. A conflict rejects `listen()` and nothing is registered partially. `listen()` after `stop()` doesn't duplicate the static cache.
- An `Error` whose message is a status text is not mapped to the status code : `new Error('Forbidden')` responds `500`, it responded `403` before. Errors of other libraries with such messages (e.g. `Error('Not Found')`) responded `4xx` without being logged as server errors. Use `HttpError`, e.g. `new HttpError(403)`. The removed messages are `Bad Request`, `Unauthorized`, `Unauthenticated`, `Forbidden`, `Not Found`, `no rule`, `Method Not Allowed`, `Not Acceptable` and `Payload Too Large`. ([#71](https://github.com/han41858/badak/pull/71))
  - a general `Error` thrown in `auth()` still responds `401` and is logged.
- Error messages of route registration are changed : `duplicated colon/question/plus/asterisk routing` and `duplicated question and plus routing` are `Conflicting routes for <METHOD>:` with both paths, and syntax errors are `invalid route '<uri fragment>' : <reason>`.

### Migration

| If you ... | 4.x | 5.0.0 | then |
|---|---|---|---|
| register `/users/me` and `/users/:id` | `me` wins | throws | move one of them (e.g. `/me`), or branch on `me` in the `:id` routing function |
| register `/files/readme` and `/files/*` | `readme` wins | throws | same as above |
| use `static('/', dir)` with a route like `/:slug` | the file wins | `listen()` rejects if a file name matches | move the static files under a path, or use `setSPARoot()` |
| register `/img/*` and `/img/:id` | `:id` wins | throws | keep one of them |
| register `/a/:id` and `/a/b+` (or `?`, `*`) | `b+` is never used | throws | remove the unused route |
| use `ab*cd` for `acd` or `aXcd` | matched | not matched | change the pattern, the character before `*` is literal |
| use `user1*` (4.x README example) for `user` | matched | not matched | use `user*` |
| use `*abc`, `a*b*c`, `ab?c+`, `ab?c*` | throws | registered | - |
| register `/a/:id/x` and `/a/b+/y` | `/a/bb/y` responds `404` | `/a/bb/y` -> `/a/b+/y` | check the routes |
| register `GET /a/:id` and `POST /a/b+` | `POST /a/bb` responds `405` | `POST /a/bb` -> `POST /a/b+` | check the routes |
| register `/users/:id/a` and `/users/:name/b` | throws | registered | - |
| register `/files/*` and `/files/**` | throws | registered | - |
| register `/ab*` and `/xy*` | throws | registered | - |
| check the error messages of route registration | `duplicated … routing` | `Conflicting routes for …` | change the expected messages |
| throw `new Error('Forbidden')` (or another status text) for a status code | `403` | `500` | throw `new HttpError(403)` |

## 4.1.0 (2026-10-22)

This release fixes request handling (multipart uploads blocking the server, `Content-Type` case, absolute-form request targets, client aborts) and the duplication check of `+` routing.
Some routing paths registered together in 4.0.0 throw when they are registered now, see [Routing duplication check](#routing-duplication-check).

### Routing duplication check

Routing paths that can match the same uri fragment throw when they are registered, regardless of the registration order. ([#62](https://github.com/han41858/badak/pull/62))

- `+` routing paths, e.g. `/aab+` and `/a+bb` for `/aabb`, throw `duplicated plus routing`. Only the shortest uri fragment of each `+` routing path (e.g. `aab` and `abb`) was compared before.
- a `?` routing path and a `+` routing path, e.g. `/colou?r` and `/colou+r` for `/colour`, throw `duplicated question and plus routing`. They were not compared before.
- `+` routing matches uri fragments without regular expressions, the duplication check and request matching use the same interpretation. Patterns like `a+a+a+…b` don't backtrack for long uri fragments.

**Routing paths registered together in 4.0.0 can throw now.** Cases that differ from 4.0.0 :

| Routing paths | 4.0.0 | 4.1.0 |
|---|---|---|
| `/aab+`, `/a+bb` (in this order) | registered, `GET /aabb` -> `/aab+` | throws `duplicated plus routing` |
| `/a+bb`, `/aab+` (in this order) | registered, `GET /aabb` -> `/a+bb` | throws `duplicated plus routing` |
| `/colou?r`, `/colou+r` (any order) | registered, `GET /colour` -> `/colou?r`, `/colou+r` is used only for `/colouur`, `/colouuur`, … | throws `duplicated question and plus routing` |
| `/ab?c`, `/ab+c` (any order) | registered, `GET /abc` -> `/ab?c`, `GET /abbc` -> `/ab+c` | throws `duplicated question and plus routing` |
| `/ab+c`, `/abbc` | throws `duplicated plus routing` | not changed |
| `/ab?c`, `/ab+d`, `/a+`, `/b+` | registered | not changed, patterns that don't overlap are registered together in any order |

This is classified as a bug fix, not a new restriction :

- the same rule is applied already for `?` routing (4.0.0, [#57](https://github.com/han41858/badak/pull/57)) and for `+` routing and normal routing. `+` & `+`, and `?` & `+` were the cases left out.
- the affected combinations were ambiguous : the route used for a request depended on the registration order (`+` & `+`), or one of the routes was never used for the overlapping uri fragments (`?` & `+`). Combinations without an overlapping uri fragment behave the same as 4.0.0.

To migrate, remove one of the routing paths, merge them into one routing function, or split them into patterns that don't overlap (e.g. `/colou?r` and `/colouu+r`).

### Fixed

- Files of `multipart/form-data` (`Buffer`) are not traversed when the request body is converted. Every byte of a file was visited before, even if `parseNumber` and `parseDate` are disabled, and the server was blocked for about 0.5 seconds per 1MB of uploaded files (seconds for a 10MB upload). ([#65](https://github.com/han41858/badak/pull/65))
  - only plain objects and arrays from the request (JSON, form, multipart fields) are traversed. The converted values are not changed.
- `Content-Type` of the request body is compared case-insensitively, e.g. `Application/JSON` is parsed as JSON. The request body was not parsed before, and `ctx.body` was `undefined`. ([#64](https://github.com/han41858/badak/pull/64))
- absolute-form request targets with `http` or `https` (e.g. `GET http://example.com/users/7 HTTP/1.1`) are routed by their path and query, without normalizing the path. They responded `404` before. ([#64](https://github.com/han41858/badak/pull/64))
  - other schemes (e.g. `ftp://`), an empty host (e.g. `http:///users/7`), userinfo (e.g. `http://user@host/`), and an invalid host or port respond `400`.
  - a request target with a fragment (`#`) responds `400`, in origin-form too. `/a#b` was routed to the literal `a#b` (usually `404`), and `/a?b=1#c` passed `{ b: '1#c' }` before.
  - `OPTIONS *` responds `404`, and other request targets not starting with `/` respond `400`.
- The client closing the connection while sending the request body (`ECONNRESET`) is not logged by `catchErrorLog`, and not passed to Node.js with `preventError: false`. It was logged as `badak catch error : Error: aborted`, and badak tried to respond `500` to the closed connection. `after()` functions still run, and `res.writableEnded` is `false` in them. ([#68](https://github.com/han41858/badak/pull/68))
  - only the abort while badak receives the request body is classified. Errors thrown by routing functions or middleware functions are logged and passed as before, even if the connection is closed and the error has a connection error code (e.g. `EPIPE`).
  - a request whose client closed the connection while an async `auth()` function ran waited forever, and `after()` functions didn't run. It is handled the same way now.

### Documentation

- `Usage` of README uses the 4.0.0 routing function signature (`ctx`), it showed the 3.x signature (`(user: User) => ...`). ([#66](https://github.com/han41858/badak/pull/66))
- `Examples` section in README : authentication and public routes, status code and headers, file upload, streaming response, API with a SPA, access log. ([#66](https://github.com/han41858/badak/pull/66))
- `sample/` is an example app with these examples, including CSV fields escaped by RFC 4180 and prefixed against formulas in spreadsheet programs. It is type-checked by `yarn test:types`, linted, and tested by `spec/sample.spec.ts`. ([#66](https://github.com/han41858/badak/pull/66))

### Others

- HTTP boundary condition tests : client aborts, chunked bodies, large headers, long paths, static path traversal, query strings, methods. ([#63](https://github.com/han41858/badak/pull/63))
- The npm publish workflow runs `yarn test:types` and `yarn test:types:dist` before publishing, same as CI. ([#67](https://github.com/han41858/badak/pull/67))
- The routing specification for 5.0.0 is in [`docs/routing-spec-5.0.0.md`](https://github.com/han41858/badak/blob/main/docs/routing-spec-5.0.0.md) (Korean). 4.1.0 doesn't change the routing by it.

## 4.0.0 (2026-10-22)

This release changes the first argument of routing functions to `ParamContext` (`{ params, query, body }`), and redefines `?` routing and non-ASCII / percent-encoded path matching.
Every route callback that reads the merged `param` object must be migrated, see [Breaking changes](#breaking-changes-1) and [Migration](#migration-1).

### Breaking changes

- Routing functions receive a `ParamContext` first argument (`{ params, query, body }`) instead of one merged `param` object. `params` and `query` are always objects; `body` is `undefined` when missing. Route captures remain strings, and the `parseNumber` / `parseDate` options continue to affect query and body only. Existing route callbacks must be migrated. ([#59](https://github.com/han41858/badak/pull/59))
- `?` routing is defined as "`?` makes the character just before it optional", and the duplication check and request matching use the same interpretation. ([#57](https://github.com/han41858/badak/pull/57))
  - `?` routing paths that can match the same uri fragment throw `duplicated question routing` when they are registered, regardless of the registration order.
  - other characters are literal. They were interpreted as a regular expression before.
  - `??`, and `?` with `+` or `*` in the same uri fragment, throw `invalid question route` when they are registered.
  - the priority with normal, `:`, `+`, `*` and `**` routing is not changed.
- Non-ASCII and percent-encoded paths are matched by decoded characters. ([#58](https://github.com/han41858/badak/pull/58))
  - the request path is split by real `/` first, then each uri fragment is decoded separately. `%2F` is a `/` in a uri fragment, not a separator.
  - a malformed percent-encoding in any uri fragment of the request path responds `400`.
  - percent-encoded characters in routing paths are decoded and literal. Different spellings of the same path (e.g. `/한글` and `/%ED%95%9C%EA%B8%80`) are one routing node, routing functions of different methods are merged. The same method registered again replaces the previous one, same as the same spelling.
  - `route()` merges keys of one rule object that make the same node, e.g. `{ '/b/c': { GET }, '/b': { c: { POST } } }`. The latter key replaced the node made by the former one before, and `GET /b/c` responded `405`.
  - `+` and `*` in a uri fragment interpret other characters literally, same as `?`. They were interpreted as a regular expression before.
  - `++`, `+` with `*`, more than one `*`, or `*` without a character before it in one uri fragment, and malformed percent-encoding in routing paths, throw when they are registered.
  - static file names are literal, they were interpreted as routing paths before.
  - the priority of routings, and the behavior for ASCII paths without special characters, are not changed.

Cases that differ from 3.0.0 :

| Routing paths | 3.0.0 | 4.0.0 |
|---|---|---|
| `/ab?c` and `/a?bc` | registered, `GET /abc` is handled by the one registered first | registering the second one throws |
| `/colou?r` and `/colo?ur` | registered, `GET /colour` is handled by the one registered first | registering the second one throws |
| `/a.c?` | matches `/abc`, `/axc` (`.` is any character) | matches `/a.c`, `/a.` only |
| `/a.c?` and `/abc` | registering the second one throws | registered, `GET /abc` is handled by `/abc` |
| `/ab(cd)?e` | matches `/abe`, `/abcde` (group) | matches `/ab(cd)e`, `/ab(cde` only |
| `/a[bc]?` | matches `/a`, `/ab`, `/ac` (character class) | matches `/a[bc]`, `/a[bc` only |
| `/a??`, `/ab?c+` | registered | throws when registered |
| `/a?*` | registered alone, but a request that reaches the pattern responds `500`, and registering a sibling route throws `SyntaxError` (invalid regular expression) | throws `invalid question route` when registered |
| `/한글` | doesn't match `GET /%ED%95%9C%EA%B8%80` (request uri fragments were compared without decoding) | matches |
| `GET /한글` and `POST /%ED%95%9C%EA%B8%80` | registered as different routes, `GET` responds `405` (`/한글` doesn't match encoded requests) | one routing node, both `GET` and `POST` are matched |
| `route({ '/b/c': { GET }, '/b': { c: { POST } } })` | `GET /b/c` responds `405`, the `/b` key replaced the node | both `GET` and `POST` are matched |
| `/lit/%2A` | matches `GET /lit/%2A` only | matches `GET /lit/*` and `GET /lit/%2A` (literal `*`) |
| a request with malformed percent-encoding, e.g. `GET /static/%E0%A4%A` | `404`, or matched by a normal route | `400` |
| `/a.+` | matches `/ab` (`.` is any character) | matches `/a.`, `/a..` only |
| `/a.b*` | matches `/axyz` | matches `/a.xyz` (prefix `a.` is literal) |
| `/a*b*c` | registered, `*` after the first one is a quantifier of regular expression | throws when registered |
| `/*abc` | registered, but never matched | throws when registered |
| `/100%`, `/%E0%A4%A` | registered, compared without decoding | throws when registered |
| static files `:c.txt` and `한글.txt` in a folder | `:c.txt` is registered as a colon route, every file request of the folder responds `:c.txt` | each file is served by its name |
| static files `a+b.txt`, `q?.txt`, `100%.txt` | interpreted as `+`, `?` routing, or not matched | served by their names |

### Added

- Route handlers support one named generic type argument, e.g. `app.post<{ body: User }>()`, `app.get<{ params: IdParams; query: PageQuery }>()`. Typed callbacks also work inside `route()` objects. These declarations do not validate requests at runtime. ([#60](https://github.com/han41858/badak/pull/60))
  - `params` values should be strings, same as the runtime values. Interfaces are supported.
  - keys other than `params`, `query` and `body` are compile errors.
  - `app.get()` and `app.delete()` can't declare `body`, the request body is not parsed for them.

### Others

- Consumer-facing strict TypeScript compile checks run with `yarn test:types` in CI.
- Consumer-facing type tests also run against the packed package (`.d.ts`) for ESM (`node16`, `nodenext`, `bundler`) and CJS with `yarn test:types:dist` in CI.

### Migration

| If you ... | then |
|---|---|
| access route captures from `param.id` | use `ctx.params.id` or destructure `{ params }` |
| read query values from `param.sort` | use `ctx.query.sort` |
| read parsed request body from `param.name` | use `ctx.body` (typed `unknown`, narrow or validate before use) |
| expect JSON array / primitive body to be passed directly as first argument | access the original value through `ctx.body` |
| rely on query/body values overriding route captures | read each independently from `ctx.params`, `ctx.query`, `ctx.body` |
| register `?` routing paths that match the same uri fragment | remove one of them, or merge them into one routing function |
| use regular expression syntax in `?` routing paths (e.g. `(cd)?`, `[bc]`, `.`) | register each path separately, or use `:` routing and check the value in the routing function |
| use `??`, or `?` with `+` or `*` in one uri fragment | split the routing path into simple patterns |
| register the same path & method in different spellings (e.g. `GET /한글` and `GET /%ED%95%9C%EA%B8%80`) | keep one of them, the latter replaces the former now |
| use regular expression syntax in `+` or `*` routing paths, or more than one `*` in a uri fragment | register each path separately, or use `:` routing and check the value in the routing function |
| use `%` in a routing path | encode it as `%25` |
| expect `404` for a malformed percent-encoding in the request path | expect `400` |

## 3.0.0 (2026-10-21)

This release fixes the routing rules of `**` and `*`.
`setSPARoot()` serves static files and other routes now, they responded `index.html` before.
The public API is not changed, but some requests are handled by a different route, see [Breaking changes](#breaking-changes-2) and [Migration](#migration-2).

### Breaking changes

- `**` is a fallback. It is used only if the request path doesn't match other routes fully, and the deepest `**` along the matched path is used. `**` took precedence over sibling routes before. ([#53](https://github.com/han41858/badak/pull/53))
  - with `setSPARoot()`, static files (e.g. `/style.css`) and other routes (e.g. `/api/users`) are handled by their own routes. They responded `index.html` before.
  - e.g. with `/files/**` and `/files/x`, `GET /files/x` is handled by `/files/x`, and `GET /files/x/y` by `/files/**` with `{ '**': 'x/y' }`.
  - if the path matches a route fully but the method is not registered, it responds `405` without using `**`.
  - the result doesn't depend on the registration order.
- `*` matches exactly one uri fragment. `/img/*` doesn't match `/img` and `/img/` (`{ '*': 'img' }` before). ([#53](https://github.com/han41858/badak/pull/53))
  - with `/img` and `/img/*`, `GET /img` is handled by `/img`. It was handled by `/img/*` before.
- The `**` param of `**` routing is the rest of the path, e.g. `{ '**': 'a/b/c' }` for `/files/a/b/c` of `/files/**`. It was the uri fragment before `**` (`'files'`). ([#52](https://github.com/han41858/badak/pull/52))
  - each uri fragment is decoded and joined with `/`, so a malformed percent-encoding in the rest of the path responds `400`.
- A routing path with `**` not at the end (e.g. `/files/**/edit`) throws an error when it is registered. It was registered, but never matched. ([#52](https://github.com/han41858/badak/pull/52))
- The priority of normal, `:`, `?` and `+` routing, and `**` matching 0 or more uri fragments, are not changed.

### Others

- The TypeScript source (`src/`) and declaration maps (`.d.ts.map`) are published with the package. ([#51](https://github.com/han41858/badak/pull/51))
  - "Go to Definition" in editors (tsserver) opens the TypeScript source instead of `.d.ts`, for both `import` and `require`.
  - files referred by source maps exist in the package, so debuggers can show the TypeScript source. Stack traces with `node --enable-source-maps` point to existing files.
  - the package size is about 74kB (it was about 52kB).
- `badak.ts` is split into `router.ts`, `body-parser.ts`, `response.ts` and `static.ts`, without behavior change. ([#48](https://github.com/han41858/badak/pull/48), [#49](https://github.com/han41858/badak/pull/49), [#50](https://github.com/han41858/badak/pull/50))

### Migration

| If you ... | then |
|---|---|
| handle `/img` (or `/img/`) with `/img/*` | register `/img` separately, e.g. `app.get('/img', fnc)` |
| expect `**` to take precedence over other routes on the same level | remove the other routes, or move them to another path |
| read `param['**']` | it is the rest of the path now, e.g. `'a/b/c'` for `/files/a/b/c` of `/files/**` |
| register a path with `**` in the middle (e.g. `/files/**/edit`) | remove it, it never matched; use `/files/**` and check `param['**']` in the routing function |
| use `setSPARoot()` and expect `index.html` for a path of a static file or another route | nothing to do in most cases, the static file or the route responds now |

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
Several fixes change existing behavior, see [Breaking changes](#breaking-changes-3) and [Migration](#migration-3) first.

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
