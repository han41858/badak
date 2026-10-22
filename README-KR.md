![npm](https://img.shields.io/npm/v/badak?logo=npm)
![NPM Last Update](https://img.shields.io/npm/last-update/badak)

![logo](https://github.com/han41858/badak/raw/main/docs/logo/badak_200.png)

# badak

![TypeScript](https://img.shields.io/badge/TypeScript-black?color=3178C6&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/node.js-black?color=5FA04E&logo=nodedotjs&logoColor=white)

badak은 Promise, TypeScript 기반으로 개발된 백엔드 프레임워크입니다.

> badak은 TypeScript로 작성되었으며 JavaScript 코드로 컴파일되어 배포됩니다.
> 따라서 TypeScript 문법으로 사용할 수도 있고 JavaScript 문법으로 사용할 수도 있습니다.

## 설치방법

badak은 npm으로 배포되며 npm/yarn 으로 설치할 수 있습니다.

```bash
npm install badak
# 또는
yarn add badak
```

## 사용방법

```typescript
import { Badak, HttpError } from 'badak';

interface User {
	id: string;
	name: string;
}

const users: Map<string, User> = new Map();
const app: Badak = new Badak();

// 반환값이 응답이 됩니다 : 객체 -> JSON, 문자열 -> 텍스트
await app.get('/users', () => [...users.values()]);

// 경로 파라미터 타입 지정, 예: GET /users/7 -> params.id === '7'
await app.get<{ params: { id: string } }>('/users/:id', ({ params }) => {
	const user: User | undefined = users.get(params.id);

	if (user === undefined) {
		throw new HttpError(404);
	}

	return user;
});

// POST, PUT, PATCH 요청 본문을 파싱합니다 (JSON, form, multipart)
// 검증은 하지 않으므로 사용 전에 확인해야 합니다
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

라우팅 함수는 `ctx`(`{ params, query, body }`)와 Node.js의 `req`, `res`를 인자로 받습니다. [라우팅 인자](#라우팅-인자)를 참고하세요.
인증, 파일 업로드, 스트리밍, SPA는 [예제](#예제)를 참고하세요.

## 메서드

### `new Badak(option?: Partial<BadakOption>)`

badak 인스턴스를 생성합니다. 생성자로 옵션을 전달할 수 있습니다.

```typescript
const app: Badak = new Badak();

const appWithLog: Badak = new Badak({
	catchErrorLog: true
});
```

### `auth(fnc: MiddlewareFunction): Promise<void>`

인증용 미들웨어 함수를 지정합니다. 인증 함수는 하나만 지정할 수 있습니다.
인증 미들웨어로 등록된 함수는 `before()` 이후에, 요청 본문을 받고 라우팅 함수를 실행하기 전에 실행됩니다.
그래서 `bodyLimit`가 큰 라우트라도 인증되지 않은 요청은 본문을 받지 않고 거절합니다.
인증 미들웨어 함수에서 오류가 발생하면 `401 Unauthorized` 에러가 발생합니다.
`HttpError`를 던지면 그 상태 코드로 응답합니다(예: `throw new HttpError(403)`).

이 함수나 `before()`에서 요청 본문(`req`)을 읽지 마세요. 본문을 이미 읽었으면 badak은 `500 Internal Server Error`로 응답합니다.

### `before(fnc: MiddlewareFunction): Promise<void>`

라우팅 함수가 실행되기 전에 실행할 미들웨어 함수를 등록합니다.
미들웨어 함수는 여러개를 지정할 수 있으며, 지정한 순서와 관계없이 병렬로 실행됩니다.
`listen()` 전에 호출해야 합니다.

미들웨어 함수에서 에러가 발생하면(거부된 Promise를 반환하는 경우 포함) 라우팅 함수는 실행되지 않으며,
라우팅 함수에서 에러가 발생했을 때와 같은 방식으로 에러 상태 코드로 응답합니다.
예를 들어 `throw new HttpError(403)`은 `403 Forbidden`으로, 그 외의 에러는 `500 Internal Server Error`로 응답합니다.
미들웨어 함수가 직접 응답한 경우(`res.end()` 등)에도 라우팅 함수는 실행되지 않습니다.

### `after(fnc: MiddlewareFunction): Promise<void>`

라우팅 함수가 실행된 후에 실행할 미들웨어 함수를 등록합니다.
미들웨어 함수는 여러개를 지정할 수 있으며, 지정한 순서와 관계없이 병렬로 실행됩니다.
`listen()` 전에 호출해야 합니다.

`after()` 함수는 클라이언트가 응답 전에 연결을 끊은 경우에도 모든 요청에 대해 실행됩니다.
요청 본문을 보내는 중 클라이언트가 연결을 끊으면 라우팅 함수는 실행되지 않고 응답도 보내지 않으며, `after()` 함수에서 `res.writableEnded`는 `false`입니다.

### `config(key: string, value: unknown): Promise<void>`

badak 앱이 실행되는 동작을 조정합니다. 키는 [`BadakOption`](#badakoption)과 같습니다 : `catchErrorLog`, `preventError`, `defaultMethod`, `parseNumber`, `parseDate`, `bodyLimit`.
알 수 없는 키나 잘못된 값은 에러가 발생합니다.

```typescript
await app.config('parseNumber', true);
await app.config('bodyLimit', 1024 * 1024);
```

### `listen(port: number): Promise<void>`

서버 응답을 시작합니다.
`static()`과 `setSPARoot()`의 파일을 이때 불러와 라우트로 등록하며, 다른 라우트와 충돌하는지 검사합니다([요청 하나에 라우트 하나](#요청-하나에-라우트-하나) 참고).
정적 파일 라우트가 충돌하면 `listen()`이 실패하고 서버는 시작하지 않습니다.

### `isRunning(): boolean`

서버가 실행중인지 확인하고 결과값을 반환합니다.
초기 상태는 `false` 이며, `listen()` 함수가 실행된 이후에 `true`가 되고, `stop()`으로 종료한 후에는 `false`가 됩니다.

### `getHttpServer(): Server | undefined`

HTTP 서버 인스턴스를 반환합니다.
Badak 내부 멤버에 접근할 때 사용합니다.

### `stop(timeout?: number): Promise<void>`

HTTP 서버를 정지합니다.
새 연결을 받지 않고, 유휴 상태인 keep-alive 연결을 닫은 뒤, 처리 중인 요청이 끝날 때까지 기다립니다.

`timeout`(ms)을 지정하면 이 시간이 지난 뒤 남은 연결을 강제로 닫습니다.
`timeout`은 `0`부터 `2147483647`(약 24.8일, Node.js 타이머의 한계)까지의 정수이거나, 제한 없이 기다리는 `Infinity`여야 합니다.
롱 폴링이나 Server-Sent Events처럼 오래 유지되는 응답이 있으면 `stop()`이 끝나지 않으므로 이 값을 지정하세요.

### `route(rule: RouteRule): Promise<void>`

라우팅 함수를 등록합니다.
규칙 객체의 라우트를 모두 먼저 검사하고, 다른 라우트와 충돌하는 것이 없을 때만 등록합니다([요청 하나에 라우트 하나](#요청-하나에-라우트-하나) 참고).
`listen()` 후에도 라우트를 등록할 수 있습니다.

요청 경로와 일치하는 라우팅 규칙은 있지만 요청 메서드에 해당하는 라우팅 함수가 없으면,
`405 Method Not Allowed`와 함께 사용할 수 있는 메서드 목록을 `Allow` 헤더로 응답합니다.
일치하는 경로가 없으면 `404 Not Found`로 응답합니다.

### `get(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

`GET` 메서드 요청에 반응하는 라우팅 함수를 등록합니다.
`HEAD` 요청도 이 라우팅 함수로 처리하며, 본문 없이 헤더만 응답합니다.

### `post(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

`POST` 메서드 요청에 반응하는 라우팅 함수를 등록합니다.

### `put(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

`PUT` 메서드 요청에 반응하는 라우팅 함수를 등록합니다.

### `delete(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

`DELETE` 메서드 요청에 반응하는 라우팅 함수를 등록합니다.

### `patch(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

`PATCH` 메서드 요청에 반응하는 라우팅 함수를 등록합니다.
요청 본문은 `POST`, `PUT`과 같은 방식으로 파싱합니다.

### `static(uri: string, path: string, option?: StaticOption): Promise<void>`

정적 파일로 제공할 주소와 파일 경로를 연결합니다.

`Content-Type`은 파일 확장자로 결정합니다.
알 수 없는 확장자이거나 확장자가 없는 파일은 파일 시그니처(예: PNG)로 판별하고, 그래도 알 수 없으면 `application/octet-stream`으로 응답합니다.
텍스트 파일(`text/*`)과 JavaScript 파일은 `charset=utf-8`로 응답하므로 UTF-8로 저장해야 합니다.

파일은 `listen()`을 실행할 때 메모리에 올라가므로, 파일을 바꾸면 `stop()` 후 `listen()`을 다시 호출해야 반영됩니다. 그 사이 삭제된 파일은 더 이상 제공하지 않습니다.

정적 파일은 `ETag`(파일 내용 기준)와 `Last-Modified`(파일 수정 시각 기준)를 함께 응답하며,
요청의 `If-None-Match`나 `If-Modified-Since`가 일치하면 본문 없이 `304 Not Modified`로 응답합니다.
`If-None-Match`가 있으면 `If-Modified-Since`는 무시하며, 문법이 잘못된 `If-None-Match`는 일치하지 않는 것으로 처리합니다.

`Cache-Control`은 기본값이 `no-cache`입니다. 브라우저는 파일을 캐싱하되, 사용할 때마다 변경 여부를 확인합니다.
`cacheControl`로 바꿀 수 있습니다.

```typescript
// 이름에 해시가 들어간 파일, 예: main.3f2a1b.js
await app.static('/assets', '/var/www/assets', { cacheControl: 'public, max-age=31536000, immutable' });

// Cache-Control 헤더 없음, ETag와 Last-Modified는 그대로 응답
await app.static('/public', '/var/www/public', { cacheControl: false });
```

| 옵션 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `cacheControl` | `string \| false` | `'no-cache'` | `Cache-Control` 헤더 값, `false`면 헤더를 보내지 않음 |

### `setSPARoot(uri: string, path: string, option?: StaticOption): Promise<void>`

SPA 앱으로 사용할 주소와 파일 경로를 연결합니다.
지정된 폴더 안에 있는 파일은 `static()`과 같은 방식으로 정적으로 제공되며, 캐싱됩니다.
`option`은 `static()`과 같습니다.

## 에러 응답

### `HttpError`

라우팅 함수나 미들웨어 함수에서 `HttpError`를 던지면 지정한 상태 코드로 응답합니다.

```typescript
import { HttpError } from 'badak';

app.get('/admin', () => {
	throw new HttpError(403); // 403, 'Forbidden'
});

app.post('/users', () => {
	// 객체 본문은 JSON으로 응답합니다.
	throw new HttpError(422, { body: { field: 'email', reason: 'invalid' } });
});

app.get('/limited', () => {
	throw new HttpError(429, { headers: { 'Retry-After': 60 } });
});
```

- `status` : `400`부터 `599`까지의 정수입니다.
- `option.body` : 응답 본문입니다. 문자열은 텍스트로, `Buffer`는 바이너리로, 그 외의 값(객체, 배열, 숫자, 불리언)은 JSON으로 응답합니다.
  생략하거나 `null`이거나 직렬화할 수 없는 값(순환 참조 등)이면 상태 문구(예: `Forbidden`)로 응답합니다.
- `option.headers` : 응답 헤더입니다. 여기에 지정한 `Content-Type`은 그대로 유지합니다.
- `option.cause` : 로그용 원본 에러입니다.

그 외의 에러는 에러 메시지 없이 `500 Internal Server Error`로 응답합니다.
에러 메시지를 상태 코드로 바꾸지 않습니다. `new Error('Forbidden')`은 `500`으로 응답하므로 `new HttpError(403)`을 사용하세요(5.0.0에서 변경).

어떤 값이 `HttpError`인지는 `isHttpError(value)`로 확인할 수 있습니다.

## 인터페이스

### `MiddlewareFunction`

```typescript
export type MiddlewareFunction = (req: IncomingMessage, res: ServerResponse, responseBody?: unknown) => void | Promise<void>;
```

`before()`, `after()`에 등록하는 함수입니다.
미들웨어 함수는 라우팅 함수에 전달되는 인자를 변경할 수 없습니다.

### `RouteFunction`

```typescript
export type RouteFunction = (ctx: ParamContext, req: IncomingMessage, res: ServerResponse) => unknown | Promise<unknown>;
```

HTTP 요청에 반응할 라우팅 함수를 등록합니다.
라우팅 함수가 반환한 값은 HTTP 응답으로 반환됩니다.

| 반환값 | 응답 |
|---|---|
| `string` | 텍스트 (`text/plain; charset=utf-8`) |
| `Buffer` | 바이너리, `Content-Type`은 파일 시그니처로 판별 |
| 객체, 배열, 숫자, 불리언, `null` | JSON (`application/json`), 객체 안의 `Buffer`는 base64 |
| `undefined` (반환값 없음) | 빈 본문 |

JSON으로 직렬화할 수 없는 값(순환 참조, `BigInt` 등)을 반환하면 `500 Internal Server Error`로 응답합니다.

라우팅 함수가 `Readable` 스트림을 반환하면 badak이 응답으로 pipe합니다.
라우팅 함수가 `Content-Type`을 지정하지 않으면 `application/octet-stream`으로 응답합니다.

```typescript
import { createReadStream } from 'node:fs';

app.get('/download', (_ctx, req, res) => {
	res.setHeader('Content-Type', 'application/pdf');
	return createReadStream('/path/to/file.pdf');
});
```

데이터를 보내기 전에 스트림에서 에러가 나면 `500 Internal Server Error`로 응답합니다.
데이터를 보내는 도중에 에러가 나면 클라이언트가 응답이 불완전하다는 것을 알 수 있도록 연결을 끊습니다.

### `BadakOption`

badak 앱의 동작 방식을 지정합니다.

#### `catchErrorLog: boolean`

에러가 발생하면 콘솔에 로그를 출력합니다.

- 기록함 : `5xx` `HttpError`, 그리고 `auth()` 함수에서 발생한 에러를 포함한 `Error` 등 그 외의 에러
- 기록하지 않음 : `4xx` `HttpError`, 그리고 badak이 만드는 `404 Not Found`, `405 Method Not Allowed`,
  `400 Bad Request`(잘못된 본문), `413 Payload Too Large` 같은 `4xx` 응답. 의도된 클라이언트 에러 응답이기 때문입니다.
- 기록하지 않음 : 요청 본문을 보내는 중 클라이언트가 연결을 끊은 경우 등(`ECONNRESET`). 서버 에러가 아니고, 응답할 수도 없기 때문입니다.

기본값은 `true` 입니다.

#### `preventError: boolean`

요청을 처리하다 발생한 에러를 badak 안에서 처리할지 지정합니다.

- `true` : badak이 에러를 잡아 에러 상태 코드로 응답합니다. 서버는 계속 동작합니다.
- `false` : badak이 에러 상태 코드로 응답한 뒤, 에러를 다시 던집니다.
  에러는 요청 처리 함수 안에서 던져지므로 처리되지 않은 Promise 거부(unhandled rejection)가 되고,
  Node.js 기본 설정(`--unhandled-rejections=throw`)에서는 프로세스가 종료됩니다.
  프로세스 매니저가 재시작해 주는 환경처럼, 에러가 나면 프로세스를 멈추고 싶을 때(fail-fast)만 사용하세요.

기본값은 `true` 입니다.

#### `defaultMethod: METHOD | undefined`

라우팅에 사용할 기본 HTTP 메서드 타입을 지정합니다.
이 값을 지정하면 `Badak.route()` 메서드를 사용할 때 HTTP 메서드 지정을 생략할 수 있습니다.

- 지정 전 :

```typescript
app.route({
	users: {
		GET: getUserList
	}
});
```

- `app.config('defaultMethod', 'GET')` 지정 후 :

```typescript
app.route({
	users: getUserList
});
```

#### `parseNumber: boolean`

인자로 전달되는 문자열 형태의 숫자를 `number` 타입으로 변환합니다.
`5`, `-1.5` 같은 일반 10진수만 변환합니다.
`007`(앞자리 0), `1e3`, `0x10`, ` 5`(공백 포함), 안전한 정수 범위를 넘는 정수는 문자열로 두므로 우편번호나 ID 같은 값이 바뀌지 않습니다.
모든 HTTP 메서드의 쿼리 문자열과 `POST`/`PUT`/`PATCH` 요청의 본문에 적용되며, `:id` 같은 라우트 파라미터에는 적용되지 않습니다.

기본값은 `false` 입니다.

#### `parseDate: boolean`

인자로 전달되는 문자열 형태의 날짜를 `Date` 타입으로 변환합니다.
모든 HTTP 메서드의 쿼리 문자열과 `POST`/`PUT`/`PATCH` 요청의 본문에 적용되며, `:id` 같은 라우트 파라미터에는 적용되지 않습니다.

기본값은 `false` 입니다.

#### `bodyLimit: number`

요청 본문의 최대 크기를 바이트 단위의 양의 정수로 지정합니다.
요청 본문이 이 값보다 크면 `413 Payload Too Large` 에러가 발생합니다.
`multipart/form-data`는 파트 헤더와 구분자를 포함한 요청 본문 전체 크기로 계산하므로,
파일 업로드를 받는다면 이 값을 늘려야 합니다.
제한을 없애려면 `Infinity`를 지정합니다.
파일 업로드처럼 특정 라우트에서만 더 큰 본문을 허용하려면 `RouteOption`의 `bodyLimit`를 사용합니다.

기본값은 `102400`(100KB) 입니다.

### `RouteOption`

라우팅 함수의 동작을 결정합니다.

#### `auth: boolean`

`false`로 지정하면 이 라우팅 함수가 실행될 때 `auth()` 함수를 실행하지 않습니다.

기본값은 `true` 입니다.

#### `bodyLimit: number`

이 라우팅 함수의 요청 본문 최대 크기를 바이트 단위로 지정하며, 앱 옵션의 `bodyLimit` 대신 사용합니다.
값은 앱 옵션의 `bodyLimit`와 같습니다. 양의 정수를 지정하거나, 제한을 없애려면 `Infinity`를 지정합니다.
요청 본문을 파싱하는 `POST`, `PUT`, `PATCH`에 적용됩니다.

```typescript
const app: Badak = new Badak({ bodyLimit: 100 * 1024 }); // 다른 라우트는 100KB

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

`auth()` 함수는 요청 본문을 받기 전에 실행되므로, 인증되지 않은 요청은 이 한도까지 본문을 받지 않고 거절합니다.

## 특수 라우팅

`route()`나 `get()`, `post()`, `put()`, `patch()`, `delete()` 함수의 경로에 특수 라우팅을 사용할 수 있습니다.
**요청 하나에 매칭되는 라우트는 METHOD마다 하나뿐입니다.** 같은 요청 경로에 매칭될 수 있는 라우트를 등록하면 에러가 발생합니다. [요청 하나에 라우트 하나](#요청-하나에-라우트-하나)를 참고하세요.
전체 명세는 [`docs/routing-spec-5.0.0.md`](https://github.com/han41858/badak/blob/main/docs/routing-spec-5.0.0.md)에 있습니다.

| 패턴 | 의미 | 매칭 | 매칭 안 됨 |
|---|---|---|---|
| `users` | 문자 그대로 | `users` | `user` |
| `:id` | 경로 조각 하나, 문자 1개 이상 | `7`, `me` | |
| `*` | 경로 조각 하나, 문자 1개 이상 | `a.png` | |
| `ab?cd` | `?` 바로 앞 문자 0~1번 | `acd`, `abcd` | `abbcd` |
| `ab+cd` | `+` 바로 앞 문자 1번 이상 | `abcd`, `abbcd` | `acd` |
| `ab*cd` | `ab`와 `cd` 사이에 아무 문자 0개 이상 | `abcd`, `abXYZcd` | `acd`, `aXcd` |
| `*.png` | 아무 문자 다음에 `.png` | `a.png` | `a.jpg` |
| `**` | 나머지 경로 전체, 폴백 | | |

- `?`, `+`는 바로 앞 문자 하나에 적용됩니다. `*`는 와일드카드이며 앞 문자에 적용되지 않습니다.
- 한 경로 조각에서 함께 쓸 수 있습니다. 예: `ab?c+d`, `a*b*c`, `*abc`.
- 잘못된 패턴은 등록할 때 `invalid route '...'` 에러가 발생합니다. 앞 문자 없는 `?`, `+`(`?abc`), 연속된 문법 문자(`ab??`, `ab?*`, `a**b`), 맨 앞이 아닌 `:`(`ab:id`)가 해당합니다.
- 다른 문자는 정규식에서 특별한 의미가 있는 문자(예: `.`, `(`, `)`)를 포함해 모두 문자 그대로 취급합니다. `/a.c?`는 `/a.c`와 `/a.`에 매칭되며, `/abc`에는 매칭되지 않습니다.
- 퍼센트 인코딩된 문자는 항상 문자 그대로입니다. `/a%2Ab`는 `/a*b`(또는 `/a%2Ab`)에만 매칭되고, `%2A%2A`는 폴백이 아닌 일반 경로 조각 `**`입니다.
- 매칭된 경로 조각은 `ctx.params`에 전달됩니다. `:` 라우팅은 이름(`{ id: '7' }`), `*`는 `'*'`, 그 밖에는 라우팅 패턴(`{ 'ab*cd': 'abXcd' }`)이 키입니다.

### `:` 라우팅

`/:userId`로 라우팅 경로를 지정하고 `/user1`로 HTTP 요청을 보내면, 요청이 매칭되며 라우팅 함수의 `ctx.params`에 `{ userId: 'user1' }`이 전달됩니다.

### `*` 라우팅

경로 조각 전체가 `*`이면 경로 조각을 정확히 하나 매칭하며, 값은 `ctx.params['*']`로 전달됩니다.

```typescript
await app.get('/img/*', ({ params }) => params);

// GET /img/a.png -> { '*': 'a.png' }
// GET /img, /img/, /img/a/b -> 404
```

### `**` 라우팅

`**`는 `/`를 포함해 나머지 경로 전체에 매칭됩니다.
나머지 경로는 `ctx.params['**']`로 전달되며, 경로 조각을 각각 디코딩한 뒤 `/`로 이어 붙인 값입니다.

```typescript
await app.get('/files/**', ({ params, query }) => ({ params, query }));

// GET /files/a/b%20c/d.txt -> { params: { '**': 'a/b c/d.txt' }, query: {} }
// GET /files/a/b?c=1       -> { params: { '**': 'a/b' }, query: { c: '1' } }
```

- `**`는 라우팅 경로의 마지막 경로 조각이어야 합니다. `/files/**/edit` 같은 경로는 등록할 때 에러가 발생합니다.
- 경로 조각 안의 `%2F`도 `/`로 디코딩되므로, `/files/a%2Fb`와 `/files/a/b`는 같은 값을 전달합니다.
- 나머지 경로에 잘못된 퍼센트 인코딩이 있으면 `400 Bad Request`로 응답합니다.
- `**`는 경로 조각 0개 이상에 매칭됩니다. `/files/**`는 `/files`, `/files/`, `/files/a`, `/files/a/b`에 매칭되며, `/files`와 `/files/`의 `**`는 `''`입니다. `/**`는 `/`에도 매칭됩니다.
- `**`는 폴백입니다. 요청 경로가 다른 라우트에 완전히 매칭되지 않을 때만 사용합니다. [요청 하나에 라우트 하나](#요청-하나에-라우트-하나)를 참고하세요.

### 요청 하나에 라우트 하나

METHOD가 같은 라우트는 경로 조각 수가 같고 모든 위치의 경로 조각이 같은 문자열에 매칭될 수 있으면 충돌합니다.
충돌하면 등록 순서와 관계없이 두 번째 라우트를 등록할 때 `Conflicting routes for <METHOD>` 에러가 발생합니다. 라우트 사이에 우선순위는 없습니다.

| 라우트 | 결과 |
|---|---|
| `GET /users/me`, `GET /users/:id` | 충돌, 둘 다 `/users/me`에 매칭 |
| `GET /img/*`, `GET /img/:id` | 충돌 |
| `GET /abc`, `GET /ab+c` | 충돌, 둘 다 `/abc`에 매칭 |
| `GET /ab*cd`, `GET /ab%2Acd` | 충돌, 둘 다 `/ab%2Acd`(`ab*cd`)에 매칭 |
| `GET /a/:id/details`, `GET /a/b+/settings` | 등록됨, 마지막 경로 조각이 겹치지 않음 |
| `GET /users/:id/a`, `GET /users/:name/b` | 등록됨 |
| `GET /a/:id`, `POST /a/b+` | 등록됨, METHOD가 다름 |
| `GET /users/:id`, `GET /users/:id` | 다시 등록, 나중 것으로 교체 |

요청 경로에 매칭되는 라우트를 첫 번째 것만이 아니라 모두 찾고, METHOD로 라우팅 함수를 고릅니다.
경로에 매칭되는 라우트는 있지만 해당 METHOD가 없으면, 매칭된 라우트 전체의 METHOD를 `Allow` 헤더에 담아 `405 Method Not Allowed`로 응답합니다.

```typescript
await app.get('/a/:id', getFnc);
await app.post('/a/b+', postFnc);

// GET  /a/bb -> getFnc, { id: 'bb' }
// POST /a/bb -> postFnc, { 'b+': 'bb' }
// PUT  /a/bb -> 405, Allow: GET, HEAD, POST
```

`**` 라우트는 다른 라우트와 비교하지 않습니다. 요청 경로가 라우트에 완전히 매칭되지 않을 때만 사용하며, 가장 깊은 것을 사용합니다.
METHOD와 깊이(`**` 앞의 경로 조각 수)가 같은 `**` 라우트는 `**` 앞부분이 같은 경로에 매칭될 수 있으면 충돌합니다. 예를 들어 `/a/:id/**`와 `/a/b+/**`는 `Conflicting fallback routes for GET at depth 2` 에러가 발생합니다.

예를 들어 `setSPARoot('/')`(`/**`)를 쓰면, `/style.css`와 `/api/users`는 각자의 라우트가 처리하고 그 밖의 경로는 `index.html`로 응답합니다.

```typescript
await app.get('/**', spaFnc);
await app.get('/api/users', usersFnc);
await app.get('/api/users/:id', userFnc);

// GET /api/users     -> usersFnc
// GET /api/users/7   -> userFnc, { id: '7' }
// GET /api/users/7/x -> spaFnc, { '**': 'api/users/7/x' }
// GET /api           -> spaFnc, { '**': 'api' }
```

경로가 라우트에 완전히 매칭되지만 해당 METHOD의 라우팅 함수가 없으면, `**`를 사용하지 않고 `405 Method Not Allowed`로 응답합니다.

`static()`과 `setSPARoot()`의 정적 파일 라우트는 `listen()`에서 등록되며 같은 방식으로 검사합니다. 예를 들어 `style.css`가 있는 `static('/', dir)`은 `GET /:slug`와 충돌합니다.
충돌하면 `listen()`이 실패하고 서버는 시작하지 않습니다. 일부만 등록되지 않습니다.

### 비ASCII 경로와 퍼센트 인코딩

라우팅 경로에 비ASCII 문자를 사용할 수 있습니다(예: `/사용자/:id`).

- 요청 경로는 먼저 `/`로 나눈 뒤, 각 경로 조각을 따로 디코딩합니다.
  그래서 `%2F`는 경로 구분자가 아니라 경로 조각 안의 `/` 문자입니다. `/files/:id`는 `/files/a%2Fb` 요청에 `{ id: 'a/b' }`를 전달하며, `/files/a/b`에는 매칭되지 않습니다.
- 요청 경로에 잘못된 퍼센트 인코딩이 있으면 `400 Bad Request`로 응답합니다.
- 라우팅 경로의 퍼센트 인코딩된 문자는 디코딩해서 매칭하므로, `/한글`과 `/%ED%95%9C%EA%B8%80`은 같은 경로입니다.
  두 경로는 하나의 라우팅 노드이므로, 서로 다른 메서드의 라우팅 함수는 병합됩니다(예: `GET /한글`과 `POST /%ED%95%9C%EA%B8%80`).
  같은 메서드를 다시 등록하면 같은 표기로 다시 등록할 때와 마찬가지로 이전 함수를 대체합니다.
- 라우팅 경로의 퍼센트 인코딩된 문자는 항상 문자 그대로 취급하며, 라우팅 문법이 되지 않습니다.
  예를 들어 `/%2A`는 `/*`(또는 `/%2A`)에만, `/colou%3Fr`는 `/colou%3Fr`에만, `/%3Aid`는 `/:id`에만 매칭됩니다.
- 라우팅 경로에 잘못된 퍼센트 인코딩(예: `/100%`)이 있으면 등록할 때 에러가 발생합니다. `%`는 `%25`로 씁니다.
- 정적 파일 이름은 문자 그대로 취급합니다. `한글.txt`, `a+b.txt`, `100%.txt` 같은 파일도 이름 그대로 제공됩니다.

## 요청 데이터 제네릭 타입

하나의 이름 있는 타입 인자로 필요한 항목만 지정할 수 있습니다. 지정하지 않은 항목은 기본 타입을 유지합니다.

```typescript
interface User { name: string }
interface IdParams { id: string }

await app.post<{ body: User }>('/users', ({ body }) => body.name);
await app.get<{ params: IdParams }>('/users/:id', ({ params }) => params.id);
```

**제네릭 타입 선언은 런타임 데이터 검증이 아닙니다.** 외부 HTTP 입력은 사용 전에 검증해야 합니다. 타입 지정 핸들러는 `app.route()`에서도 등록할 수 있습니다.

- 허용 키는 `params`, `query`, `body`입니다. 그 밖의 키(예: 오타 `bdy`)는 올바른 키와 함께 써도 컴파일 오류가 발생합니다.
- 경로 파라미터는 항상 디코딩된 문자열이므로(`parseNumber`, `parseDate`도 적용되지 않음) `params`의 값은 문자열이어야 합니다. `{ params: { id: number } }`는 컴파일 오류입니다. `interface IdParams { id: string }` 같은 인터페이스와 `{ id?: string }` 같은 선택적 키는 사용할 수 있습니다.
- `params`는 이름 있는 경로 파라미터의 객체여야 하며, 배열은 지정할 수 없습니다.
- `query`는 객체여야 하며, `body`는 어떤 타입이든 지정할 수 있습니다.
- `GET`과 `DELETE`는 요청 본문을 파싱하지 않으므로(`ctx.body`는 항상 `undefined`) `app.get()`과 `app.delete()`에는 `body`를 지정할 수 없습니다. `body`를 선언한 핸들러를 따로 만들어 전달해도 컴파일 오류가 발생합니다. 단, `app.route()`에 등록하는 핸들러는 이 검사를 하지 않습니다.

선언한 타입은 런타임 값과 비교하지 않습니다. 실제 값은 다음과 같습니다.

- `query`의 값은 문자열이며, 같은 키가 반복되면 문자열 배열입니다(예: `?page=2&page=3` -> `['2', '3']`). `parseNumber`나 `parseDate`를 켠 경우에만 숫자나 `Date`가 됩니다. `{ query: { page: number } }`로 선언해도 값이 변환되지는 않습니다.
- `POST`, `PUT`, `PATCH` 요청에 본문이 없으면, `body`를 선언했더라도(예: `{ body: User }`) `body`는 `undefined`입니다.

## 라우팅 인자

라우팅 함수의 첫 번째 인자인 `ParamContext`는 요청 데이터를 출처별로 구분합니다. 동일한 키가 있어도 서로 덮어쓰지 않습니다.

### 쿼리 스트링

모든 HTTP 메서드에서 쿼리 문자열을 `ctx.query`에 전달합니다. 쿼리가 없으면 `{}`입니다.

```text
GET /path?             → query: {}
GET /path?key          → query: { key: '' }
GET /path?key=         → query: { key: '' }
GET /path?key=value    → query: { key: 'value' }
GET /path?a=1&a=2      → query: { a: ['1', '2'] }
```

- 값은 `node:querystring`으로 디코딩합니다. 쿼리 문자열의 잘못된 퍼센트 인코딩은 원문 그대로 둡니다(예: `?a=%ZZ` → `{ a: '%ZZ' }`). 요청 경로처럼 `400`으로 응답하지 않습니다.

### 경로 파라미터와 본문

`ctx.params`는 디코딩된 경로 캡처만 포함하며 값은 항상 문자열입니다. `ctx.body`는 POST·PUT·PATCH에서 파싱되며 객체, 배열, JSON 원시값 또는 `undefined`입니다.

```typescript
await app.patch('/users/:id', (ctx) => ctx);

// PATCH /users/7?id=8, JSON 본문 { "id": 9 }
// {
//   params: { id: '7' },
//   query: { id: '8' },
//   body: { id: 9 }
// }
```

`parseNumber`와 `parseDate`는 query와 body의 문자열에만 적용하며 경로 캡처에는 적용하지 않습니다. Node.js의 `req`, `res`는 두 번째와 세 번째 인자로 그대로 전달됩니다.

요청 본문은 `Content-Type`에 따라 파싱합니다(대소문자 구분 없음, `charset` 같은 파라미터는 무시).

| `Content-Type` | `ctx.body` | `400 Bad Request` |
|---|---|---|
| `application/json` | 파싱한 JSON 값 | 잘못된 JSON, UTF-8 BOM으로 시작하는 JSON 포함 |
| `application/x-www-form-urlencoded` | 문자열 값의 객체, 배열은 `key[]` | |
| `multipart/form-data` | 객체 : 필드는 문자열, `text/plain` 파일은 UTF-8 문자열(아래 참고), 그 밖의 파일은 `Buffer`, 배열은 `key[]` | `boundary` 없음 |
| `text/*`, `charset` 없음 또는 `charset=utf-8` | UTF-8 문자열 | 잘못된 UTF-8 |
| `text/*`, 그 밖의 `charset`(예: `euc-kr`) | 디코딩하지 않은 원본 `Buffer` | |
| 그 밖의 타입(예: `application/octet-stream`, `image/png`), 또는 `Content-Type` 없음 | 원본 `Buffer` | |

- 본문이 비어 있으면 모든 타입에서 `undefined`입니다. `bodyLimit`을 넘는 본문은 `413 Payload Too Large`로 응답합니다.
- `text/*`는 `charset`이 없으면 UTF-8로 봅니다(badak 정책). `charset`은 대소문자를 구분하지 않고 따옴표로 감쌀 수 있으며, `utf-8`과 `utf8`을 UTF-8로 봅니다.
  UTF-8은 엄격하게 디코딩합니다. 잘못된 바이트는 `U+FFFD`로 바꾸지 않고 `400`으로 응답합니다. 그 밖의 charset은 디코딩하지 않으므로 필요하면 `Buffer`를 직접 디코딩하세요.
- `charset`이 두 번 이상 있거나(예: `charset=utf-8; charset=euc-kr`) 값이 비어 있으면 모호하므로 원본 `Buffer`입니다.
- 텍스트 본문 맨 앞의 UTF-8 BOM은 문자열에서 제거합니다. 바이트를 그대로 받으려면 다른 `Content-Type`(예: `application/octet-stream`)을 사용하세요.
- `multipart/form-data`의 `text/plain` 파일(`Content-Type`이 없는 파일은 RFC 7578에 따라 `text/plain`)도 같은 규칙으로 문자열 또는 `Buffer`입니다.
  바이너리 파일은 `Content-Type`(예: `image/png`, `application/octet-stream`)을 지정해 보내세요. `Content-Type` 없는 바이너리 파일은 UTF-8로 디코딩하므로 요청이 `400`이 됩니다. 브라우저와 `curl -F`는 파일에 `Content-Type`을 붙여 보냅니다.
- `parseNumber`와 `parseDate`는 문자열과 `Buffer` 본문에 적용하지 않습니다.
- JSON, form, multipart 본문의 원본 바이트는 제공하지 않습니다(예: 웹훅의 HMAC 서명 검증).

## 예제

[`sample/app.ts`](https://github.com/han41858/badak/blob/main/sample/app.ts)는 아래 예제를 모은 작은 앱이며, 현재 버전으로 테스트합니다. `npx tsx sample/index.ts`로 실행할 수 있습니다.

### 인증과 공개 라우트

`auth()`는 요청 본문을 받기 전에 실행됩니다. `{ auth: false }`인 라우트, 정적 파일, SPA는 인증을 거치지 않습니다.

```typescript
await app.auth((req) => {
	if (req.headers.authorization !== `Bearer ${ token }`) {
		throw new HttpError(401, { headers: { 'WWW-Authenticate': 'Bearer' } });
	}
});

await app.get('/api/health', () => ({ status: 'ok' }), { auth: false });
```

### 상태 코드와 헤더

`res`로 지정하고, 본문은 반환합니다.

```typescript
await app.post('/api/users', ({ body }, req, res) => {
	const user: User = createUser(body); // body 검증, 잘못되면 HttpError(400)

	res.statusCode = 201;
	res.setHeader('Location', `/api/users/${ user.id }`);

	return user;
});

await app.delete<{ params: { id: string } }>('/api/users/:id', ({ params }, req, res) => {
	deleteUser(params.id);
	res.statusCode = 204; // 반환값 없음 : 빈 본문
});
```

### 파일 업로드

`multipart/form-data`의 필드는 문자열, 파일은 `Buffer`(`text/plain` 파일은 UTF-8 문자열)입니다.
라우트의 `bodyLimit`으로 이 라우트에만 더 큰 본문을 허용할 수 있습니다.

```typescript
await app.post('/api/files', ({ body }) => {
	const { name, file } = body as { name?: string, file?: Buffer | string };

	if (file === undefined) {
		throw new HttpError(400);
	}

	return { name, size: Buffer.byteLength(file) };
}, { bodyLimit: 10 * 1024 * 1024 });
```

### 스트리밍 응답

```typescript
import { Readable } from 'node:stream';

await app.get('/api/users.csv', (ctx, req, res) => {
	res.setHeader('Content-Type', 'text/csv; charset=utf-8');

	// rows : CSV 행, 필드는 이스케이프해야 합니다 (sample/app.ts의 toCsvField() 참고)
	return Readable.from(['id,name\r\n', ...rows]);
});
```

### API와 SPA

API 라우트와 정적 파일을 먼저 찾고, 그 밖의 경로에는 `index.html`을 응답합니다.

```typescript
await app.get('/api/users', listUsers);
await app.setSPARoot('/', path.join(__dirname, 'public'));

// GET /api/users  -> listUsers
// GET /app.css    -> public/app.css
// GET /users/1    -> public/index.html
```

### 접근 로그

```typescript
await app.after((req, res) => {
	// 요청 본문을 보내는 중 클라이언트가 연결을 끊었으면 false
	const status = res.writableEnded ? res.statusCode : 'closed';

	console.log(`${ req.method } ${ req.url } ${ status }`);
});
```
