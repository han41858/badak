// function type definition for IDE
import { IncomingMessage, ServerResponse } from 'http';

export type RouteFunction = (param : Object, req : IncomingMessage, res : ServerResponse) => any;
export type MiddlewareFunction = (req : IncomingMessage, res : ServerResponse, responseBody? : any) => void;

export interface RouteRule {
	[uri : string] : RouteRule | RouteRuleSeed | Function; // function can be assigned after config('defaultMethod', [method_type])
}

export interface RouteRuleSeed {
	GET? : RouteFunction;
	POST? : RouteFunction;
	PUT? : RouteFunction;
	DELETE? : RouteFunction;
}