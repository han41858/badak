"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var http = require("http");
var constants_1 = require("./constants");
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
// rule format, reserved keyword is 4-methods
var Badak = /** @class */ (function () {
    function Badak() {
        this._http = null;
        // auth hook
        this._authFnc = null;
        // before & after hooks
        this._middlewaresBefore = [];
        this._middlewaresAfter = [];
        this._routeRule = null;
        this._config = {
            defaultMethod: null,
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
            parseNumber: false,
            parseDate: false // default false, if true, convert date string to Date object
        };
    }
    // refine route rule, this function can be called recursively
    Badak.prototype._refineRouteRule = function (rule) {
        var _this = this;
        if (rule === undefined) {
            throw new Error('no rule');
        }
        var keyArr = Object.keys(rule);
        if (keyArr.length === 0) {
            throw new Error('no rule in rule object');
        }
        keyArr.forEach(function (key) {
            if (!key) {
                throw new Error('empty rule in rule object');
            }
        });
        var refinedRuleObj = {};
        // called recursively
        keyArr.forEach(function (uri) {
            // slash is permitted only '/', for others remove slash
            if (uri === '/') {
                refinedRuleObj['/'] = _this._refineRouteRule(rule[uri]);
            }
            else {
                if (uri.includes('//')) {
                    throw new Error('invalid double slash');
                }
                // make array for uri abbreviation
                var uriArr = uri.includes('/') ?
                    uri.split('/').filter(function (uriFrag) { return uriFrag !== ''; }) :
                    [uri];
                var targetObj_1 = refinedRuleObj;
                uriArr.forEach(function (uriFrag, i, arr) {
                    var _a;
                    if (uriFrag.trim() !== uriFrag) {
                        throw new Error('uri include space');
                    }
                    if (uriFrag.trim() === '') {
                        throw new Error('empty uri frag');
                    }
                    if (uriFrag.includes(':') && !uriFrag.startsWith(':')) {
                        throw new Error('invalid colon route');
                    }
                    if (uriFrag.includes('?') && uriFrag.startsWith('?')) {
                        throw new Error('invalid question route');
                    }
                    if (uriFrag.includes('+') && uriFrag.startsWith('+')) {
                        throw new Error('invalid plus route');
                    }
                    if (Object.values(constants_1.METHODS).includes(uriFrag)) {
                        var method = uriFrag; // re-assign for readability
                        targetObj_1[method] = rule[method];
                    }
                    else {
                        if (i < arr.length - 1) {
                            // unzip abbreviation path
                            if (!targetObj_1[uriFrag]) {
                                targetObj_1[uriFrag] = {};
                            }
                            targetObj_1 = targetObj_1[uriFrag];
                        }
                        else {
                            // last uri frag
                            if (typeof rule[uri] === 'object') {
                                targetObj_1[uriFrag] = _this._refineRouteRule(rule[uri]);
                            }
                            else if (typeof rule[uri] === 'function') {
                                if (!!_this._config.defaultMethod) {
                                    targetObj_1[uriFrag] = (_a = {},
                                        _a[_this._config.defaultMethod] = rule[uri],
                                        _a);
                                }
                                else {
                                    throw new Error('invalid rule or defaultMethod not set');
                                }
                            }
                        }
                    }
                    _this._checkUriDuplication(Object.keys(targetObj_1));
                });
            }
        });
        return refinedRuleObj;
    };
    Badak.prototype._checkUriDuplication = function (uriKeys) {
        // sift keys, uriKeys can have duplicated item
        var uris = uriKeys.filter(function (key, i, arr) {
            return i === arr.indexOf(key);
        });
        if (uris.length > 1) {
            // colon routing
            var colonRouteArr = uris.filter(function (uri) { return uri.startsWith(':'); });
            if (colonRouteArr.length > 1) {
                throw new Error('duplicated colon routing');
            }
            // question routing
            var questionRouteArr_1 = uris.filter(function (uri) { return uri.includes('?'); });
            if (questionRouteArr_1.length > 0) {
                var targetUris_1 = uris.filter(function (uri) { return !questionRouteArr_1.includes(uri); });
                var matchingResult = questionRouteArr_1.find(function (regSrc) {
                    return targetUris_1.some(function (uri) { return new RegExp(regSrc).test(uri); });
                });
                if (matchingResult !== undefined) {
                    throw new Error('duplicated question routing');
                }
            }
            // plus routing
            var plusRouteArr = uris.filter(function (uri) { return uri.includes('+'); });
            if (plusRouteArr.length > 0) {
                var plusUrisSanitized_1 = uris.slice(); // start with all keys
                plusRouteArr.forEach(function (uri) {
                    var plusIncluded = uri.replace('+', '');
                    var plusExcluded = uri.replace(/.\+/, '');
                    if (plusUrisSanitized_1.includes(plusIncluded) || plusUrisSanitized_1.includes(plusExcluded)) {
                        throw new Error('duplicated plus routing');
                    }
                    else {
                        plusUrisSanitized_1.push(plusIncluded, plusExcluded);
                    }
                });
            }
        }
    };
    // divided with _assignRule for nested object, can be called recursively
    // Object.assign() overwrite existing tree, do this manually
    // param type is any, not RouteRule, different methods can be merged
    Badak.prototype._getMergedRule = function (currentRule, newRule) {
        var _this = this;
        if (newRule === undefined) {
            throw new Error('no newRule to merge');
        }
        var resultRule = Object.assign({}, currentRule);
        this._checkUriDuplication(Object.keys(resultRule).concat(Object.keys(newRule)));
        Object.keys(newRule).forEach(function (newRuleKey) {
            // assign
            if (!!resultRule[newRuleKey] && !Object.keys(constants_1.METHODS).includes(newRuleKey)) {
                resultRule[newRuleKey] = _this._getMergedRule(resultRule[newRuleKey], newRule[newRuleKey]);
            }
            else {
                resultRule[newRuleKey] = newRule[newRuleKey];
            }
        });
        return resultRule;
    };
    Badak.prototype._assignRule = function (rule) {
        var refinedRule = this._refineRouteRule(rule);
        this._routeRule = this._getMergedRule(this._routeRule, refinedRule);
    };
    // auth
    Badak.prototype.auth = function (fnc) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (fnc === undefined) {
                    throw new Error('no auth function');
                }
                if (!(fnc instanceof Function)) {
                    throw new Error('auth param should be Function');
                }
                this._authFnc = fnc;
                return [2 /*return*/];
            });
        });
    };
    Badak.prototype.before = function (middleware) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.isRunning()) {
                    throw new Error('server is started already, this function should be called before listen()');
                }
                if (middleware === undefined) {
                    throw new Error('middleware function should be passed');
                }
                if (!(middleware instanceof Function)) {
                    throw new Error('middleware should be function');
                }
                this._middlewaresBefore.push(middleware);
                return [2 /*return*/];
            });
        });
    };
    Badak.prototype.after = function (middleware) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.isRunning()) {
                    throw new Error('server is started already, this function should be called before listen()');
                }
                if (middleware === undefined) {
                    throw new Error('middleware function should be passed');
                }
                if (!(middleware instanceof Function)) {
                    throw new Error('middleware should be function');
                }
                this._middlewaresAfter.push(middleware);
                return [2 /*return*/];
            });
        });
    };
    Badak.prototype.config = function (key, value) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (Object.keys(this._config).includes(key)) {
                    switch (key) {
                        // boolean keys
                        case 'parseNumber':
                        case 'parseDate':
                            if (typeof value !== 'boolean') {
                                throw new Error('invalid value');
                            }
                            this._config[key] = value;
                            break;
                        case 'defaultMethod':
                            if (typeof value !== 'string') {
                                throw new Error('invalid method parameter');
                            }
                            if (!Object.values(constants_1.METHODS).some(function (method) {
                                return method === value;
                            })) {
                                throw new Error('not defined method');
                            }
                            this._config[key] = value;
                            break;
                    }
                }
                else {
                    throw new Error('not defined option');
                }
                return [2 /*return*/];
            });
        });
    };
    Badak.prototype._routeAbbrValidator = function (address, fnc) {
        if (address === undefined) {
            throw new Error('no address');
        }
        if (fnc === undefined) {
            throw new Error('no function');
        }
        if (!(fnc instanceof Function)) {
            throw new Error('middleware should be Function');
        }
    };
    // route abbreviation
    Badak.prototype.get = function (address, fnc) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b;
            return __generator(this, function (_c) {
                this._routeAbbrValidator(address, fnc);
                // assign to route rule
                this._assignRule((_a = {},
                    _a[address] = (_b = {},
                        _b[constants_1.METHODS.GET] = fnc,
                        _b),
                    _a));
                return [2 /*return*/];
            });
        });
    };
    Badak.prototype.post = function (address, fnc) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b;
            return __generator(this, function (_c) {
                this._routeAbbrValidator(address, fnc);
                // assign to route rule
                this._assignRule((_a = {},
                    _a[address] = (_b = {},
                        _b[constants_1.METHODS.POST] = fnc,
                        _b),
                    _a));
                return [2 /*return*/];
            });
        });
    };
    Badak.prototype.put = function (address, fnc) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b;
            return __generator(this, function (_c) {
                this._routeAbbrValidator(address, fnc);
                // assign to route rule
                this._assignRule((_a = {},
                    _a[address] = (_b = {},
                        _b[constants_1.METHODS.PUT] = fnc,
                        _b),
                    _a));
                return [2 /*return*/];
            });
        });
    };
    Badak.prototype.delete = function (address, fnc) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b;
            return __generator(this, function (_c) {
                this._routeAbbrValidator(address, fnc);
                // assign to route rule
                this._assignRule((_a = {},
                    _a[address] = (_b = {},
                        _b[constants_1.METHODS.DELETE] = fnc,
                        _b),
                    _a));
                return [2 /*return*/];
            });
        });
    };
    // parameter can be Object of string because request has string
    Badak.prototype._paramConverter = function (param) {
        var _this = this;
        // convert if number string
        // if not number string, return itself
        function convertNumberStr(param) {
            var result = param;
            if (!isNaN(+param)) {
                result = +param;
            }
            return result;
        }
        // convert if date string
        // if not date string, return itself
        function convertDateStr(param) {
            var result = param;
            // only work for ISO 8601 date format
            var dateExps = [
                /^(\d){4}-(\d){2}-(\d){2}$/,
                /^(\d){4}-(\d){2}-(\d){2}T(\d){2}:(\d){2}:(\d){2}\+(\d){2}:(\d){2}$/,
                /^(\d){4}-(\d){2}-(\d){2}T(\d){2}:(\d){2}:(\d){2}(.(\d){3})?Z$/,
                /^(\d){8}T(\d){6}Z$/,
                /^(\d){4}-W(\d){2}$/,
                /^(\d){4}-W(\d){2}-(\d){1}$/,
                /^--(\d){2}-(\d){2}$/,
                /^(\d){4}-(\d){3}$/ // ordinal dates : '2018-171'
            ];
            if (dateExps.some(function (dateExp) {
                return dateExp.test(param);
            })) {
                result = new Date(param);
            }
            return result;
        }
        Object.keys(param).forEach(function (key) {
            // only work for string param
            if (typeof param[key] === 'string') {
                if (_this._config.parseNumber) {
                    param[key] = convertNumberStr(param[key]);
                }
                if (_this._config.parseDate) {
                    param[key] = convertDateStr(param[key]);
                }
            }
        });
        return param;
    };
    // for POST, PUT
    Badak.prototype._paramParser = function (req) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (_resolve, _reject) {
                        var bodyBuffer = [];
                        var bodyStr = null;
                        req.on('data', function (stream) {
                            bodyBuffer.push(stream);
                        });
                        req.on('error', function (err) {
                            _reject(err);
                        });
                        req.on('end', function () { return __awaiter(_this, void 0, void 0, function () {
                            var paramObj, contentTypeInHeader, contentTypeStrArr, contentType, fieldArr, boundaryStrArr, boundaryStr;
                            return __generator(this, function (_a) {
                                contentTypeInHeader = req.headers['content-type'];
                                if (!!contentTypeInHeader) {
                                    contentTypeStrArr = contentTypeInHeader.split(';');
                                    contentType = contentTypeStrArr[0].trim();
                                    bodyStr = Buffer.concat(bodyBuffer).toString();
                                    fieldArr = null;
                                    switch (contentType) {
                                        case 'multipart/form-data':
                                            boundaryStrArr = contentTypeStrArr[1].split('=');
                                            boundaryStr = boundaryStrArr[1].trim();
                                            if (!boundaryStr) {
                                                throw new Error('invalid content-type');
                                            }
                                            fieldArr = bodyStr.split(boundaryStr)
                                                .filter(function (one) {
                                                return one.includes('Content-Disposition')
                                                    && one.includes('form-data')
                                                    && one.includes('name=');
                                            })
                                                .map(function (one) {
                                                return one
                                                    .replace(/\r\n--/, '') // multipart/form-data has redundant '--', remove it
                                                    .replace(/\r\n/g, ''); // trim '\r\n'
                                            });
                                            paramObj = {};
                                            fieldArr.forEach(function (field) {
                                                var _a = field.split('"'), prefix = _a[0], key = _a[1], value = _a[2];
                                                paramObj[key] = value;
                                            });
                                            break;
                                        case 'application/json':
                                            if (!!bodyStr) {
                                                try {
                                                    paramObj = JSON.parse(bodyStr);
                                                }
                                                catch (e) {
                                                    throw new Error('parsing parameter failed');
                                                }
                                            }
                                            // no payload, but ok
                                            break;
                                        case 'application/x-www-form-urlencoded':
                                            if (!!bodyStr) {
                                                paramObj = {};
                                                fieldArr = bodyStr.split('&');
                                                fieldArr.forEach(function (field) {
                                                    var _a = field.split('='), key = _a[0], value = _a[1];
                                                    paramObj[key] = value;
                                                });
                                            }
                                            // no payload, but ok
                                            break;
                                    }
                                    if (!!paramObj) {
                                        paramObj = this._paramConverter(paramObj);
                                    }
                                    _resolve(paramObj);
                                }
                                else {
                                    // no content-type, but ok
                                    _resolve();
                                }
                                return [2 /*return*/];
                            });
                        }); });
                    })];
            });
        });
    };
    Badak.prototype.route = function (rule) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this._assignRule(rule);
                return [2 /*return*/];
            });
        });
    };
    Badak.prototype.listen = function (port) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (port === undefined) {
                            throw new Error('port should be passed');
                        }
                        if (typeof port !== 'number') {
                            throw new Error('port should be number type');
                        }
                        if (this.isRunning()) {
                            throw new Error('server is running already');
                        }
                        // use new Promise for http.listen() callback
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                _this._http = http.createServer(function (req, res) {
                                    // new Promise loop to catch error
                                    (function () { return __awaiter(_this, void 0, void 0, function () {
                                        var err_1, targetFnc, param, targetRouteObj, uri, uriArr, ruleFound_1, _a, _b, _c, _d, e_1, resObj;
                                        return __generator(this, function (_e) {
                                            switch (_e.label) {
                                                case 0:
                                                    _e.trys.push([0, 2, , 3]);
                                                    return [4 /*yield*/, Promise.all(this._middlewaresBefore.map(function (middlewareFnc) {
                                                            return middlewareFnc(req, res);
                                                        }))];
                                                case 1:
                                                    _e.sent();
                                                    return [3 /*break*/, 3];
                                                case 2:
                                                    err_1 = _e.sent();
                                                    return [3 /*break*/, 3];
                                                case 3:
                                                    targetRouteObj = this._routeRule;
                                                    if (targetRouteObj === null) {
                                                        // no rule assigned
                                                        throw new Error('no rule');
                                                    }
                                                    uri = req.url;
                                                    if (uri === '/') {
                                                        if (!!req.method && !!targetRouteObj['/'] && !!targetRouteObj['/'][req.method]) {
                                                            targetFnc = targetRouteObj['/'][req.method.toUpperCase()];
                                                        }
                                                    }
                                                    else {
                                                        uriArr = uri.split('/').filter(function (frag) { return frag !== ''; });
                                                        ruleFound_1 = false;
                                                        // find target function
                                                        uriArr.forEach(function (uriFrag, i, arr) {
                                                            ruleFound_1 = false;
                                                            var routeRuleKeyArr = Object.keys(targetRouteObj);
                                                            if (targetRouteObj[uriFrag] !== undefined) {
                                                                targetRouteObj = targetRouteObj[uriFrag];
                                                                ruleFound_1 = true;
                                                            }
                                                            if (!ruleFound_1) {
                                                                // colon routing
                                                                var colonParam = Object.keys(targetRouteObj).find(function (_uriFrag) { return _uriFrag.startsWith(':'); });
                                                                if (colonParam !== undefined) {
                                                                    targetRouteObj = targetRouteObj[colonParam];
                                                                    if (param === undefined) {
                                                                        param = {};
                                                                    }
                                                                    // if (param.matcher === undefined) {
                                                                    // 	param.matcher = [];
                                                                    // }
                                                                    // param.matcher.push(colonParam);
                                                                    param[colonParam.replace(':', '')] = uriFrag;
                                                                    ruleFound_1 = true;
                                                                }
                                                            }
                                                            if (!ruleFound_1) {
                                                                // find question routing
                                                                var questionKeyArr = routeRuleKeyArr.filter(function (routeRuleKey) {
                                                                    return routeRuleKey.includes('?') && routeRuleKey.indexOf('?') !== 0;
                                                                });
                                                                var targetQuestionKey = questionKeyArr.find(function (questionKey) {
                                                                    var optionalCharacter = questionKey.substr(questionKey.indexOf('?') - 1, 1);
                                                                    var mandatoryKey = questionKey.substr(0, questionKey.indexOf(optionalCharacter + '?'));
                                                                    var restKey = questionKey.substr(questionKey.indexOf(optionalCharacter + '?') + optionalCharacter.length + 1);
                                                                    return new RegExp("^" + mandatoryKey + optionalCharacter + "?" + restKey + "$").test(uriFrag);
                                                                });
                                                                if (targetQuestionKey !== undefined) {
                                                                    targetRouteObj = targetRouteObj[targetQuestionKey];
                                                                    if (param === undefined) {
                                                                        param = {};
                                                                    }
                                                                    // if (param.matcher === undefined) {
                                                                    // 	param.matcher = [];
                                                                    // }
                                                                    // param.matcher.push(targetQuestionKey);
                                                                    param[targetQuestionKey] = uriFrag;
                                                                    ruleFound_1 = true;
                                                                }
                                                            }
                                                            if (!ruleFound_1) {
                                                                // find plus routing
                                                                var plusKeyArr = routeRuleKeyArr.filter(function (routeRuleKey) {
                                                                    return routeRuleKey.includes('+');
                                                                });
                                                                var targetPlusKey = plusKeyArr.find(function (plusKey) {
                                                                    return new RegExp(plusKey).test(uriFrag);
                                                                });
                                                                if (targetPlusKey !== undefined) {
                                                                    targetRouteObj = targetRouteObj[targetPlusKey];
                                                                    if (param === undefined) {
                                                                        param = {};
                                                                    }
                                                                    // if (param.matcher === undefined) {
                                                                    // 	param.matcher = [];
                                                                    // }
                                                                    // param.matcher.push(targetPlusKey);
                                                                    param[targetPlusKey] = uriFrag;
                                                                    ruleFound_1 = true;
                                                                }
                                                            }
                                                            if (!ruleFound_1) {
                                                                // find asterisk routing
                                                                var asteriskKeyArr = routeRuleKeyArr.filter(function (routeRuleKey) {
                                                                    return routeRuleKey.includes('*');
                                                                });
                                                                var targetAsteriskKey = asteriskKeyArr.find(function (asteriskKey) {
                                                                    // replace '*' to '\\w*'
                                                                    return new RegExp(asteriskKey.replace('*', '\\w*')).test(uriFrag);
                                                                });
                                                                if (targetAsteriskKey !== undefined) {
                                                                    targetRouteObj = targetRouteObj[targetAsteriskKey];
                                                                    if (param === undefined) {
                                                                        param = {};
                                                                    }
                                                                    // if (param.matcher === undefined) {
                                                                    // 	param.matcher = [];
                                                                    // }
                                                                    // param.matcher.push(targetAsteriskKey);
                                                                    param[targetAsteriskKey] = uriFrag;
                                                                    ruleFound_1 = true;
                                                                }
                                                            }
                                                            if (i === arr.length - 1) {
                                                                if (ruleFound_1 && !!req.method && !!targetRouteObj && !!targetRouteObj[req.method]) {
                                                                    targetFnc = targetRouteObj[req.method.toUpperCase()];
                                                                }
                                                            }
                                                        });
                                                    }
                                                    if (targetFnc === undefined) {
                                                        throw new Error('no rule');
                                                    }
                                                    _a = req.method.toUpperCase();
                                                    switch (_a) {
                                                        case constants_1.METHODS.PUT: return [3 /*break*/, 4];
                                                        case constants_1.METHODS.POST: return [3 /*break*/, 4];
                                                    }
                                                    return [3 /*break*/, 9];
                                                case 4:
                                                    if (!(param === undefined)) return [3 /*break*/, 6];
                                                    return [4 /*yield*/, this._paramParser(req)];
                                                case 5:
                                                    param = _e.sent();
                                                    return [3 /*break*/, 8];
                                                case 6:
                                                    _c = (_b = Object).assign;
                                                    _d = [param];
                                                    return [4 /*yield*/, this._paramParser(req)];
                                                case 7:
                                                    // TODO: overwrite? uri param & param object
                                                    param = _c.apply(_b, _d.concat([_e.sent()]));
                                                    _e.label = 8;
                                                case 8: return [3 /*break*/, 9];
                                                case 9:
                                                    if (!!!this._authFnc) return [3 /*break*/, 13];
                                                    _e.label = 10;
                                                case 10:
                                                    _e.trys.push([10, 12, , 13]);
                                                    return [4 /*yield*/, this._authFnc(req, res)];
                                                case 11:
                                                    _e.sent();
                                                    return [3 /*break*/, 13];
                                                case 12:
                                                    e_1 = _e.sent();
                                                    // create new error instance
                                                    throw new Error('auth failed');
                                                case 13: return [4 /*yield*/, targetFnc(param, req, res)];
                                                case 14:
                                                    resObj = _e.sent();
                                                    if (!!resObj) {
                                                        // check result is json
                                                        if (typeof resObj === 'object') {
                                                            try {
                                                                // try to stringify()
                                                                JSON.stringify(resObj);
                                                                res.setHeader('Content-Type', 'application/json');
                                                                res.end(JSON.stringify(resObj));
                                                            }
                                                            catch (err) {
                                                                // no json
                                                                res.setHeader('Content-Type', 'text/plain');
                                                                res.end(resObj);
                                                            }
                                                        }
                                                        else {
                                                            res.setHeader('Content-Type', 'text/plain');
                                                            res.end(resObj);
                                                        }
                                                    }
                                                    else {
                                                        res.end();
                                                    }
                                                    return [2 /*return*/];
                                            }
                                        });
                                    }); })()
                                        .catch(function (err) { return __awaiter(_this, void 0, void 0, function () {
                                        return __generator(this, function (_a) {
                                            switch (err.message) {
                                                case 'auth failed':
                                                    res.statusCode = 401; // Unauthorized, Unauthenticated
                                                    res.end();
                                                    break;
                                                case 'no rule':
                                                    res.statusCode = 404; // not found
                                                    res.end();
                                                    break;
                                                // internal errors
                                                case 'parsing parameter failed':
                                                    res.statusCode = 500; // Internal Server Error
                                                    res.end();
                                                    break;
                                                default:
                                                    res.statusCode = 500; // Internal Server Error
                                                    if (!!err) {
                                                        if (err instanceof Object) {
                                                            res.setHeader('Content-Type', 'application/json');
                                                            res.end(JSON.stringify(err));
                                                        }
                                                        else {
                                                            res.end(err);
                                                        }
                                                    }
                                                    else {
                                                        res.end();
                                                    }
                                                    break;
                                            }
                                            return [2 /*return*/];
                                        });
                                    }); })
                                        .then(function () { return __awaiter(_this, void 0, void 0, function () {
                                        var err_2;
                                        return __generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0:
                                                    _a.trys.push([0, 2, , 3]);
                                                    return [4 /*yield*/, Promise.all(this._middlewaresAfter.map(function (middlewareFnc) {
                                                            return middlewareFnc(req, res);
                                                        }))];
                                                case 1:
                                                    _a.sent();
                                                    return [3 /*break*/, 3];
                                                case 2:
                                                    err_2 = _a.sent();
                                                    return [3 /*break*/, 3];
                                                case 3: return [2 /*return*/];
                                            }
                                        });
                                    }); });
                                });
                                // this._http.on('error', (err : Error) => {
                                // 	reject(err);
                                // });
                                _this._http.listen(port, function (err) {
                                    if (!err) {
                                        resolve();
                                    }
                                    else {
                                        reject(err);
                                    }
                                });
                            })];
                    case 1:
                        // use new Promise for http.listen() callback
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Badak.prototype.isRunning = function () {
        return this._http !== null;
    };
    Badak.prototype.getHttpServer = function () {
        if (!this.isRunning()) {
            throw new Error('server is not started');
        }
        return this._http;
    };
    Badak.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                if (this._http === null) {
                    throw new Error('server is not running, call listen() before stop()');
                }
                return [2 /*return*/, new Promise(function (resolve) {
                        _this._http.close(function () {
                            _this._http = null;
                            resolve();
                        });
                    })];
            });
        });
    };
    return Badak;
}());
exports.Badak = Badak;
//# sourceMappingURL=badak.js.map