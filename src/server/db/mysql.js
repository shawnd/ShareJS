var MysqlDb, defaultOptions, mysql;

mysql = require('mysql');

defaultOptions = {
    schema: 'sharejs',
    uri: null,
    create_tables_automatically: true,
    operations_table: 'ops',
    snapshot_table: 'snapshots'
};

module.exports = MysqlDb = function(options) {
    var k;
    var operations_table;
    var snapshot_table;
    var v;
    var _ref;
    var _this = this;

    if (!(this instanceof MysqlDb)) {
        return new Db;
    }
    if (options == null) {
        options = {};
    }
    for (k in defaultOptions) {
        v = defaultOptions[k];
        if ((_ref = options[k]) == null) {
            options[k] = v;
        }
    }

    if(options.rollbar) {
        var rollbar = options.rollbar;
    }

    snapshot_table = options.schema && ("" + options.schema + "." + options.snapshot_table) || options.snapshot_table;
    operations_table = options.schema && ("" + options.schema + "." + options.operations_table) || options.operations_table;

    var client;

    /**
     * @see https://github.com/felixge/node-mysql/blob/master/Readme.md#server-disconnects
     */
    function mysqlConnect() {
        client = options.client || mysql.createConnection(options);

        /**
         * The server is either down or restarting (takes a while sometimes).
         */
        client.connect(function(err) {
            if (err) {
                console.log('error when connecting to db:', err);
                /**
                 * We introduce a delay before attempting to reconnect,
                 * to avoid a hot loop, and to allow our node script to
                 * process asynchronous requests in the meantime.
                 * If you're also serving http, display a 503 error.
                 */
                setTimeout(mysqlConnect, 2000);
            }

            client.on('error', function(err) {
                console.log('db error', err);
                /**
                 * Connection to the MySQL server is usually
                 * lost due to either server restart, or a
                 * connnection idle timeout (the wait_timeout
                 * server variable configures this)
                 */
                if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                    mysqlConnect();
                } else {
                    throw err;
                }
            });
        });
    }

    mysqlConnect();

    this.close = function() {
        return client.end();
    };

    this.initialize = function(callback) {
        var sql;
        console.warn('Creating mysql database tables');
        sql = "CREATE SCHEMA " + options.schema + ";";
        client.query(sql, function(error, result) {
            return error != null ? error.message : void 0;
        });
        sql = "CREATE TABLE " + snapshot_table + " (\n  doc varchar(900) NOT NULL,\n  v int NOT NULL,\n  type varchar(256) NOT NULL,\n  snapshot mediumtext NOT NULL,\n  meta text NOT NULL,\n  created_at timestamp NOT NULL,\n  CONSTRAINT snapshots_pkey PRIMARY KEY (doc, v)\n) ENGINE=MyISAM CHARSET=latin1;";
        client.query(sql, function(error, result) {
            return error != null ? error.message : void 0;
        });
        sql = "CREATE TABLE " + operations_table + " (\n  doc varchar(900) NOT NULL,\n  v int NOT NULL,\n  op mediumtext NOT NULL,\n  meta text NOT NULL,\n  CONSTRAINT operations_pkey PRIMARY KEY (doc, v)\n) ENGINE=MyISAM CHARSET=latin1;";
        return client.query(sql, function(error, result) {
            return typeof callback === "function" ? callback(error != null ? error.message : void 0) : void 0;
        });
    };
    this.create = function(docName, docData, callback) {
        var sql, values;
        sql = "INSERT INTO " + snapshot_table + " SET ?";

        try {
            values = {
                doc: docName,
                v: docData.v,
                snapshot: JSON.stringify(docData.snapshot),
                meta: JSON.stringify(docData.meta),
                type: docData.type,
                created_at: new Date
            };
        }
        catch(exception) {
            var errorMessage;
            var errorData;

            if(docData) {
                errorMessage = "Error stringifying document JSON during creation for document: " + docName;
                errorData = {
                    errorMessage: errorMessage,
                    doc: docName,
                    snapshot: docData.snapshot,
                    meta: docData.meta
                };
            }
            else {
                errorMessage = "Document data empty during creation for document: " + docName;
                errorData = {
                    errorMessage: errorMessage,
                    doc: docName
                };
            }

            if(rollbar) {
                rollbar.handleErrorWithPayloadData(exception, errorData);
            }

            console.error(errorData);

            return typeof callback === "function" ? callback(errorMessage) : void 0;
        }

        return client.query(sql, values, function(error, result) {
            if (!(error != null)) {
                return typeof callback === "function" ? callback() : void 0;
            } else if (error.toString().match("duplicate key value violates unique constraint") || error.toString().match("ER_DUP_ENTRY: Duplicate entry*")) {
                return typeof callback === "function" ? callback("Document already exists") : void 0;
            } else {
                return typeof callback === "function" ? callback(error != null ? error.message : void 0) : void 0;
            }
        });
    };
    this["delete"] = function(docName, dbMeta, callback) {
        var sql, values;
        sql = "DELETE FROM " + operations_table + "\nWHERE doc = ?";
        values = [docName];
        return client.query(sql, values, function(error, result) {
            if (!(error != null)) {
                sql = "DELETE FROM " + snapshot_table + "\nWHERE doc = ?";
                return client.query(sql, values, function(error, result) {
                    if (!(error != null) && result.affectedRows > 0) {
                        return typeof callback === "function" ? callback() : void 0;
                    } else if (!(error != null)) {
                        return typeof callback === "function" ? callback("Document does not exist") : void 0;
                    } else {
                        return typeof callback === "function" ? callback(error != null ? error.message : void 0) : void 0;
                    }
                });
            } else {
                return typeof callback === "function" ? callback(error != null ? error.message : void 0) : void 0;
            }
        });
    };
    this.getSnapshot = function(docName, callback) {
        var sql, values;
        sql = "SELECT *\nFROM " + snapshot_table + "\nWHERE doc = ?\nORDER BY v DESC\nLIMIT 1";
        values = [docName];
        return client.query(sql, values, function(error, result) {
            var data, row;
            if (!(error != null) && result.length > 0) {
                row = result[0];

                try {
                    data = {
                        v: row.v,
                        snapshot: JSON.parse(row.snapshot),
                        meta: JSON.parse(row.meta),
                        type: row.type
                    };
                }
                catch(exception) {
                    var errorMessage = "Error parsing document JSON during fetching of document: " + docName;
                    var errorData = {errorMessage : errorMessage, doc : docName, snapshot : row.snapshot, meta : row.meta};

                    if(rollbar) {
                        rollbar.handleErrorWithPayloadData(exception, errorData);
                    }

                    console.error(errorData);

                    return typeof callback === "function" ? callback(errorMessage) : void 0;
                }

                return typeof callback === "function" ? callback(null, data) : void 0;
            } else if (!(error != null)) {
                return typeof callback === "function" ? callback("Document does not exist") : void 0;
            } else {
                return typeof callback === "function" ? callback(error != null ? error.message : void 0) : void 0;
            }
        });
    };
    this.writeSnapshot = function(docName, docData, dbMeta, callback) {
        var sql, values;
        sql = "UPDATE " + snapshot_table + "\nSET ?\nWHERE doc = ?";

        try {
            values = {
                v: docData.v,
                snapshot: JSON.stringify(docData.snapshot),
                meta: JSON.stringify(docData.meta)
            };
        }
        catch(exception) {
            var errorMessage;
            var errorData;

            if(docData) {
                errorMessage = "Error stringifying document JSON during writing of document: " + docName;
                errorData = {errorMessage : errorMessage, doc : docName, snapshot : docData.snapshot, meta : docData.meta};
            }
            else {
                errorMessage = "Document data empty during writing of document: " + docName;
                errorData = {
                    errorMessage: errorMessage,
                    doc: docName
                };
            }

            if(rollbar) {
                rollbar.handleErrorWithPayloadData(exception, errorData);
            }

            console.error(errorData);

            return typeof callback === "function" ? callback(errorMessage) : void 0;
        }

        return client.query(sql, [values, docName], function(error, result) {
            if (!(error != null)) {
                return typeof callback === "function" ? callback() : void 0;
            } else {
                return typeof callback === "function" ? callback(error != null ? error.message : void 0) : void 0;
            }
        });
    };
    this.getOps = function(docName, start, end, callback) {
        var sql, values;
        end = end != null ? end - 1 : 2147483647;
        sql = "SELECT *\nFROM " + operations_table + "\nWHERE v BETWEEN ? AND ?\nAND doc = ?\nORDER BY v ASC";
        values = [start, end, docName];
        return client.query(sql, values, function(error, result) {
            var data;
            if (!(error != null)) {
                try {
                    data = result.map(function (row) {
                        return {
                            op: JSON.parse(row.op),
                            meta: JSON.parse(row.meta)
                        };
                    });
                }
                catch(exception) {
                    var errorMessage = "Error parsing ops JSON during ops fetch for document: " + docName;
                    var errorData = {errorMessage : errorMessage, doc : docName, fetchResult : result};

                    if(rollbar) {
                        rollbar.handleErrorWithPayloadData(exception, errorData);
                    }

                    console.error(errorData);

                    return typeof callback === "function" ? callback(errorMessage) : void 0;
                }

                return typeof callback === "function" ? callback(null, data) : void 0;
            } else {
                return typeof callback === "function" ? callback(error != null ? error.message : void 0) : void 0;
            }
        });
    };
    this.writeOp = function(docName, opData, callback) {
        var sql, values;
        sql = "INSERT INTO " + operations_table + " SET ?";

        try {
            values = {
                doc: docName,
                op: JSON.stringify(opData.op),
                v: opData.v,
                meta: JSON.stringify(opData.meta)
            };
        }
        catch(exception) {
            var errorMessage;
            var errorData;

            if(opData) {
                errorMessage = "Error stringifying ops JSON during ops write of ops: " + docName;
                errorData = {errorMessage : errorMessage, doc : docName, snapshot : opData.op, meta : opData.meta};
            }
            else {
                errorMessage = "Op data empty during writing of ops: " + docName;
                errorData = {
                    errorMessage: errorMessage,
                    doc: docName
                };
            }

            if(rollbar) {
                rollbar.handleErrorWithPayloadData(exception, errorData);
            }

            console.error(errorData);

            return typeof callback === "function" ? callback(errorMessage) : void 0;
        }

        return client.query(sql, values, function(error, result) {
            if (!(error != null)) {
                return typeof callback === "function" ? callback() : void 0;
            } else {
                return typeof callback === "function" ? callback(error != null ? error.message : void 0) : void 0;
            }
        });
    };
    if (options.create_tables_automatically) {
        client.query("SELECT * from " + snapshot_table + " LIMIT 0", function(error, result) {
            if (error != null ? error.message.match("(does not exist|ER_NO_SUCH_TABLE)") : void 0) {
                return _this.initialize();
            }
        });
    }
    return this;
};
