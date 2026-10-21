// function type definition for IDE
import { IncomingMessage, ServerResponse } from 'node:http';

import { METHOD } from './constants.js';


/**
 * Optional named type declarations for request data.
 * These declarations do not validate untrusted HTTP input at runtime.
 */
export interface ParamTypes {
	params?: object;
	query?: object;
	body?: unknown;
}

/** The independent sources of route parameters, query values and parsed request body. */
export interface ParamContext<T extends ParamTypes = ParamTypes> {
	params: T extends { params: infer P } ? P : Record<string, string>;
	query: T extends { query: infer Q } ? Q : Record<string, unknown>;
	body: T extends { body: infer B } ? B : unknown;
}

export type RouteFunction<T extends ParamTypes = ParamTypes> = (
	ctx: ParamContext<T>,
	req: IncomingMessage,
	res: ServerResponse
) => unknown | Promise<unknown>;

// Method-signature bivariance allows separately typed handlers in a heterogeneous route() tree.
// Runtime dispatch only invokes the selected handler; declaring request types does not validate them.
export type RouteHandler = {
	handle(ctx: ParamContext<never>, req: IncomingMessage, res: ServerResponse): unknown | Promise<unknown>;
}['handle'];
export type MiddlewareFunction = (req: IncomingMessage, res: ServerResponse, responseBody?: unknown) => void | Promise<void>;

export interface TypedObject<T> {
	[key: string]: T;
}

export interface RouteRule {
	// function can be assigned after config('defaultMethod', [method_type])
	[uri: string]: RouteRule | RouteRuleSeed | RouteHandler;
}

export interface RouteOption {
	auth?: boolean; // default true, if false, auth() function is not executed for this route
	bodyLimit?: number; // max request body size in bytes for this route, overrides bodyLimit of the app option
}

export interface RouteFunctionObj {
	fnc: RouteHandler;
	option?: RouteOption;
}

export interface RouteRuleSeed {
	GET?: RouteHandler | RouteFunctionObj;
	POST?: RouteHandler | RouteFunctionObj;
	PUT?: RouteHandler | RouteFunctionObj;
	PATCH?: RouteHandler | RouteFunctionObj;
	DELETE?: RouteHandler | RouteFunctionObj;
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
