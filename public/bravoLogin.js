(function (module, require, exports) {
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
    if (typeof window === 'undefined') {
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
        __init__: function (callback) {
            this.callbackFn = callback;
        },
        Invoke: function (method, input) {
            var result = {
                result_code: RequestContract.ResultCode_Success,
                result_message: ""
            };
            var resultString = JSON.stringify(result);
            console.log("Invoke callback #" + this.proxyName + "//" + method + "//" + resultString + "//" + input);
            this.callbackFn(method, resultString, input);
        }
    });

    function BravoLogin(deviceID) {
        this.axiosConfig = {withCredentials: true, headers: {}};
        this.DeviceId = deviceID;
        //this.loginInfo = loginInfo;
        this.SessionCookies = [];
        this.RSAKey = {};
        this.AESKey = {Key: "", IV: ""};
        this.Language = "zh_TW";
        this.functionListener = {};
        this.connectionListener = [];
        // this.connectionListener.push(function(method, data) {
        //     console.log("connectionListener ==");
        //     console.log("Method: " + method);
        //     console.log("Data: " + JSON.stringify(data));
        // });
        this.glacier = null;
    }

    /**
     *  設定要登入的 Website URL
     * @param url
     */
    BravoLogin.prototype.setWebsite = function (url) {
        this.axiosConfig.baseURL = url;
        this.clearSessionCookies();
        this.setLanguageTag("zh_TW");
    };

    /**
     * @method clearSessionCookies
     */
    BravoLogin.prototype.clearSessionCookies = function () {
        this.SessionCookies = {};
    };

    /**
     * @method setLanguageTag
     * @param {String} lang_tag
     */
    BravoLogin.prototype.setLanguageTag = function (lang_tag) {
        this.Language = lang_tag;
    };


    /**
     * 登入並建立 Session
     * @param isGuestLogin
     * @returns {*} Ice.Promise 物件, 成功並傳出 MemberCenter.RouterSessionPrx
     */
    BravoLogin.prototype.createSession = function (isGuestLogin) {
        var self = this;

        var promise = new Ice.Promise();

        // 準備 GetPreloginEncryptKey Command Body
        var cmdBody = this._getPreloginEncryptKeyCmd();
        this.axiosConfig.headers['Cookie'] = self.SessionCookies;
        axios.post('/api/call', cmdBody, this.axiosConfig)
            .then(function (response) {
                //console.log("response.headers:",JSON.stringify(response.headers));
                // Check Cookie and save
                var cookie = response.headers['set-cookie'];
                if (cookie != undefined) {
                    self.SessionCookies = cookie;
                    //console.log("Set-Cookie:", cookie);
                }

                // success
                var result_code = response.data.result_code;
                if (result_code && result_code == "OK") {
                    //console.log("API_Call::OK");

                    // 取出 result_data
                    var result_data = response.data.result_data;

                    // 解密
                    var resString = self._decryptRsaData(result_data);
                    var aesKey = JSON.parse(resString);
                    // 儲存 AES_Key
                    if (aesKey) {
                        // 取得 AESKey 成功
                        self._setAesKey(aesKey.Key, aesKey.IV);

                        // 處理登入
                        self._login(isGuestLogin).then(
                            // success
                            function (session) {
                                promise.succeed(session);
                            }
                            ).exception(
                            function (ex) {
                                promise.fail(ex);
                            }
                            );
                    }
                    else {
                        delete self.AESKey;
                        // 取得 AESKey 失敗
                        throw new Error("PreloginEncryptKey Error");
                    }
                }
            })
            .catch(function (error) {
                console.error(error);
                promise.fail(error.toString());
            });

        return promise;
    };

    /**
     * @method logout
     */
    BravoLogin.prototype.logout = function () {
        // 讓他斷線
        this.glacier.communicator.destroy();
    };

    BravoLogin.prototype.registerAllFunctionalListener = function () {
        var promise = new Ice.Promise();
        Ice.Promise.all(this.CallbackableProxyList.map(proxy =>
            this._registerFunctionalListener(proxy[0], (method, result, data) => {
                // console.log("=================== [" + proxy[0] + "] ===================");
                // console.log("Method: " + method);
                // console.log("Result: " + JSON.stringify(result));
                // console.log("Data: " + JSON.stringify(data));
                // console.log("###################");
            }, proxy[1])
            )).then(() => promise.succeed()).exception(() => promise.fail());

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
    BravoLogin.prototype._registerFunctionalListener = function (proxy_name,
                                                                 callback,
                                                                 register_to_ice) {

        var promise;
        // 需要對 ice add callback
        if (register_to_ice) {
            // 對 Ice :: addCallback
            var self = this;
            var proxy = self.glacier.communicator.stringToProxy(proxy_name);
            var invokablePrx = ClientFacade.InvokablePrx.uncheckedCast(proxy);
            var callbackPrx;
            var categoryString = "";
            promise =
                self.glacier.router.getCategoryForClient().then(function (category) {
                        categoryString = category;
                        return self.glacier.communicator.createObjectAdapterWithRouter("", self.glacier.router);
                    }
                ).then(function (adapter) {
                    //
                    // Create a callback receiver servant and add it to
                    // the object adapter.
                    //
                    var r = adapter.add(new InvokeCallback(callback), new Ice.Identity(Ice.generateUUID(), categoryString));

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
                }).then(function (result) {
                    if (result.resultCode == RequestContract.RequestResult.ResultCode_Success) {
                        // AddCallback 成功
                        //console.log(proxy_name, "AddCallback 成功");

                        // 計錄callbackPrx 到 functionListener 中
                        self.functionListener[proxy_name].callbackPrx = callbackPrx;
                        self._callconnectionLister(BravoLogin.ClientFacadeCommand.AddCallbackSucceed, JSON.stringify({ProxyName: proxy_name}));

                        promise.succeed();
                    }
                    else {
                        // AddCallback 呼叫成功，但回傳錯誤
                        cc.warn(proxy_name, "AddCallback 失敗!!", "resultCode=", result.resultCode);
                        cc.warn(proxy_name, "AddCallback 失敗!!", "resultMessage=", result.resultMessage);
                        self._callconnectionLister(BravoLogin.ClientFacadeCommand.InvokeError, JSON.stringify({ProxyName: proxy_name}));

                        promise.fail();
                    }

                }).exception(function (ex) {
                    // InvokeError
                    //console.log(proxy_name, "AddCallback Error", ex.toString());

                    self._callconnectionLister(BravoLogin.ClientFacadeCommand.AddCallbackError, JSON.stringify({ProxyName: proxy_name}));

                    promise.fail();
                });
        }
        else {
            promise = new Ice.Promise();
            promise.succeed();
        }

        // 計錄到 functionListener 中
        this.functionListener[proxy_name] = {"callback": callback, "register_to_ice": register_to_ice};
        return promise;
    };

    /**
     * @method unregisterFunctionalListener
     * @param {String} proxy_name
     */
    BravoLogin.prototype._unregisterFunctionalListener = function (proxy_name) {
        var callbackInfo = this.functionListener[proxy_name];

        // Check 是否要對 Ice RemoveCallback
        if (callbackInfo.register_to_ice) {
            // 對 Ice :: RemoveCallback
            var self = this;
            var proxy = self.glacier.communicator.stringToProxy(proxy_name);
            var invokablePrx = ClientFacade.InvokablePrx.uncheckedCast(proxy);
            if (typeof callbackInfo.callbackPrx != 'undefined') {
                invokablePrx.RemoveCallback(callbackPrx, self.glacier.session).then(
                    function () {
                        // AddCallback 成功
                        console.log(proxy_name, "RemoveCallback 成功");
                        // TODO: Test
                        debugger;
                    }
                ).exception(
                    function (ex) {
                        // InvokeError
                        console.log(proxy_name, "RemoveCallback Error", ex.toString());
                        // TODO: Test
                        debugger;
                        self._callconnectionLister(BravoLogin.ClientFacadeCommand.RemoveCallbackError, JSON.stringify({ProxyName: proxy_name}));
                    });
            }
        }

        delete self.functionListener[proxy_name];
    };

    /**
     *  呼叫所有 connectionListener
     * @param method
     * @param data
     * @private
     */
    BravoLogin.prototype._callconnectionLister = function (method, data) {
        this.connectionListener.forEach(function (listener) {
            listener(method, data);
        }, this);
    };

    BravoLogin.prototype._callFunctionalListener = function (proxy_name, method, result, data) {
        if (this.functionListener.hasOwnProperty(proxy_name)) {
            this.functionListener[proxy_name].callback(method, result, data);
        }
    };

    /**
     *  登入處理, 區分 GuestLogin 與 FastLogin
     * @param isGuestLogin
     * @returns {*} Ice.Promise 物件, 成功必導出 MemberCenter.RouterSessionPrx
     * @private
     */
    BravoLogin.prototype._login = function (isGuestLogin) {
        var self = this;
        var promise = new Ice.Promise();

        if (isGuestLogin) {
            // guest 登入
            self._guestLogin().then(
                // success
                function () {
                    // guest 登入成功
                    console.log("guest 登入成功");

                    var glacier = new BravoGlacier(self.DeviceId, self.loginInfo);
                    self.glacier = glacier;
                    return glacier.createSession();
                }
            ).then(
                // success
                function (session) {
                    console.log("glacier 登入成功");
                    promise.succeed(session);
                }
                // // fail
                //     console.error("glacier 登入失敗");
                //     promise.fail(info);
                // }
            ).exception(
                function (ex) {
                    console.error(ex.toString());
                    promise.fail(ex.toString());
                }
            );
        } else {
            // fast 登入
            self._fastLogin().then(
                // success
                function () {
                    // fast 登入成功
                    console.log("fast 登入成功");

                    var glacier = new BravoGlacier(self.DeviceId, self.loginInfo);
                    self.glacier = glacier;
                    return glacier.createSession();
                }
            ).then(
                // success
                function (session) {
                    console.log("glacier 登入成功");
                    promise.succeed(session);
                }
            ).exception(
                function (ex) {
                    console.error(ex.toString());
                    promise.fail(ex.toString());
                }
            );
        }

        return promise;
    };

    BravoLogin.prototype._guestLogin = function () {
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
        var encrypted = CryptoJS.AES.encrypt(cmdBodyString, key, {iv: iv});
        var encString = encrypted.ciphertext.toString(CryptoJS.enc.Base64);

        var newCmdBody = {"data": encString};
        this.axiosConfig.headers['Cookie'] = self.SessionCookies;
        axios.post('/api/calle', newCmdBody, this.axiosConfig)
        // success
            .then(function (response) {
                var cookie = response.headers['set-cookie'];
                if (cookie != undefined) {
                    self.SessionCookies = cookie;
                    console.log("Set-Cookie:", cookie);
                }

                var result_data = response.data;
                if (result_data && result_data.length > 2) {
                    // AES 解密
                    var decrypted = CryptoJS.AES.decrypt(result_data, key, {iv: iv});
                    var decString = CryptoJS.enc.Utf8.stringify(decrypted);
                    var result = JSON.parse(decString);

                    if (result && result.result_code == "OK") {
                        console.log("API_Calle::OK");
                        var loginInfo = JSON.parse(result.result_data);
                        if (loginInfo) {
                            // 計錄 loginInfo
                            self.loginInfo = loginInfo;
                            console.log("GuestLogin 成功");
                            promise.succeed(loginInfo);
                        } else {
                            promise.fail("GuestLogin loginInfo is null");
                        }

                    } else {
                        promise.fail("GuestLogin result Error");
                    }
                } else {
                    promise.fail("GuestLogin result Error");
                }
            })
            .catch(function (error) {
                console.error(error);
                promise.fail(error.toString());
            });

        return promise;
    };

    BravoLogin.prototype._fastLogin = function () {
        var self = this;

        var promise = new Ice.Promise();

        // 準備 FastLogin Command Body
        var cmdBody = this._getFastLoginCmd();
        var cmdBodyString = JSON.stringify(cmdBody);

        // AES 加密, 並轉 base64
        var key = CryptoJS.enc.Utf8.parse(self.AESKey.Key);
        var iv = CryptoJS.enc.Utf8.parse(self.AESKey.IV);
        var encrypted = CryptoJS.AES.encrypt(cmdBodyString, key, {iv: iv});
        var encString = encrypted.ciphertext.toString(CryptoJS.enc.Base64);

        var newCmdBody = {"data": encString};
        this.axiosConfig.headers['Cookie'] = self.SessionCookies;
        axios.post('/api/calle', newCmdBody, this.axiosConfig)
        // success
            .then(function (response) {
                var cookie = response.headers['set-cookie'];
                if (cookie != undefined) {
                    self.SessionCookies = cookie;
                    console.log("Set-Cookie:", cookie);
                }

                var result_data = response.data;
                if (result_data && result_data.length > 2) {
                    // AES 解密
                    var decrypted = CryptoJS.AES.decrypt(result_data, key, {iv: iv});
                    var decString = CryptoJS.enc.Utf8.stringify(decrypted);
                    var result = JSON.parse(decString);

                    if (result && result.result_code == "OK") {
                        console.log("API_Calle::OK");
                        var loginInfo = JSON.parse(result.result_data);
                        if (loginInfo) {
                            // 計錄 loginInfo
                            self.loginInfo = loginInfo;
                            console.log("FastLogin 成功!!");
                            promise.succeed(loginInfo);
                        } else {
                            promise.fail("FastLogin loginInfo is null");
                        }
                    } else {
                        console.error("FastLogin result Error!!");
                        promise.fail("FastLogin result Error");
                    }
                } else {
                    console.error("登入失敗!!");
                    promise.fail("FastLogin result Error");
                }
            })
            .catch(function (ex) {
                console.log(error);
                promise.fail(error.toString());
            });

        return promise;
    };

    /**
     * @method getRsaPublicKey
     * @return {String} rsa key
     */
    BravoLogin.prototype._getRsaPublicKey = function () {
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
        var pubKeyBase64 = CryptoJS.enc.Latin1.parse(pubKeyXML).toString(CryptoJS.enc.Base64);

        return pubKeyBase64;
    };

    /**
     * @method setAesKey
     * @param {String} key
     * @param {String} iv
     */
    BravoLogin.prototype._setAesKey = function (key,
                                                iv) {
        this.AESKey.Key = key.substring(0);
        this.AESKey.IV = iv.substring(0);
    };

    /**
     * @method decryptRsaData
     * @param {String} enc_data (BASE64 預設)
     * @return {String}
     */
    BravoLogin.prototype._decryptRsaData = function (enc_data) {
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
    BravoLogin.prototype._sendRequest = function (url,
                                                  headers,
                                                  params,
                                                  callback) {
        var config = {withCredentials: true};
        config.headers = headers;
        var cmdBody = JSON.parse(params);
        this.axiosConfig.headers['Cookie'] = self.SessionCookies;
        axios.post(url, cmdBody, config)
            .then(function (response) {
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
    BravoLogin.prototype._sendEncryptionRequest = function (url,
                                                            headers,
                                                            params,
                                                            callback) {
        // AES 加密, 並轉 base64
        var key = CryptoJS.enc.Utf8.parse(this.AESKey.Key);
        var iv = CryptoJS.enc.Utf8.parse(this.AESKey.IV);
        var encrypted = CryptoJS.AES.encrypt(params, key, {iv: iv});
        var encString = encrypted.ciphertext.toString(CryptoJS.enc.Base64);

        var newCmdBody = {"data": encString};
        var config = {withCredentials: true};
        // TODO:
        config.headers['Cookie'] = self.SessionCookies;
        axios.post(url, newCmdBody, config)
            .then(function (response) {
                var cookie = response.headers['set-cookie'];
                if (cookie != undefined) {
                    self.SessionCookies = cookie;
                    console.log("Set-Cookie:", cookie);
                }

                var result_data = response.data;
                if (result_data && result_data.length > 2) {
                    // AES 解密
                    var decrypted = CryptoJS.AES.decrypt(result_data, key, {iv: iv});
                    var decString = CryptoJS.enc.Utf8.stringify(decrypted);
                    //var result = JSON.parse(decString);
                    callback(response.status, decString);
                } else {
                    callback(response.status, response.data);
                }
            })
            .catch(function (error) {
                if (error.response) {
                    // The request was made, but the server responded with a status code
                    // that falls out of the range of 2xx
                    callback(error.response.status, error.response.data);
                }
            });
    };

    BravoLogin.prototype._getPreloginEncryptKeyCmd = function () {
        if (this.RSAKey) delete this.RSAKey;

        var pubKeyBase64 = this._getRsaPublicKey();
        var body = {
            "command": "GetPreloginEncryptKey",
            "data": JSON.stringify({"Key": pubKeyBase64}),
            "product": "apk",
        };

        return body;
    };

    BravoLogin.prototype._getGuestLoginCmd = function () {
        var body = {
            "command": "GuestLogin",
            "data": JSON.stringify({"DeviceId": this.DeviceId}),
            "product": "apk",
        };

        return body;
    };

    BravoLogin.prototype._getFastLoginCmd = function () {
        var body = {
            "command": "FastLogin",
            "data": JSON.stringify({
                "MemberId": this.loginInfo.MemberId,
                "LoginToken": this.loginInfo.LoginToken,
                "DeviceId": this.DeviceId,
            }),
            "product": "apk",
        };

        return body;
    };

    exports.BravoLogin = BravoLogin;

}(typeof(global) !== "undefined" && typeof(global.process) !== "undefined" ? module : undefined,
    typeof(global) !== "undefined" && typeof(global.process) !== "undefined" ? require : this.Ice.__require,
    typeof(global) !== "undefined" && typeof(global.process) !== "undefined" ? exports : this));
