/// <reference types="node" />
import { IncomingMessage, ServerResponse } from 'http';
import { Server } from 'net';
export interface RouteRule {
    [uri: string]: RouteRule | RouteRuleSeed | Function;
}
export interface RouteRuleSeed {
    GET?: RouteFunction;
    POST?: RouteFunction;
    PUT?: RouteFunction;
    DELETE?: RouteFunction;
}
export declare type RouteFunction = (param: Object, req: IncomingMessage, res: ServerResponse) => any;
export declare type MiddlewareFunction = (req: IncomingMessage, res: ServerResponse) => void;
export declare class Badak {
    private _http;
    private _authFnc;
    private _middlewaresBefore;
    private _middlewaresAfter;
    private _routeRule;
    private _config;
    private _refineRouteRule;
    private _checkUriDuplication;
    private _getMergedRule;
    private _assignRule;
    auth(fnc: MiddlewareFunction): Promise<void>;
    before(middleware: MiddlewareFunction): Promise<void>;
    after(middleware: MiddlewareFunction): Promise<void>;
    config(key: string, value: any): Promise<void>;
    private _routeAbbrValidator;
    get(address: string, fnc: RouteFunction): Promise<void>;
    post(address: string, fnc: RouteFunction): Promise<void>;
    put(address: string, fnc: RouteFunction): Promise<void>;
    delete(address: string, fnc: RouteFunction): Promise<void>;
    private _paramConverter;
    private _paramParser;
    route(rule: RouteRule): Promise<void>;
    listen(port: number): Promise<void>;
    isRunning(): boolean;
    getHttpServer(): Server;
    stop(): Promise<any>;
}
