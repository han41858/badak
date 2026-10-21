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
import { Badak, RouteRule } from 'badak';

interface User {
	name: string;
}

const rule: RouteRule = {
	users: {
		GET: () => {
			// 사용자 목록을 반환합니다.
			return {
				list: ['han', 'kim', 'lee']
			};
		},
		POST: (user: User) => {
			// 사용자를 추가합니다.
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

미들웨어 함수에서 에러가 발생하면(거부된 Promise를 반환하는 경우 포함) 라우팅 함수는 실행되지 않으며,
라우팅 함수에서 에러가 발생했을 때와 같은 방식으로 에러 상태 코드로 응답합니다.
예를 들어 `throw new Error('Forbidden')`은 `403 Forbidden`으로, 그 외의 에러는 `500 Internal Server Error`로 응답합니다.
미들웨어 함수가 직접 응답한 경우(`res.end()` 등)에도 라우팅 함수는 실행되지 않습니다.

### `after(fnc: MiddlewareFunction): Promise<void>`

라우팅 함수가 실행된 후에 실행할 미들웨어 함수를 등록합니다.
미들웨어 함수는 여러개를 지정할 수 있으며, 지정한 순서와 관계없이 병렬로 실행됩니다.

### `config(key: string, value: unknown): Promise<void>`

badak 앱이 실행되는 동작을 조정합니다.

### `listen(port: number): Promise<void>`

서버 응답을 시작합니다.

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

파일은 `listen()`을 실행할 때 메모리에 올라가므로, 파일을 바꾸면 서버를 다시 시작해야 반영됩니다.

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
호환성을 위해 `new Error('Forbidden')`처럼 메시지가 상태 문구인 `Error`는 해당 상태 코드로 응답합니다
(`Bad Request`, `Unauthorized`, `Forbidden`, `Not Found`, `Method Not Allowed`, `Not Acceptable`, `Payload Too Large`).

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
export type RouteFunction = (param: any, req: IncomingMessage, res: ServerResponse) => unknown | Promise<unknown>;
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

app.get('/download', (param, req, res) => {
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
`GET` 요청의 쿼리 문자열과 `POST`/`PUT` 요청의 본문에 적용되며, `:id` 같은 라우트 파라미터에는 적용되지 않습니다.

기본값은 `false` 입니다.

#### `parseDate: boolean`

인자로 전달되는 문자열 형태의 날짜를 `Date` 타입으로 변환합니다.
`GET` 요청의 쿼리 문자열과 `POST`/`PUT` 요청의 본문에 적용되며, `:id` 같은 라우트 파라미터에는 적용되지 않습니다.

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

`route()`나 `get()`, `post()`, `put()`, `delete()` 함수의 경로에 특수 라우팅을 사용할 수 있습니다.

### `:` 라우팅

`/:userId`로 라우팅 경로를 지정하고 `/user1`로 HTTP 요청을 보내면, 요청이 매칭되며 라우팅 함수의 인자로 `{ userId: 'user1' }`이 전달됩니다.

### `?` 라우팅

`?`는 바로 앞 문자 하나를 선택적으로 만듭니다.
`/users?`로 라우팅 경로를 지정하면 `/user`와 `/users` 경로를 매칭할 수 있습니다.
매칭된 경로 조각은 라우팅 경로를 키로 하여 라우팅 함수 인자로 전달됩니다(예: `{ 'users?': 'user' }`).

- 다른 문자는 정규식에서 특별한 의미가 있는 문자(예: `.`, `(`, `)`, `[`, `]`)를 포함해 모두 문자 그대로 취급합니다. `/a.c?`는 `/a.c`와 `/a.`에 매칭되며, `/abc`에는 매칭되지 않습니다.
- `??`나, 한 경로 조각에서 `?`를 `+` 또는 `*`와 함께 쓰는 경로(예: `/ab?c+`)는 등록할 때 에러가 발생합니다.
- 같은 경로 조각에 매칭될 수 있는 `?` 라우팅 경로는 등록 순서와 관계없이 함께 등록할 수 없습니다. 예를 들어 `/ab?c`와 `/a?bc`는 모두 `/abc`에 매칭되므로, 두 번째 경로를 등록할 때 `duplicated question routing` 에러가 발생합니다. `?` 라우팅 경로에 매칭되는 일반 경로(예: `/abc`와 `/ab?c`)도 같은 에러가 발생합니다.

### `+` 라우팅

`/user1+`로 라우팅 경로를 지정하면 `/user1`과 `/user11` 등의 경로를 매칭할 수 있습니다.

### `*` 라우팅

`*`는 경로 조각을 정확히 하나 매칭하며, 그 경로 조각은 라우팅 함수 인자의 `*`로 전달됩니다.

```typescript
await app.get('/img/*', (param) => param);

// GET /img/a.png -> { '*': 'a.png' }
// GET /img, /img/, /img/a/b -> 404
```

경로 조각 안의 `*`는 그 경로 조각 안의 임의의 문자를 매칭합니다.
`/user1*`로 라우팅 경로를 지정하면 `/user`와 `/user1`, `/user11` 등의 경로를 매칭할 수 있습니다.

### `**` 라우팅

`**`는 `/`를 포함한 나머지 경로 전체를 매칭합니다.
나머지 경로는 라우팅 함수 인자의 `**`로 전달되며, 각 경로 조각을 디코딩한 뒤 `/`로 연결한 문자열입니다.

```typescript
await app.get('/files/**', (param) => param);

// GET /files/a/b%20c/d.txt -> { '**': 'a/b c/d.txt' }
// GET /files/a/b?c=1       -> { '**': 'a/b', c: '1' }
```

- `**`는 라우팅 경로의 마지막 조각에만 사용할 수 있습니다. `/files/**/edit` 같은 경로는 등록할 때 에러가 발생합니다.
- 경로 조각 안의 `%2F`도 `/`로 디코딩되므로, `/files/a%2Fb`와 `/files/a/b`는 같은 값을 전달합니다.
- 나머지 경로에 잘못된 퍼센트 인코딩이 있으면 `400 Bad Request`로 응답합니다.
- `**`는 경로 조각 0개 이상을 매칭합니다. `/files/**`는 `/files`, `/files/`, `/files/a`, `/files/a/b`에 매칭되며, `/files`와 `/files/`에서 `**`는 `''`입니다. `/**`는 `/`에도 매칭됩니다.
- `**`는 폴백입니다. 요청 경로가 다른 라우트에 완전히 매칭되지 않을 때만 사용합니다. [라우팅 우선순위](#라우팅-우선순위)를 참고하세요.

### 라우팅 우선순위

경로 조각마다 아래 순서로 매칭하며, 라우트를 등록한 순서와는 관계없습니다.

1. 일반 라우팅 (예: `/users/me`)
2. `:` 라우팅 (예: `/users/:id`)
3. `?` 라우팅
4. `+` 라우팅
5. `*` 라우팅 (`*`, `ab*cd`)

`**`는 요청 경로가 다른 라우트에 완전히 매칭되지 않을 때만 사용하며, 매칭된 경로에서 가장 깊은 `**`를 사용합니다.
예를 들어 `setSPARoot('/')`(`/**`)를 사용해도 `/style.css`와 `/api/users`는 각자의 라우트가 처리하고, 나머지 경로는 `index.html`로 응답합니다.

```typescript
await app.get('/**', spaFnc);
await app.get('/api/users', usersFnc);
await app.get('/api/users/:id', userFnc);

// GET /api/users     -> usersFnc
// GET /api/users/7   -> userFnc, { id: '7' }
// GET /api/users/7/x -> spaFnc, { '**': 'api/users/7/x' }
// GET /api           -> spaFnc, { '**': 'api' }
```

경로는 라우트에 완전히 매칭되지만 그 메서드의 라우팅 함수가 없으면, `**`를 사용하지 않고 `405 Method Not Allowed`로 응답합니다.

## 라우팅 인자

### 쿼리 스트링

모든 메서드에서 쿼리 스트링 인자를 파싱해서 라우팅 함수로 전달합니다.

아래 예제는 모두 `/path` 경로와 매칭되며 전달되는 인자는 각각 이렇습니다.

```bash
/path?          # undefined
/path?key       # { key: '' }
/path?key=      # { key: '' }
/path?key=value # { key: 'value' }
```

### 인자 병합

라우트 파라미터(`:id` 등), 쿼리 스트링, 요청 본문(`POST`, `PUT`, `PATCH`)은 이 순서대로 하나의 객체로 합쳐집니다.
같은 키가 있으면 뒤의 값이 우선합니다.

```bash
PATCH /users/7?name=a  본문 { "name": "b" }  # { id: '7', name: 'b' }
```

> **주의** : 쿼리 스트링과 요청 본문은 라우트 파라미터를 덮어쓸 수 있습니다.
> 예를 들어 `/users/:id` 라우팅 함수에 `PATCH /users/7?id=8`, 본문 `{ "id": 9 }`로 요청하면 `{ id: 9 }`가 전달됩니다.
> 클라이언트가 보낼 수 있는 키를 라우트 파라미터로 믿고 사용하면 안 됩니다.
> 쿼리 스트링이나 요청 본문의 키와 겹치지 않도록 라우트 파라미터 이름을 지정하세요(예: `/users/:userId`).

요청 본문이 객체가 아니면(JSON 배열 등) 라우트 파라미터와 쿼리 스트링 없이 본문을 그대로 전달합니다.
