// function type definition for IDE
import { IncomingMessage, ServerResponse } from 'node:http';

import { METHOD } from './constants.js';


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouteFunction = (param: any, req: IncomingMessage, res: ServerResponse) => unknown | Promise<unknown>;
export type MiddlewareFunction = (req: IncomingMessage, res: ServerResponse, responseBody?: unknown) => void | Promise<void>;

export interface TypedObject<T> {
	[key: string]: T;
}

export interface RouteRule {
	// function can be assigned after config('defaultMethod', [method_type])
	[uri: string]: RouteRule | RouteRuleSeed | RouteFunction;
}

export interface RouteOption {
	auth?: boolean; // default true, if false, auth() function is not executed for this route
	bodyLimit?: number; // max request body size in bytes for this route, overrides bodyLimit of the app option
}

export interface RouteFunctionObj {
	fnc: RouteFunction;
	option?: RouteOption;
}

export interface RouteRuleSeed {
	GET?: RouteFunction | RouteFunctionObj;
	POST?: RouteFunction | RouteFunctionObj;
	PUT?: RouteFunction | RouteFunctionObj;
	PATCH?: RouteFunction | RouteFunctionObj;
	DELETE?: RouteFunction | RouteFunctionObj;
}

export interface BadakOption extends TypedObject<boolean | number | METHOD | undefined> {
	catchErrorLog: boolean; // default true, if false, badak will not show error catching log
	preventError: boolean; // default true, if false, badak pass error to node

	defaultMethod: METHOD | undefined; // can be ['GET', 'POST', 'PUT', 'DELETE', null] or lower cases, if set, can assign routing rule object without method
	/**
	 * before rule :
	 * {
	 *     '/users' : {
	 *         GET : getUserList
	 *     }
	 * }
	 *
	 * after set app.config('defaultMethod', 'GET') :
	 * {
	 *     '/users' : getUserList
	 * }
	 */

	parseNumber: boolean; // default false, if true, convert number string to Number
	parseDate: boolean; // default false, if true, convert date string to Date object

	bodyLimit: number; // default 100KB (102400), max request body size in bytes, 413 Payload Too Large if exceeded
}

export interface StaticOption {
	// Cache-Control header of static files, default 'no-cache' (cached, but revalidated every time)
	// e.g. 'public, max-age=31536000, immutable' for files with hashed names, false : no Cache-Control header
	cacheControl?: string | false;
}

export interface StaticRule {
	uri: string;
	path: string;
	option?: StaticOption;
}

export interface StaticCache {
	uri: string;
	mime: string;
	fileData: Buffer;
	etag: string; // strong ETag from file content
	lastModified: string; // HTTP date from file mtime
	cacheControl?: string; // undefined : no Cache-Control header
}
