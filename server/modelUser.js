/**
 * Created by benson on 2016/11/24.
 */

// 這是一個資料(model)類別
'use strict'

// ORM - Sequelize
var Sequelize = require('sequelize');

function helper() {
    this.isInit = false;
    this.tb_Users = {};

    this.init = function () {
        var self = this;

        this.sequelizeDB = new Sequelize('database', 'username', 'password', {
            host: 'localhost',
            dialect: 'sqlite',

            pool: {
                max: 5,
                min: 0,
                idle: 10000
            },

            // disable logging; default: console.log
            logging: false,

            // SQLite only
            storage: 'DB/project.sqlite',
        });

        this.tb_Users = this.sequelizeDB.define('StressUsers', {
            id: {type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, unique: true},
            MemberId: {type: Sequelize.INTEGER, allowNull: false},
            DeviceId: {type: Sequelize.TEXT, allowNull: false},
            LoginToken: {type: Sequelize.TEXT, allowNull: false},
        });

        this.sequelizeDB.sync().then(function () {
            self.isInit = true;
        });
    };

    this.init();
}

helper.prototype.get = function (id, callback) {
    if (id) {
        this.tb_Users.find({where: {id: id}}).then(
            function (obj) {
                if (obj) callback(null, obj);
                else callback(null, {});
            });
    }
    else {
        this.tb_Users.findAll().then(
            function (array) {
                if (array) callback(null, array);
                else callback(null, {});
            });
    }
};

// 設定設定資訊, 非同步方法
helper.prototype.set = function (id, value, callback) {
    if (id) {
        this.tb_Users.findOrCreate({where: {id: id}}).spread(function (obj) {
            for (var vKey in value) {
                obj.setDataValue(vKey, value[vKey]);
            }
            obj.save().then(callback(null, obj));
        });
    }
};

// 新增資料, 非同步方法
helper.prototype.add = function (value, callback) {
    this.tb_Users.create(value).then(function (obj) {
        console.log('User add OK');
        if (callback instanceof Function) callback(null, obj);
    });
};

// 刪除設定資訊, 非同步方法
helper.prototype.del = function (id, callback) {
    this.tb_Users.destroy({where: {id: id}}).then(function () {
        if (callback instanceof Function) callback(null, null);
    });
};

/* ************************************************************************
 SINGLETON CLASS DEFINITION
 ************************************************************************ */
helper.instance = null;

/**
 * Singleton getInstance definition
 * @return singleton class
 */
helper.getInstance = function () {
    if (this.instance === null) {
        this.instance = new helper();
    }
    return this.instance;
}

module.exports = helper.getInstance();