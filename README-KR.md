![npm](https://img.shields.io/npm/v/badak?logo=npm)

![logo](https://github.com/han41858/badak/raw/master/docs/logo/badak_200.png)

# badak

badak은 Promise, TypeScript 기반으로 개발된 백엔드 프레임워크입니다.

> badak은 TypeScript로 작성되었으며 JavaScript 코드로 컴파일되어 배포됩니다. 따라서 TypeScript 문법으로 사용할 수도 있고 JavaScript 문법으로 사용할 수도 있습니다.

## 설치방법

badak은 npm으로 배포되며 npm/yarn 으로 설치할 수 있습니다.

```bash
npm install badak

# 또는

yarn install badak
```

## 사용방법

```typescript
import { Badak } from 'badak';

const rule : RouteRule = {
	users : {
		GET : () => {
			// return user list
			return {
				list : ['han', 'kim', 'lee']
			}
		},
		POST : (user : User) => {
			// add user

			return {
				result : 'ok'
			}
		}
	}
};


const app : Badak = new Badak();
await app.route(routeRule);
await app.listen(3000);
```

## 메서드

### `new Badak(option?: Partial<BadakOption>)`

badak 인스턴스를 생성합니다. 생성자로 옵션을 전달할 수 있습니다.

```typescript
const app : Badak = new Badak();

const appWithLog : Badak = new Badak({
	catchErrorLog : true
});
```

### `auth() : Promise<void>`

### `before() : Promise<void>`

### `after() : Promise<void>`

### `config() : Promise<void>`

### `listen(port : number) : Promise<void>`

### `isRunning() : boolean`

### `getHttpServer() : Server | undefined`

### `stop() : Promise<void>`

### `route(rule : RouteRule) : Promise<void>`

### `get(address : string, fnc : RouteFunction, option ?: RouteOption) : Promise<void>`

### `post(address : string, fnc : RouteFunction, option ?: RouteOption) : Promise<void>`

### `put(address : string, fnc : RouteFunction, option ?: RouteOption) : Promise<void>`

### `delete(address : string, fnc : RouteFunction, option ?: RouteOption) : Promise<void>`

### `static(uri : string, path : string) : Promise<void>`

### `setSPARoot(uri : string, path : string) : Promise<void>`

## 인터페이스

### `BadakOption`

Badak 앱의 동작 방식을 지정합니다.

#### `catchErrorLog : boolean`

에러가 발생하면 콘솔에 로그를 출력합니다.

기본값은 `true` 입니다.

#### `preventError : boolean`

에러가 발생하면 node로 전달합니다. `false` 값을 지정하면 에러를 전달하지 않고 무시합니다.

기본값은 `true` 입니다.

#### `defaultMethod : Method | undefined`

라우팅에 사용할 기본 HTTP 메서드 타입을 지정합니다. 이 값을 지정하면 `Badak.route()` 메서드를 사용할 때 HTTP 메서드 지정을 생략할 수 있습니다.

- 지정 전 :

```typescript
{
	'users' : {
		GET : getUserList
	}
}
```

- `app.config('defaultMethod', 'GET')` 지정 후 :

```typescript
{
	'users' : getUserList
}
```

