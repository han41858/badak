/// <reference types="node" />
import { Server } from 'net';
import { MiddlewareFunction, RouteFunction, RouteRule } from './interfaces';
/**
 * rule format, reserved keyword is 4-methods in upper cases
 * example)
 * {
 *     'users' : {
 *         'GET' : getUserList,
 *         'POST' : addUser,
 *
 *         ':id' : {
 *             'GET' : getUser,
 *             'PUT' : updateUser,
 *             'DELETE' : deleteUser
 *         }
 *     }
 * }
 */
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
