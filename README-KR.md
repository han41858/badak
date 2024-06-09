![npm](https://img.shields.io/npm/v/badak?logo=npm)

![logo](https://github.com/han41858/badak/raw/main/docs/logo/badak_200.png)

# badak

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
import { Badak } from 'badak';

const rule: RouteRule = {
	users: {
		GET: () => {
			// 사용자 목록을 반환합니다.
			return {
				list: ['han', 'kim', 'lee']
			}
		},
		POST: (user: User) => {
			// 사용자를 추가합니다.
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
인증 미들웨어로 등록된 함수는 `before()` 이후에, 라우팅 함수가 실행되기 전에 실행됩니다.
인증 미들웨어 함수에서 오류가 발생하면 `401 Unauthorized` 에러가 발생합니다.

### `before(fnc: MiddlewareFunction): Promise<void>`

라우팅 함수가 실행되기 전에 실행할 미들웨어 함수를 등록합니다.
미들웨어 함수는 여러개를 지정할 수 있으며, 지정한 순서와 관계없이 병렬로 실행됩니다.

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

### `stop(): Promise<void>`

HTTP 서버를 정지합니다.

### `route(rule: RouteRule): Promise<void>`

라우팅 함수를 등록합니다.

### `get(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

`GET` 메서드 요청에 반응하는 라우팅 함수를 등록합니다.

### `post(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

`POST` 메서드 요청에 반응하는 라우팅 함수를 등록합니다.

### `put(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

`PUT` 메서드 요청에 반응하는 라우팅 함수를 등록합니다.

### `delete(address: string, fnc: RouteFunction, option?: RouteOption): Promise<void>`

`DELETE` 메서드 요청에 반응하는 라우팅 함수를 등록합니다.

### `static(uri: string, path: string): Promise<void>`

정적 파일로 제공할 주소와 파일 경로를 연결합니다.

### `setSPARoot(uri: string, path: string): Promise<void>`

SPA 앱으로 사용할 주소와 파일 경로를 연결합니다.
지정된 폴더 안에 있는 파일은 정적으로 제공되며, 캐싱됩니다.

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

### `BadakOption`

badak 앱의 동작 방식을 지정합니다.

#### `catchErrorLog: boolean`

에러가 발생하면 콘솔에 로그를 출력합니다.

기본값은 `true` 입니다.

#### `preventError: boolean`

에러가 발생하면 node로 전달합니다.
`false` 값을 지정하면 에러를 전달하지 않고 무시합니다.

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

기본값은 `false` 입니다.

#### `parseDate: boolean`

인자로 전달되는 문자열 형태의 날짜를 `Date` 타입으로 변환합니다.

기본값은 `false` 입니다.

### `RouteOption`

라우팅 함수의 동작을 결정합니다.

#### `auth: boolean`

`false`로 지정하면 이 라우팅 함수가 실행될 때 `auth()` 함수를 실행하지 않습니다.

기본값은 `true` 입니다.

## 특수 라우팅

`route()`나 `get()`, `post()`, `put()`, `delete()` 함수의 경로에 특수 라우팅을 사용할 수 있습니다.

### `:` 라우팅

`/:userId`로 라우팅 경로를 지정하고 `/user1`로 HTTP 요청을 보내면, 요청이 매칭되며 라우팅 함수의 인자로 `{ userId: 'user1' }`이 전달됩니다.

### `?` 라우팅

`/users?`로 라우팅 경로를 지정하면 `/user`와 `/users` 경로를 매칭할 수 있습니다.

### `+` 라우팅

`/user1+`로 라우팅 경로를 지정하면 `/user1`과 `/user11` 등의 경로를 매칭할 수 있습니다.

### `*` 라우팅

`/user1*`로 라우팅 경로를 지정하면 `/user`와 `/user1`, `/user11` 등의 경로를 매칭할 수 있습니다.

## 라우팅 인자

### 쿼리 스트링

`GET` 메서드를 요청하는 경우 쿼리 스트링 인자를 파싱해서 라우팅 함수로 전달합니다.

아래 예제는 모두 `/path` 경로와 매칭되며 전달되는 인자는 각각 이렇습니다.

```bash
/path?          # {}
/path?key       # { key: null }
/path?key=      # { key: '' }
/path?key=value # { key: 'value' }
```
