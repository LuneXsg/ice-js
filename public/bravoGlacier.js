(function(module, require, exports) {
    var Ice = require('ice').Ice;
    var Glacier2 = require("ice").Glacier2;
    var express = require('express');
    var config = require('../config')[express().get('env')];
    var RequestContract = require('../public/RequestContract').SGTech.AtlanticCity.RequestContract;
    var MemberCenter = require('../public/RouterSession').SGTech.AtlanticCity.MemberCenter;
    //var ClientFacade = require('../public/ClientDynamicInvoke').SGTech.AtlanticCity.ClientFacade;


    /**
     * Bravo Casino Glacier 初始化建構式
     * @param loginInfo , 登入需要的資訊, 由 Web Login 取得
     * @private
     */
    function BravoGlacier(deviceId, loginInfo) {
        this.GlacierConnectionString = "";
        this.router = undefined;
        this.session = undefined;
        this.communicator = undefined;

        if( loginInfo ) {
            this.deviceId = deviceId;
            this.loginInfo = loginInfo;

            // 取 loginInfo.GlacierConnectionString (連線字串), 為 Default router
            this.GlacierConnectionString = "AtlanticCity.Glacier2/router :tcp -h " + config.stunnel_host + " -p 8000";
            this.GlacierConnectionString += " :tcp -h " + config.stunnel_host + " -p 8001";
            this.GlacierConnectionString += " :tcp -h " + config.stunnel_host + " -p 8002";
            this.GlacierConnectionString += " :tcp -h " + config.stunnel_host + " -p 8003";
            this.GlacierConnectionString += " :tcp -h " + config.stunnel_host + " -p 8004";
            this.GlacierConnectionString += " :tcp -h " + config.stunnel_host + " -p 8005";

            console.log("connectionString: " + JSON.stringify(this.GlacierConnectionString));

            //
            // Initialize the communicator with the Ice.Default.Router property
            //
            var initData = new Ice.InitializationData();
            initData.properties = Ice.createProperties();
            initData.properties.setProperty("Ice.Default.Router", this.GlacierConnectionString);

            // Active connection management
            initData.properties.setProperty("Ice.ACM.Close", "0"); // CloseOff
            initData.properties.setProperty("Ice.ACM.Heartbeat", "3"); // HeartbeatAlways
            initData.properties.setProperty("Ice.ACM.Timeout", "30");
            // Invoke timeout
            initData.properties.setProperty("Ice.Default.InvocationTimeout", "10000");
            initData.properties.setProperty("Ice.RetryIntervals", "-1");

            this.communicator = Ice.initialize(initData);
        }
        else {
            throw new Error("new bravo.Glacier must have a loginInfo with constructor!!");
        }
    }

    /**
     *  與 Glacier 連線驗證
     * @returns {*} SGTech.AtlanticCity.MemberCenter.RouterSessionPrx
     */
    BravoGlacier.prototype.createSession = function() {
        var self = this;

        return Glacier2.RouterPrx.checkedCast(self.communicator.getDefaultRouter()).then(
            function(router) {
                // 計錄 RouterPrx
                self.router = router;

                // 設定登入資訊
                var context = new Ice.HashMap();
                context.set(RequestContract.Context_Platform, "Android");
                context.set(RequestContract.Context_Product, "Robot");
                context.set(RequestContract.Context_Language, "zh_TW");
                context.set(RequestContract.Context_WebSessionId, self.loginInfo.AuthCode);
                context.set(RequestContract.Context_MemberId, self.loginInfo.MemberId.toString());
                context.set(RequestContract.Context_DeviceId, self.deviceId.toString());

                console.log('createSession() createSessionFromSecureConnection');
                return router.createSessionFromSecureConnection(context).then(
                    function(session) {
                        console.log('createSession() uncheckedCast');
                        self.session = MemberCenter.RouterSessionPrx.uncheckedCast(session);
                        return self.session;
                    }
                );
            }
        ).exception(
            function(ex) {
                //
                // Handle any exceptions that occurred during session creation.
                //
                if( ex instanceof Glacier2.PermissionDeniedException ) {
                    console.error("permission denied:\n" + ex.reason);
                } else if( ex instanceof Glacier2.CannotCreateSessionException ) {
                    console.error("cannot create session:\n" + ex.reason);
                } else if( ex instanceof Ice.ConnectFailedException ) {
                    console.error("connection to server failed");
                } else {
                    console.error(ex, ex.stack);
                }
                if( self.communicator ) {
                    self.communicator.destroy();
                }

                throw ex;
            }
        );
    };

    /**
     *  Get MemberID
     * @returns {*}  Ice.AsyncResult
     */
    BravoGlacier.prototype.getMemberID = function() {
        return this.session.GetMemberId();
    };

    BravoGlacier.prototype.disconnect = function() {
        if( this.communicator ) {
            this.communicator.destroy();
            this.communicator = null;
        }
    };

    exports.BravoGlacier = BravoGlacier;

}(typeof(global) !== "undefined" && typeof(global.process) !== "undefined" ? module : undefined,
    typeof(global) !== "undefined" && typeof(global.process) !== "undefined" ? require : this.Ice.__require,
    typeof(global) !== "undefined" && typeof(global.process) !== "undefined" ? exports : this));
