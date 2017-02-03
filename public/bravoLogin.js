var logger = require("log4js").getLogger("stress");
var filelogger = require("log4js").getLogger("stressFile");

(function(module, require, exports) {
    /* ************************************************************************
     SINGLETON CLASS DEFINITION
     ************************************************************************ */
    var singleton = function() {
    };
    singleton._body = null;
    singleton._rsaKey = null;

    /**
     * Singleton getInstance definition
     * @return singleton class
     */
    singleton.getBody = function() {
        return this._body;
    };
    singleton.setBody = function(body) {
        this._body = body;
    };
    singleton.getKey = function() {
        return this._rsaKey;
    };
    singleton.setRsaKey = function(key) {
        this._rsaKey = key;
    };

    //axios.defaults.withCredentials = true;
    var RequestContract = require('../public/RequestContract').SGTech.AtlanticCity.RequestContract;
    var ClientFacade = require('../public/ClientDynamicInvoke').SGTech.AtlanticCity.ClientFacade;

    var cryptico;
    var RSAKey;
    var axios;
    var CryptoJS;
    var Ice = require("ice").Ice;
    var BravoGlacier = require('../public/bravoGlacier').BravoGlacier;

    // Node.js
    if( typeof window === 'undefined' ) {
        cryptico = require("cryptico-js");
        RSAKey = require("cryptico-js").RSAKey;
        axios = require("axios");
        CryptoJS = require("crypto-js");
    }
    // Browser
    else {
        cryptico = window.cryptico;
        RSAKey = window.RSAKey;
        axios = window.axios;
        CryptoJS = window.CryptoJS;
    }

    //
    // Define a servant class that implements SGTech.AtlanticCity.ClientFacade.Callbackable
    // interface.
    //
    var InvokeCallback = Ice.Class(ClientFacade.Callbackable, {
        __init__: function(name, callback) {
            this.proxyName = name;
            this.callbackFn = callback;
        },
        Invoke: function(method, input) {
            var result = {
                result_code: RequestContract.ResultCode_Success,
                result_message: ""
            };
            var resultString = JSON.stringify(result);
            logger.info("Invoke callback #" + this.proxyName + "//" + method + "//" + resultString + "//" + input);
            this.callbackFn(method, resultString, input);
        }
    });

    function BravoLogin(deviceID, loginInfo) {
        this.axiosConfig = { withCredentials: true, headers: {} };
        this.DeviceId = deviceID;
        this.loginInfo = loginInfo ? loginInfo : undefined;
        this.SessionCookies = [];
        this.RSAKey = {};
        this.AESKey = { Key: "", IV: "" };
        this.Language = "zh_TW";
        this._functionListener = {};
        this._connectionListener = undefined;
        this.glacier = null;
    }

    /**
     *  設定要登入的 Website URL
     * @param url
     */
    BravoLogin.prototype.setWebsite = function(url) {
        this.axiosConfig.baseURL = url;
        this.clearSessionCookies();
        this.setLanguageTag("zh_TW");
    };

    /**
     * 註冊連線狀態監聽
     *
     * @param {function(method, data)} listener
     */
    BravoLogin.prototype.setConnectionListener = function(listener) {
        this._connectionListener = listener;
    };

    /**
     * @method clearSessionCookies
     */
    BravoLogin.prototype.clearSessionCookies = function() {
        this.SessionCookies = {};
    };

    /**
     * @method setLanguageTag
     * @param {String} lang_tag
     */
    BravoLogin.prototype.setLanguageTag = function(lang_tag) {
        this.Language = lang_tag;
    };


    /**
     * 登入並建立 Session
     * @param isGuestLogin
     * @returns {*} Ice.Promise 物件, 成功並傳出 MemberCenter.RouterSessionPrx
     */
    BravoLogin.prototype.createSession = function(isGuestLogin) {
        var self = this;
        var promise = new Ice.Promise();

        // 準備 GetPreloginEncryptKey Command Body
        var cmdBody = this._getPreloginEncryptKeyCmd();
        this.axiosConfig.headers['Cookie'] = self.SessionCookies;
        axios.post('/api/call', cmdBody, this.axiosConfig)
            .then(function(response) {
                //logger.info("response.headers:",JSON.stringify(response.headers));
                // Check Cookie and save
                var cookie = response.headers['set-cookie'];
                if( cookie != undefined ) {
                    self.SessionCookies = cookie;
                    //logger.info("Set-Cookie:", cookie);
                }

                // success
                var result_code = response.data.result_code;
                if( result_code && result_code == "OK" ) {
                    // 取出 result_data
                    var result_data = response.data.result_data;

                    // 解密
                    var resString = self._decryptRsaData(result_data);
                    var aesKey = JSON.parse(resString);
                    // 儲存 AES_Key
                    if( aesKey ) {
                        // 取得 AESKey 成功
                        self._setAesKey(aesKey.Key, aesKey.IV);

                        // 處理登入
                        self._login(isGuestLogin).then(
                            // success
                            function(session) {
                                promise.succeed(session);
                            },
                            // fail
                            function(error) {
                                promise.fail(error.toString());
                            }
                        );
                    }
                    else {
                        delete self.AESKey;
                        // 取得 AESKey 失敗
                        throw "getPreloginEncryptKey fail, response: " + resString;
                    }
                }
                else {
                    throw "getPreloginEncryptKey fail, response: " + JSON.stringify(response.data);
                }
            })
            .catch(function(error) {
                promise.fail(error);
            });

        return promise;
    };

    /**
     * @method logout
     */
    BravoLogin.prototype.logout = function() {
        // 讓他斷線
        if( this.glacier ) {
            this.glacier.disconnect();
            this.glacier = null;
        }
    };

    BravoLogin.prototype.registerAllFunctionalListener = function() {
        var promise = new Ice.Promise();
        Ice.Promise.all(BravoLogin.CallbackableProxyList.map(proxy =>
            this._registerFunctionalListener(proxy[0], (method, result, data) => {
                logger.trace("=================== [" + proxy[0] + "] ===================");
                logger.trace("Method: " + method);
                logger.trace("Result: " + JSON.stringify(result));
                logger.trace("Data: " + JSON.stringify(data));
                logger.trace("###################");
            }, proxy[1])
        )).then(() => promise.succeed()).exception(() => promise.fail());
        // var proxy = this.glacier.communicator.stringToProxy("ClientFacade/Menu")
        //     .ice_router(this.glacier.router)
        //     .ice_connectionId(this.glacier.router.ice_getConnectionId());
        //
        // var invokablePrx = ClientFacade.InvokablePrx.uncheckedCast(proxy);
        // invokablePrx.Invoke("GetSystemTime", "{}", this.glacier.session).then(
        //     function(response, result) {
        //         logger.info("Invoke: " + response + ", " + result);
        //         promise.succeed();
        //     },
        //     function(error) {
        //         logger.info("Invoke Error: " + error);
        //         promise.fail();
        //     }
        // ).exception(
        //     function(ex) {
        //         logger.info("Invoke Exception: " + ex);
        //         promise.fail();
        //     }
        // );

        return promise;
    };

    BravoLogin.ClientFacadeCommand = {
        Login: "Login",
        LoginError: "LoginError",
        Disconnect: "Disconnect",
        InvokeError: "InvokeError",
        InvokeTimeout: "InvokeTimeout",
        AddCallbackSucceed: "AddCallbackSucceed",
        AddCallbackError: "AddCallbackError",
        RemoveCallbackError: "RemoveCallbackError",
        UpdateToken: "UpdateToken"
    };

    BravoLogin.CallbackableProxyList = [
        ["ClientFacade/User", true],
        ["ClientFacade/Store", true],
        ["ClientFacade/Friend", true],
        ["ClientFacade/Gift", true],
        ["ClientFacade/Im", true],
        ["ClientFacade/Maintenance", true],
        ["ClientFacade/Bag", true],
        ["ClientFacade/Tournament", true],

        ["ClientFacade/Menu", false],
        ["ClientFacade/LoginActivity", false],
        ["ClientFacade/FirstTimeLoginBonus", false],
        ["ClientFacade/DailyBonus", false],
        ["ClientFacade/TimeBonus", false],
        ["ClientFacade/Ads", false],
        ["ClientFacade/Ranking", false],
        ["ClientFacade/Notification", false],
        ["ClientFacade/Setting", false]
    ];

    /**
     * @method registerFunctionalListener
     * @param {String} proxy_name
     * @param {function} callback
     * @param {boolean} [register_to_ice=false]
     * @return {boolean}
     */
    BravoLogin.prototype._registerFunctionalListener = function(proxy_name,
                                                                callback,
                                                                register_to_ice) {

        var promise;
        // 需要對 ice add callback
        if( register_to_ice ) {
            // 對 Ice :: addCallback
            var self = this;
            var proxy = self.glacier.communicator.stringToProxy(proxy_name);
            // .ice_router(self.glacier.router)
            // .ice_connectionId(self.glacier.router.ice_getConnectionId());

            var invokablePrx = ClientFacade.InvokablePrx.uncheckedCast(proxy);
            var callbackPrx;
            var categoryString = "";
            promise =
                self.glacier.router.getCategoryForClient().then(function(category) {
                        categoryString = category;

                        // if( self.glacier.getInternalAdapter() ) {
                        //     return self.glacier.getInternalAdapter();
                        // }
                        // else {
                        //     logger.info("Create new object adapter ..");
                        return self.glacier.communicator.createObjectAdapterWithRouter("", self.glacier.router);
                        // }
                    }
                ).then(function(adapter) {
                    // self.glacier.setInternalAdapter(adapter);
                    // adapter.activate();
                    //
                    // Create a callback receiver servant and add it to
                    // the object adapter.
                    //
                    var r = adapter.add(new InvokeCallback(proxy_name, callback), new Ice.Identity(Ice.generateUUID(), categoryString));
                    // var r = self.glacier.internalAdapter.add(new InvokeCallback(proxy_name, callback), new Ice.Identity(Ice.generateUUID(), category));

                    //
                    // Set the connection adapter.
                    //
                    //self.glacier.router.ice_getCachedConnection().setAdapter(adapter);

                    //
                    // Create the CallbackablePrx servant and add it to the ObjectAdapter.
                    //
                    callbackPrx = ClientFacade.CallbackablePrx.uncheckedCast(r);

                    //
                    // Register the client with the bidir server.
                    //
                    return invokablePrx.AddCallback(callbackPrx, self.glacier.session);
                }).then(function(result) {
                    if( result.resultCode == RequestContract.RequestResult.ResultCode_Success ) {
                        // AddCallback 成功
                        logger.debug(proxy_name, "AddCallback 成功");

                        // 計錄callbackPrx 到 functionListener 中
                        self._functionListener[proxy_name].callbackPrx = callbackPrx;
                        self._callconnectionLister(BravoLogin.ClientFacadeCommand.AddCallbackSucceed, JSON.stringify({ ProxyName: proxy_name }));

                        promise.succeed();
                    }
                    else {
                        // AddCallback 呼叫成功，但回傳錯誤
                        logger.warn(proxy_name, "AddCallback 失敗!!", "resultCode=", result.resultCode);
                        logger.warn(proxy_name, "AddCallback 失敗!!", "resultMessage=", result.resultMessage);
                        filelogger.warn(proxy_name, "AddCallback 失敗!!", "resultCode=", result.resultCode);
                        filelogger.warn(proxy_name, "AddCallback 失敗!!", "resultMessage=", result.resultMessage);
                        self._callconnectionLister(BravoLogin.ClientFacadeCommand.InvokeError, JSON.stringify({ ProxyName: proxy_name }));

                        promise.fail(JSON.stringify(result));
                    }

                }).exception(function(ex) {
                    // InvokeError
                    logger.error(proxy_name, "AddCallback Error: ", ex);
                    filelogger.error(proxy_name, "AddCallback Error: ", ex);

                    self._callconnectionLister(BravoLogin.ClientFacadeCommand.AddCallbackError, JSON.stringify({ ProxyName: proxy_name }));

                    // promise.fail();
                    promise.fail(ex.toString());
                });
        }
        else {
            promise = new Ice.Promise();
            promise.succeed();
        }

        // 計錄到 functionListener 中
        this._functionListener[proxy_name] = { "callback": callback, "register_to_ice": register_to_ice };
        return promise;
    };

    /**
     * @method unregisterFunctionalListener
     * @param {String} proxy_name
     */
    BravoLogin.prototype._unregisterFunctionalListener = function(proxy_name) {
        var callbackInfo = this._functionListener[proxy_name];

        // Check 是否要對 Ice RemoveCallback
        if( callbackInfo.register_to_ice ) {
            // 對 Ice :: RemoveCallback
            var self = this;
            var proxy = self.glacier.communicator.stringToProxy(proxy_name);
            // .ice_router(self.glacier.router)
            // .ice_connectionId(self.glacier.router.ice_getConnectionId());

            var invokablePrx = ClientFacade.InvokablePrx.uncheckedCast(proxy);
            if( typeof callbackInfo.callbackPrx != 'undefined' ) {
                invokablePrx.RemoveCallback(callbackPrx, self.glacier.session).then(
                    function() {
                        // AddCallback 成功
                        logger.debug(proxy_name, "RemoveCallback 成功");
                    }
                ).exception(
                    function(ex) {
                        // InvokeError
                        logger.warn(proxy_name, "RemoveCallback Error", ex.toString());
                        self._callconnectionLister(BravoLogin.ClientFacadeCommand.RemoveCallbackError, JSON.stringify({ ProxyName: proxy_name }));
                    });
            }
        }

        delete self._functionListener[proxy_name];
    };

    /**
     *  呼叫所有 connectionListener
     * @param method
     * @param data
     * @private
     */
    BravoLogin.prototype._callconnectionLister = function(method, data) {
        if( this._connectionListener ) {
            this._connectionListener(method, data);
        }
    };

    BravoLogin.prototype._callFunctionalListener = function(proxy_name, method, result, data) {
        if( this._functionListener.hasOwnProperty(proxy_name) ) {
            this._functionListener[proxy_name].callback(method, result, data);
        }
    };

    /**
     *  登入處理, 區分 GuestLogin 與 FastLogin
     * @param isGuestLogin
     * @returns {*} Ice.Promise 物件, 成功必導出 MemberCenter.RouterSessionPrx
     * @private
     */
    BravoLogin.prototype._login = function(isGuestLogin) {
        var self = this;
        var promise = new Ice.Promise();

        var loginPromise;
        if( isGuestLogin ) {
            // guest 登入
            loginPromise = self._guestLogin();
        }
        else {
            // fast 登入
            loginPromise = self._fastLogin();
        }

        loginPromise.then(
            // success
            function() {
                self.glacier = new BravoGlacier(self.DeviceId, self.loginInfo);
                return self.glacier.createSession().then(
                    // self.glacier = new BravoGlacier();
                    // return self.glacier.createSession(self.DeviceId, self.loginInfo).then(
                    // success
                    function(session) {
                        logger.info("glacier 登入成功");
                        // 通知 Listener
                        self._callconnectionLister(BravoLogin.ClientFacadeCommand.Login);

                        // 加上 connection callback
                        var connection = self.glacier.router.ice_getCachedConnection();
                        connection.setCallback({
                            closed: function() {
                                // 通知 Listener
                                self._callconnectionLister(BravoLogin.ClientFacadeCommand.Disconnect, "Connection lost!!");
                            }
                        });
                    },
                    function(fail) {
                        var methodArg = {
                            CanRetry: true, //(是否可重試連線)
                            // 由錯誤(例外)原因來分辨
                            ExceptionMessage: fail.toString(), //(例外訊息)}
                        };
                        // 通知 listener
                        self._callconnectionLister(BravoLogin.ClientFacadeCommand.LoginError, JSON.stringify(methodArg));

                        // throw "glacier 登入失敗: " + fail;
                        promise.fail("glacier 登入失敗: " + fail);
                    }
                ).exception(
                    function(ex) {
                        var methodArg = {
                            CanRetry: false, //(是否可重試連線)
                            // 由錯誤(例外)原因來分辨
                            ExceptionMessage: ex.toString(), //(例外訊息)}
                        };
                        // 通知 listener
                        self._callconnectionLister(BravoLogin.ClientFacadeCommand.LoginError, JSON.stringify(methodArg));

                        // throw "glacier 登入失敗: " + ex.toString();
                        promise.fail("glacier 登入失敗: " + ex.toString());
                    }
                );
            }
        ).then(
            // success
            function(session) {
                promise.succeed(session);
            }
        ).exception(
            function(ex) {
                promise.fail(ex);
            }
        );

        return promise;
    };

    BravoLogin.prototype._guestLogin = function() {
        var self = this;
        delete this.loginInfo;

        var promise = new Ice.Promise();
        // TODO: 修改成  _sendEncryptionRequest('/api/calle',);
        //this._sendEncryptionRequest('/api/calle',);

        // 準備 GuestLogin Command Body
        var cmdBody = this._getGuestLoginCmd();
        var cmdBodyString = JSON.stringify(cmdBody);

        // AES 加密, 並轉 base64
        var key = CryptoJS.enc.Utf8.parse(this.AESKey.Key);
        var iv = CryptoJS.enc.Utf8.parse(this.AESKey.IV);
        var encrypted = CryptoJS.AES.encrypt(cmdBodyString, key, { iv: iv });
        var encString = encrypted.ciphertext.toString(CryptoJS.enc.Base64);

        var newCmdBody = { "data": encString };
        this.axiosConfig.headers['Cookie'] = self.SessionCookies;
        axios.post('/api/calle', newCmdBody, this.axiosConfig)
        // success
            .then(function(response) {
                var cookie = response.headers['set-cookie'];
                if( cookie != undefined ) {
                    self.SessionCookies = cookie;
                    logger.debug("Set-Cookie:", cookie);
                }

                var result_data = response.data;
                if( result_data && result_data.length > 2 ) {
                    // AES 解密
                    var decrypted = CryptoJS.AES.decrypt(result_data, key, { iv: iv });
                    var decString = CryptoJS.enc.Utf8.stringify(decrypted);
                    var result = JSON.parse(decString);

                    if( result && result.result_code == "OK" ) {
                        var loginInfo = JSON.parse(result.result_data);
                        if( loginInfo ) {
                            // 計錄 loginInfo
                            self.loginInfo = loginInfo;
                            promise.succeed(loginInfo);
                        }
                        else {
                            throw "GuestLogin loginInfo is null";
                        }
                    }
                    else {
                        throw "GuestLogin fail, response: " + decString;
                    }
                }
                else {
                    throw "GuestLogin fail, response is empty";
                }
            })
            .catch(function(error) {
                promise.fail(error);
            });

        return promise;
    };

    BravoLogin.prototype._fastLogin = function() {
        var self = this;

        var promise = new Ice.Promise();

        // 準備 FastLogin Command Body
        var cmdBody = this._getFastLoginCmd();
        var cmdBodyString = JSON.stringify(cmdBody);

        // AES 加密, 並轉 base64
        var key = CryptoJS.enc.Utf8.parse(self.AESKey.Key);
        var iv = CryptoJS.enc.Utf8.parse(self.AESKey.IV);
        var encrypted = CryptoJS.AES.encrypt(cmdBodyString, key, { iv: iv });
        var encString = encrypted.ciphertext.toString(CryptoJS.enc.Base64);

        var newCmdBody = { "data": encString };
        this.axiosConfig.headers['Cookie'] = self.SessionCookies;
        axios.post('/api/calle', newCmdBody, this.axiosConfig)
        // success
            .then(function(response) {
                var cookie = response.headers['set-cookie'];
                if( cookie != undefined ) {
                    self.SessionCookies = cookie;
                    logger.debug("Set-Cookie:", cookie);
                }

                var result_data = response.data;
                if( result_data && result_data.length > 2 ) {
                    // AES 解密
                    var decrypted = CryptoJS.AES.decrypt(result_data, key, { iv: iv });
                    var decString = CryptoJS.enc.Utf8.stringify(decrypted);
                    var result = JSON.parse(decString);

                    if( result && result.result_code == "OK" ) {
                        var loginInfo = JSON.parse(result.result_data);
                        if( loginInfo ) {
                            // 計錄 loginInfo
                            self.loginInfo = loginInfo;
                            promise.succeed(loginInfo);
                        } else {
                            throw "FastLogin loginInfo is null";
                        }
                    } else {
                        throw "FastLogin fail, response: " + JSON.stringify(response.data);
                    }
                } else {
                    throw "FastLogin fail, response: " + JSON.stringify(response.data);
                }
            })
            .catch(function(error) {
                promise.fail(error);
            });

        return promise;
    };

    /**
     * @method getRsaPublicKey
     * @return {String} rsa key
     */
    BravoLogin.prototype._getRsaPublicKey = function() {
        // 產生 RSA Key, 長度 1024, Exponent 0x10001
        var rsa = new RSAKey();
        rsa.generate(1024, "10001");

        // 計錄到 RSAKey
        this.RSAKey = rsa;

        // 轉成 base64
        var pubKeyString = cryptico.b16to64(rsa.n.toString(16));
        var expKeyString = cryptico.b16to64(rsa.e.toString(16));

        // 封裝成 ASP.Net 的 XML 格式
        var pubKeyXML = "<RSAKeyValue><Modulus>" + pubKeyString + "</Modulus>" + "<Exponent>" + expKeyString + "</Exponent></RSAKeyValue>";

        // 以 Base64 String 編碼
        return CryptoJS.enc.Latin1.parse(pubKeyXML).toString(CryptoJS.enc.Base64);
    };

    /**
     * @method setAesKey
     * @param {String} key
     * @param {String} iv
     */
    BravoLogin.prototype._setAesKey = function(key, iv) {
        this.AESKey.Key = key.substring(0);
        this.AESKey.IV = iv.substring(0);
    };

    /**
     * @method decryptRsaData
     * @param {String} enc_data (BASE64 預設)
     * @return {String}
     */
    BravoLogin.prototype._decryptRsaData = function(enc_data) {
        var rsaKey = this.RSAKey;
        var decoded_str = CryptoJS.enc.Base64.parse(enc_data).toString();
        var resString = rsaKey.decrypt(decoded_str);
        return resString;
    };

    /**
     * @method sendRequest
     * @param {String} url
     * @param {String} headers
     * @param {String} params
     * @param {function} callback
     */
    BravoLogin.prototype._sendRequest = function(url,
                                                 headers,
                                                 params,
                                                 callback) {
        var config = { withCredentials: true };
        config.headers = headers;
        var cmdBody = JSON.parse(params);
        this.axiosConfig.headers['Cookie'] = self.SessionCookies;
        axios.post(url, cmdBody, config)
            .then(function(response) {
                callback(response.status, JSON.stringify(response.data));
            });
    };

    /**
     * @method sendEncryptionRequest
     * @param {String} url
     * @param {String} headers
     * @param {String} params
     * @param {function} callback
     */
    BravoLogin.prototype._sendEncryptionRequest = function(url,
                                                           headers,
                                                           params,
                                                           callback) {
        // AES 加密, 並轉 base64
        var key = CryptoJS.enc.Utf8.parse(this.AESKey.Key);
        var iv = CryptoJS.enc.Utf8.parse(this.AESKey.IV);
        var encrypted = CryptoJS.AES.encrypt(params, key, { iv: iv });
        var encString = encrypted.ciphertext.toString(CryptoJS.enc.Base64);

        var newCmdBody = { "data": encString };
        var config = { withCredentials: true };
        // TODO:
        config.headers['Cookie'] = self.SessionCookies;
        axios.post(url, newCmdBody, config)
            .then(function(response) {
                var cookie = response.headers['set-cookie'];
                if( cookie != undefined ) {
                    self.SessionCookies = cookie;
                    logger.debug("Set-Cookie:", cookie);
                }

                var result_data = response.data;
                if( result_data && result_data.length > 2 ) {
                    // AES 解密
                    var decrypted = CryptoJS.AES.decrypt(result_data, key, { iv: iv });
                    var decString = CryptoJS.enc.Utf8.stringify(decrypted);
                    //var result = JSON.parse(decString);
                    callback(response.status, decString);
                } else {
                    callback(response.status, response.data);
                }
            })
            .catch(function(error) {
                if( error.response ) {
                    // The request was made, but the server responded with a status code
                    // that falls out of the range of 2xx
                    callback(error.response.status, error.response.data);
                }
            });
    };

    BravoLogin.prototype._getPreloginEncryptKeyCmd = function() {
        var body = singleton.getBody();
        if( body ) {
            this.RSAKey = singleton.getKey();
        }
        else {
            var pubKeyBase64 = this._getRsaPublicKey();

            body = {
                "command": "GetPreloginEncryptKey",
                "data": JSON.stringify({ "Key": pubKeyBase64 }),
                "product": "apk",
            };

            singleton.setBody(body);
            singleton.setRsaKey(this.RSAKey);
        }

        return body;
    };

    BravoLogin.prototype._getGuestLoginCmd = function() {
        return {
            "command": "GuestLogin",
            "data": JSON.stringify({ "DeviceId": this.DeviceId }),
            "product": "apk",
        };
    };

    BravoLogin.prototype._getFastLoginCmd = function() {
        return {
            "command": "FastLogin",
            "data": JSON.stringify({
                "MemberId": this.loginInfo.MemberId,
                "LoginToken": this.loginInfo.LoginToken,
                "DeviceId": this.DeviceId,
            }),
            "product": "apk",
        };
    };

    exports.BravoLogin = BravoLogin;

}(typeof(global) !== "undefined" && typeof(global.process) !== "undefined" ? module : undefined,
    typeof(global) !== "undefined" && typeof(global.process) !== "undefined" ? require : this.Ice.__require,
    typeof(global) !== "undefined" && typeof(global.process) !== "undefined" ? exports : this));
