// function type definition for IDE
import { IncomingMessage, ServerResponse } from 'http';
import { Method } from './constants';

export type RouteFunction = (param : any, req : IncomingMessage, res : ServerResponse) => any;
export type MiddlewareFunction = (req : IncomingMessage, res : ServerResponse, responseBody? : string) => void;

export interface AnyObject {
	[key : string] : any;
}

export interface RouteRule {
	[uri : string] : RouteRule | RouteRuleSeed | RouteFunction; // function can be assigned after config('defaultMethod', [method_type])
}

export interface RouteOption {
	auth : boolean;
}

export interface RouteFunctionObj {
	fnc : RouteFunction;
	option? : RouteOption;
}

export interface RouteRuleSeed {
	GET? : RouteFunctionObj;
	POST? : RouteFunctionObj;
	PUT? : RouteFunctionObj;
	DELETE? : RouteFunctionObj;
}

export interface BadakOption {
	catchErrorLog : boolean; // default true, if false, badak will not show error catching log
	preventError : boolean; // default true, if false, badak pass error to node

	defaultMethod : Method | undefined; // can be ['GET', 'POST', 'PUT', 'DELETE', null] or lower cases, if set, can assign routing rule object without method
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