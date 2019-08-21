// function type definition for IDE
import { IncomingMessage, ServerResponse } from 'http';
import { Method } from './constants';

export type RouteFunction = (param : Object, req : IncomingMessage, res : ServerResponse) => any;
export type MiddlewareFunction = (req : IncomingMessage, res : ServerResponse, responseBody? : string) => void;

export interface RouteRule {
	[uri : string] : RouteRule | RouteRuleSeed | Function; // function can be assigned after config('defaultMethod', [method_type])
}

export interface RouteRuleSeed {
	GET? : RouteFunction;
	POST? : RouteFunction;
	PUT? : RouteFunction;
	DELETE? : RouteFunction;
}

export interface BadakOption {
	catchErrorLog : boolean; // default true, if false, badak will not show error catching log
	preventError : boolean; // default true, if false, badak pass error to node

	defaultMethod : Method; // can be ['GET', 'POST', 'PUT', 'DELETE', null] or lower cases, if set, can assign routing rule object without method
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

	parseNumber : boolean; // default false, if true, convert number string to Number
	parseDate : boolean; // default false, if true, convert date string to Date object
}

export interface StaticRule {
	uri : string;
	path : string;
}

export interface StaticCache {
	uri : string;
	mime : string;
	fileData : Buffer;
}