/// <reference types="node" />
import { IncomingMessage, ServerResponse } from 'http';
export declare type RouteFunction = (param: Object, req: IncomingMessage, res: ServerResponse) => any;
export declare type MiddlewareFunction = (req: IncomingMessage, res: ServerResponse, responseBody?: any) => void;
export interface RouteRule {
    [uri: string]: RouteRule | RouteRuleSeed | Function;
}
export interface RouteRuleSeed {
    GET?: RouteFunction;
    POST?: RouteFunction;
    PUT?: RouteFunction;
    DELETE?: RouteFunction;
}
