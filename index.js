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
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
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
var Badak = /** @class */ (function () {
    function Badak() {
        this._http = null;
        this._middleware = [];
        this._routeRule = null;
    }
    // check & refine route rule
    Badak.prototype._checkRouteRule = function (rule) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            var keyArr, promiseArr, refinedRuleObj, resultRuleObj, colonRouting, rules;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (rule === undefined) {
                            throw new Error('no rule');
                        }
                        keyArr = Object.keys(rule);
                        if (keyArr.length === 0) {
                            throw new Error('no rule in rule object');
                        }
                        promiseArr = [];
                        refinedRuleObj = {};
                        resultRuleObj = {};
                        colonRouting = keyArr.filter(function (key) { return key.includes(':') && key.indexOf(':') === 0; });
                        if (colonRouting.length > 1) {
                            throw new Error('duplicated colon routing');
                        }
                        // refine : remove '/', unzip abbreviation route path
                        keyArr.forEach(function (key) {
                            var refinedKey = null;
                            var uriArr = null;
                            // slash is permitted only '/', for others remove slash
                            if (key === '/') {
                                refinedKey = key;
                                uriArr = [key];
                            }
                            else {
                                refinedKey = key.replace(/^\/|\/$/gi, '');
                                uriArr = refinedKey.split('/');
                                if (!uriArr.every(function (uriFrag) { return uriFrag.length > 0; })) {
                                    throw new Error('empty uri included');
                                }
                                // ':' should be first index
                                if (!uriArr.every(function (uriFrag) { return uriFrag.includes(':') ? uriFrag.indexOf(':') === 0 : true; })) {
                                    throw new Error('invalid colon route');
                                }
                                // '+' should not be first index
                                if (!uriArr.every(function (uriFrag) { return uriFrag.includes('+') ? uriFrag.indexOf('+') !== 0 : true; })) {
                                    throw new Error('invalid plus route');
                                }
                            }
                            if (uriArr.length == 1) {
                                refinedRuleObj[refinedKey] = rule[key];
                            }
                            else if (uriArr.length > 1) {
                                // convert abbreviation to recursive object
                                var abbrObj_1 = {};
                                var targetObj_1 = abbrObj_1;
                                uriArr.forEach(function (uriFrag, i, arr) {
                                    // skip first fragment, it used first key
                                    if (i > 0) {
                                        if (i === arr.length - 1) {
                                            // last one
                                            targetObj_1[uriFrag] = rule[key];
                                        }
                                        else {
                                            if (targetObj_1[uriFrag] === undefined) {
                                                targetObj_1[uriFrag] = {};
                                            }
                                            targetObj_1 = targetObj_1[uriFrag]; // for recursive
                                        }
                                    }
                                });
                                if (refinedRuleObj[uriArr[0]] === undefined) {
                                    refinedRuleObj[uriArr[0]] = {};
                                }
                                Object.keys(abbrObj_1).forEach(function (key) {
                                    refinedRuleObj[uriArr[0]][key] = abbrObj_1[key];
                                });
                            }
                        });
                        // check RoueRuleSeed format
                        Object.keys(refinedRuleObj).forEach(function (key) {
                            promiseArr.push((function () { return __awaiter(_this, void 0, void 0, function () {
                                var value, beforeLastDepth, objKeyArr, methodArr_1, hasRouteRuleSeed, _a, _b;
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            value = refinedRuleObj[key];
                                            if (key.includes('?')) {
                                                if (key.indexOf('?') === 0) {
                                                    throw new Error('uri can\'t start \'?\'');
                                                }
                                            }
                                            if (value === undefined) {
                                                throw new Error('route function should be passed');
                                            }
                                            if (!(typeof value === 'object' && !!value)) return [3 /*break*/, 2];
                                            beforeLastDepth = Object.keys(value).every(function (key) {
                                                return value[key].constructor.name !== 'Object';
                                            });
                                            if (beforeLastDepth) {
                                                objKeyArr = Object.keys(rule);
                                                methodArr_1 = ['GET', 'POST', 'PUT', 'DELETE'];
                                                hasRouteRuleSeed = objKeyArr.some(function (objKey) {
                                                    return methodArr_1.some(function (method) {
                                                        return Object.keys(rule[objKey]).includes(method);
                                                    });
                                                });
                                                if (!hasRouteRuleSeed) {
                                                    throw new Error('route rule should have any of "GET", "POST", "PUT", "DELETE"');
                                                }
                                            }
                                            // call recursively
                                            _a = resultRuleObj;
                                            _b = key;
                                            return [4 /*yield*/, this._checkRouteRule(value)];
                                        case 1:
                                            // call recursively
                                            _a[_b] = _c.sent();
                                            return [3 /*break*/, 3];
                                        case 2:
                                            // last depth seed function
                                            if (!(value instanceof Function)) {
                                                throw new Error('route function is not Function');
                                            }
                                            resultRuleObj[key] = value;
                                            _c.label = 3;
                                        case 3: return [2 /*return*/, resultRuleObj];
                                    }
                                });
                            }); })());
                        });
                        return [4 /*yield*/, Promise.all(promiseArr)];
                    case 1:
                        rules = _a.sent();
                        return [2 /*return*/, rules[0]]; // rule object is in 0 index
                }
            });
        });
    };
    Badak.prototype._assignRule = function (ruleObj, parentObj) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            var targetObj, targetObjKeyArr, ruleObjKeyArr, promiseArr;
            return __generator(this, function (_a) {
                if (this._routeRule === null) {
                    this._routeRule = {};
                }
                targetObj = parentObj === undefined ? this._routeRule : parentObj;
                targetObjKeyArr = Object.keys(targetObj);
                ruleObjKeyArr = Object.keys(ruleObj);
                promiseArr = [];
                Object.keys(ruleObj).forEach(function (key) {
                    promiseArr.push((function () { return __awaiter(_this, void 0, void 0, function () {
                        var _a, colonRouteArr, existingQuestionRouteArr, matchingQuestionUri, newQuestionRouteArr, matchingQuestionUri, existingPlusRouteArr, matchingPlusUri, newPlusRouteArr, matchingPlusUri;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    if (!(typeof ruleObj[key] === 'object')) return [3 /*break*/, 5];
                                    _a = key;
                                    switch (_a) {
                                        case 'GET': return [3 /*break*/, 1];
                                        case 'POST': return [3 /*break*/, 1];
                                        case 'PUT': return [3 /*break*/, 1];
                                        case 'DELETE': return [3 /*break*/, 1];
                                    }
                                    return [3 /*break*/, 2];
                                case 1:
                                    targetObj[key] = ruleObj[key];
                                    return [3 /*break*/, 4];
                                case 2:
                                    colonRouteArr = targetObjKeyArr.concat(ruleObjKeyArr).filter(function (_key) { return _key.includes(':') && _key.indexOf(':') === 0; });
                                    if (colonRouteArr.length > 1) {
                                        throw new Error('duplicated colon routing');
                                    }
                                    existingQuestionRouteArr = targetObjKeyArr.slice().filter(function (_key) { return _key.includes('?'); });
                                    // check current question routed rule is duplicated
                                    if (existingQuestionRouteArr.length > 0) {
                                        matchingQuestionUri = existingQuestionRouteArr.find(function (questionKey) {
                                            return ruleObjKeyArr.some(function (ruleKey) {
                                                return new RegExp(questionKey).test(ruleKey);
                                            });
                                        });
                                        if (matchingQuestionUri !== undefined) {
                                            throw new Error('duplicated question routing');
                                        }
                                    }
                                    newQuestionRouteArr = ruleObjKeyArr.slice().filter(function (_key) { return _key.includes('?'); });
                                    if (newQuestionRouteArr.length > 0) {
                                        matchingQuestionUri = newQuestionRouteArr.find(function (questionKey) {
                                            return targetObjKeyArr.some(function (ruleKey) {
                                                return new RegExp(questionKey).test(ruleKey);
                                            });
                                        });
                                        if (matchingQuestionUri !== undefined) {
                                            throw new Error('duplicated question routing');
                                        }
                                    }
                                    existingPlusRouteArr = targetObjKeyArr.slice().filter(function (_key) { return _key.includes('+'); });
                                    if (existingPlusRouteArr.length > 0) {
                                        matchingPlusUri = existingPlusRouteArr.find(function (plusKey) {
                                            return ruleObjKeyArr.some(function (ruleKey) {
                                                return new RegExp(plusKey).test(ruleKey);
                                            });
                                        });
                                        if (matchingPlusUri !== undefined) {
                                            throw new Error('duplicated plus routing');
                                        }
                                    }
                                    newPlusRouteArr = ruleObjKeyArr.slice().filter(function (_key) { return _key.includes('+'); });
                                    if (newPlusRouteArr.length > 0) {
                                        matchingPlusUri = newPlusRouteArr.find(function (plusKey) {
                                            return targetObjKeyArr.some(function (ruleKey) {
                                                return new RegExp(plusKey).test(ruleKey);
                                            });
                                        });
                                        if (matchingPlusUri !== undefined) {
                                            throw new Error('duplicated plus routing');
                                        }
                                    }
                                    // call recursively
                                    if (targetObj[key] === undefined) {
                                        targetObj[key] = {};
                                    }
                                    return [4 /*yield*/, this._assignRule(ruleObj[key], targetObj[key])];
                                case 3:
                                    _b.sent();
                                    return [3 /*break*/, 4];
                                case 4: return [3 /*break*/, 6];
                                case 5:
                                    // RouteRuleSeed
                                    switch (key) {
                                        case 'GET':
                                        case 'POST':
                                        case 'PUT':
                                        case 'DELETE':
                                            targetObj[key] = ruleObj[key];
                                            break;
                                        default:
                                            throw new Error('invalid rule in RouteRuleSeed');
                                    }
                                    _b.label = 6;
                                case 6: return [2 /*return*/];
                            }
                        });
                    }); })());
                });
                return [2 /*return*/, Promise.all(promiseArr)
                        .then(function () {
                        // returns nothing
                    })
                        .catch(function (err) {
                        throw err;
                    })];
            });
        });
    };
    Badak.prototype._routeAbbrValidator = function (address, fnc) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (address === undefined) {
                    throw new Error('no address');
                }
                if (fnc === undefined) {
                    throw new Error('no function');
                }
                if (!(fnc instanceof Function)) {
                    throw new Error('middleware should be Function');
                }
                return [2 /*return*/];
            });
        });
    };
    // route abbreviation
    Badak.prototype.get = function (address, fnc) {
        return __awaiter(this, void 0, void 0, function () {
            var routeRule, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this._routeAbbrValidator(address, fnc)];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, this._checkRouteRule((_a = {},
                                _a[address] = {
                                    'GET': fnc
                                },
                                _a))];
                    case 2:
                        routeRule = _b.sent();
                        // assign to route rule
                        return [4 /*yield*/, this._assignRule(routeRule)];
                    case 3:
                        // assign to route rule
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Badak.prototype.post = function (address, fnc) {
        return __awaiter(this, void 0, void 0, function () {
            var routeRule, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this._routeAbbrValidator(address, fnc)];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, this._checkRouteRule((_a = {},
                                _a[address] = {
                                    'POST': fnc
                                },
                                _a))];
                    case 2:
                        routeRule = _b.sent();
                        // assign to route rule
                        return [4 /*yield*/, this._assignRule(routeRule)];
                    case 3:
                        // assign to route rule
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Badak.prototype.put = function (address, fnc) {
        return __awaiter(this, void 0, void 0, function () {
            var routeRule, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this._routeAbbrValidator(address, fnc)];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, this._checkRouteRule((_a = {},
                                _a[address] = {
                                    'PUT': fnc
                                },
                                _a))];
                    case 2:
                        routeRule = _b.sent();
                        // assign to route rule
                        return [4 /*yield*/, this._assignRule(routeRule)];
                    case 3:
                        // assign to route rule
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Badak.prototype.delete = function (address, fnc) {
        return __awaiter(this, void 0, void 0, function () {
            var routeRule, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this._routeAbbrValidator(address, fnc)];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, this._checkRouteRule((_a = {},
                                _a[address] = {
                                    'DELETE': fnc
                                },
                                _a))];
                    case 2:
                        routeRule = _b.sent();
                        // assign to route rule
                        return [4 /*yield*/, this._assignRule(routeRule)];
                    case 3:
                        // assign to route rule
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
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
                            var paramObj, contentTypeInHeader, contentTypeStrArr, contentType, fieldArr, boundaryStrArr, boundaryStr, fieldPrefixStr_1;
                            return __generator(this, function (_a) {
                                paramObj = undefined;
                                contentTypeInHeader = req.headers['content-type'];
                                if (!!contentTypeInHeader) {
                                    contentTypeStrArr = contentTypeInHeader.split(';');
                                    contentType = contentTypeStrArr[0].trim();
                                    bodyStr = Buffer.concat(bodyBuffer).toString().replace(/\s/g, '');
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
                                                return one.includes('Content-Disposition:form-data') && one.includes('name=');
                                            })
                                                .map(function (one) {
                                                // multipart/form-data has redundant '--', remove it
                                                return one.substr(0, one.length - 2);
                                            });
                                            fieldPrefixStr_1 = 'Content-Disposition:form-data;name=';
                                            fieldArr.forEach(function (str) {
                                                if (!str.includes(fieldPrefixStr_1)) {
                                                    throw new Error('invalid data : Content-Disposition');
                                                }
                                            });
                                            paramObj = {};
                                            fieldArr.forEach(function (field) {
                                                var _a = field.split('"'), prefix = _a[0], key = _a[1], value = _a[2];
                                                paramObj[key] = value;
                                            });
                                            break;
                                        case 'application/json':
                                            paramObj = JSON.parse(bodyStr);
                                            break;
                                        case 'application/x-www-form-urlencoded':
                                            paramObj = {};
                                            fieldArr = bodyStr.split('&');
                                            fieldArr.forEach(function (field) {
                                                var _a = field.split('='), key = _a[0], value = _a[1];
                                                paramObj[key] = value;
                                            });
                                            break;
                                    }
                                }
                                _resolve(paramObj);
                                return [2 /*return*/];
                            });
                        }); });
                    })];
            });
        });
    };
    Badak.prototype.route = function (rule) {
        return __awaiter(this, void 0, void 0, function () {
            var routeRule;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (rule === undefined) {
                            throw new Error('route rule should be passed');
                        }
                        if (typeof rule !== 'object') {
                            throw new Error('route rule should be object');
                        }
                        return [4 /*yield*/, this._checkRouteRule(rule)];
                    case 1:
                        routeRule = _a.sent();
                        return [4 /*yield*/, this._assignRule(routeRule)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Badak.prototype.use = function (middleware) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (middleware === undefined) {
                    throw new Error('middleware function should be passed');
                }
                if (!(middleware instanceof Function)) {
                    throw new Error('middleware should be function');
                }
                this._middleware.push(middleware);
                return [2 /*return*/];
            });
        });
    };
    Badak.prototype.listen = function (port) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                if (port === undefined) {
                    throw new Error('port should be passed');
                }
                if (typeof port !== 'number') {
                    throw new Error('port should be number type');
                }
                if (this._http !== null) {
                    throw new Error('server is running already');
                }
                else {
                    // use new Promise for http.listen() callback
                    return [2 /*return*/, new Promise(function (resolve) {
                            _this._http = http.createServer(function (req, res) {
                                // new Promise loop to catch error
                                (function () { return __awaiter(_this, void 0, void 0, function () {
                                    var _this = this;
                                    var targetFnc, param, targetRouteObj, uri, uriArr, _a, _b, resObj;
                                    return __generator(this, function (_c) {
                                        switch (_c.label) {
                                            case 0:
                                                targetFnc = undefined;
                                                param = undefined;
                                                targetRouteObj = this._routeRule;
                                                if (targetRouteObj === null) {
                                                    // no rule assigned
                                                    throw new Error('no rule');
                                                }
                                                uri = req.url;
                                                if (uri === '/') {
                                                    if (!!req.method && !!targetRouteObj['/'][req.method]) {
                                                        targetFnc = targetRouteObj['/'][req.method];
                                                    }
                                                }
                                                else {
                                                    uriArr = uri.split('/').filter(function (frag) { return frag !== ''; });
                                                    // TODO: static files
                                                    // find target function
                                                    uriArr.forEach(function (uriFrag, i, arr) {
                                                        if (targetRouteObj[uriFrag] !== undefined) {
                                                            targetRouteObj = targetRouteObj[uriFrag];
                                                        }
                                                        else {
                                                            // find router param
                                                            // colon routing
                                                            var colonParam = Object.keys(targetRouteObj).find(function (_uriFrag) { return _uriFrag.startsWith(':'); });
                                                            if (colonParam !== undefined) {
                                                                targetRouteObj = targetRouteObj[colonParam];
                                                                if (param === undefined) {
                                                                    param = {};
                                                                }
                                                                if (param.matcher === undefined) {
                                                                    param.matcher = [];
                                                                }
                                                                param.matcher.push(colonParam);
                                                                param[colonParam.replace(':', '')] = uriFrag;
                                                            }
                                                            else {
                                                                // find question routing
                                                                var routeRuleKeyArr = Object.keys(targetRouteObj);
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
                                                                    if (param.matcher === undefined) {
                                                                        param.matcher = [];
                                                                    }
                                                                    param.matcher.push(targetQuestionKey);
                                                                    param[targetQuestionKey] = uriFrag;
                                                                }
                                                                else {
                                                                    // find plus routing
                                                                    var routeRuleKeyArr_1 = Object.keys(targetRouteObj);
                                                                    var plusKeyArr = routeRuleKeyArr_1.filter(function (routeRuleKey) {
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
                                                                        if (param.matcher === undefined) {
                                                                            param.matcher = [];
                                                                        }
                                                                        param.matcher.push(targetPlusKey);
                                                                        param[targetPlusKey] = uriFrag;
                                                                    }
                                                                }
                                                            }
                                                        }
                                                        if (i === arr.length - 1) {
                                                            if (!!req.method && !!targetRouteObj[req.method]) {
                                                                targetFnc = targetRouteObj[req.method];
                                                            }
                                                        }
                                                    });
                                                }
                                                if (targetFnc === undefined) {
                                                    throw new Error('no rule');
                                                }
                                                _a = req.method;
                                                switch (_a) {
                                                    case 'PUT': return [3 /*break*/, 1];
                                                    case 'POST': return [3 /*break*/, 1];
                                                }
                                                return [3 /*break*/, 3];
                                            case 1:
                                                if (param === undefined) {
                                                    param = {};
                                                }
                                                _b = param;
                                                return [4 /*yield*/, this._paramParser(req)
                                                        .catch(function (err) { return __awaiter(_this, void 0, void 0, function () {
                                                        return __generator(this, function (_a) {
                                                            console.error(err);
                                                            throw new Error('parsing parameter error');
                                                        });
                                                    }); })];
                                            case 2:
                                                _b.data = _c.sent();
                                                return [3 /*break*/, 3];
                                            case 3:
                                                this._middleware.forEach(function (middleware) { return __awaiter(_this, void 0, void 0, function () {
                                                    return __generator(this, function (_a) {
                                                        switch (_a.label) {
                                                            case 0: return [4 /*yield*/, middleware()];
                                                            case 1:
                                                                _a.sent();
                                                                return [2 /*return*/];
                                                        }
                                                    });
                                                }); });
                                                return [4 /*yield*/, targetFnc(param)];
                                            case 4:
                                                resObj = _c.sent();
                                                if (!!resObj) {
                                                    // check result is json
                                                    if (typeof resObj === 'object') {
                                                        try {
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
                                    .catch(function (err) {
                                    switch (err.message) {
                                        case 'no rule':
                                            res.statusCode = 404;
                                            res.end();
                                            break;
                                        case 'parsing parameter error':
                                            res.statusCode = 500;
                                            res.end();
                                            break;
                                        default:
                                            console.error(err.message);
                                            res.statusCode = 500;
                                            res.end();
                                            break;
                                    }
                                });
                            });
                            _this._http.listen(port, function () {
                                resolve();
                            });
                        })];
                }
                return [2 /*return*/];
            });
        });
    };
    Badak.prototype.isRunning = function () {
        return this._http !== null;
    };
    Badak.prototype.getHttpServer = function () {
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
//# sourceMappingURL=index.js.map