// This implements the network API for ShareJS.
//
// The wire protocol is speccced out here:
// https://github.com/josephg/ShareJS/wiki/Wire-Protocol
//
// When a client connects the server first authenticates it and sends:
//
// S: {auth:<agent session id>}
//  or
// S: {auth:null, error:'forbidden'}
//
// After that, the client can open documents:
//
// C: {doc:'foo', open:true, snapshot:null, create:true, type:'text'}
// S: {doc:'foo', open:true, snapshot:{snapshot:'hi there', v:5, meta:{}}, create:false}
//
// ...
//
// The client can send open requests as soon as the socket has opened - it doesn't need to
// wait for auth.
//
// The wire protocol is documented here:
// https://github.com/josephg/ShareJS/wiki/Wire-Protocol
var AUTH_TIMEOUT, hat, syncQueue;

hat = require('hat');

syncQueue = require('./syncqueue');

stats = require('./stats');

AUTH_TIMEOUT = 10000;

// session should implement the following interface:
//   headers
//   address
//   stop()
//   ready()
//   send(msg)
//   removeListener()
//   on(event, handler) - where event can be 'message' or 'closed'
exports.handler = function(session, createAgent) {
    var abort, agent, buffer, bufferMsg, close, data, docState, failAuthentication, handleClose, handleMessage, handleOp, handleOpenCreateSnapshot, lastReceivedDoc, lastSentDoc, open, send, timeout, handleBuffer;
    data = {
        headers: session.headers,
        remoteAddress: session.address
    };

    // This is the user agent through which a connecting client acts. It is set when the
    // session is authenticated. The agent is responsible for making sure client requests are
    // properly authorized, and metadata is kept up to date.
    agent = null;

    // To save on network traffic, the agent & server can leave out the docName with each message to mean
    // 'same as the last message'
    lastSentDoc = null;
    lastReceivedDoc = null;

    // Map from docName -> {queue, listener if open}
    docState = {};
    abort = function() {
        if (session.stop) {
            return session.stop();
        } else {
            return session.close();
        }
    };

    // We'll only handle one message from each client at a time.
    handleMessage = function(query) {
        var error, _name, _ref, _ref1, _ref2;
        error = null;
        if (!(query.doc === null || typeof query.doc === 'string' || (query.doc === void 0 && lastReceivedDoc))) {
            error = 'Invalid docName';
        }
        if ((_ref = query.create) !== true && _ref !== (void 0)) {
            error = "'create' must be true or missing";
        }
        if ((_ref1 = query.open) !== true && _ref1 !== false && _ref1 !== (void 0)) {
            error = "'open' must be true, false or missing";
        }
        if ((_ref2 = query.snapshot) !== null && _ref2 !== (void 0)) {
            error = "'snapshot' must be null or missing";
        }
        if (!(query.type === void 0 || typeof query.type === 'string')) {
            error = "'type' invalid";
        }
        if (!(query.v === void 0 || (typeof query.v === 'number' && query.v >= 0))) {
            error = "'v' invalid";
        }
        if (error) {
            console.warn("Invalid query " + query + " from " + agent.sessionId + ": " + error);
            return abort();
        }

        // The agent can specify null as the docName to get a random doc name.
        if (query.doc === null) {
            query.doc = lastReceivedDoc = hat();
        } else if (query.doc !== void 0) {
            lastReceivedDoc = query.doc;
        } else {
            if (!lastReceivedDoc) {
                // The disconnect handler will be called when we do this, which will clean up the open docs.
                console.warn("msg.doc missing in query " + query + " from " + agent.sessionId);
                return abort();
            }
            query.doc = lastReceivedDoc;
        }
        docState[_name = query.doc] || (docState[_name] = {
            queue: syncQueue(function(query, callback) {
                var _ref3;
                // When the session is closed, we'll nuke docState. When that happens, no more messages
                // should be handled.
                if (!docState) {
                    return callback();
                }

                // Close messages are {open:false}
                if (query.open === false) {
                    return handleClose(query, callback);
                // Open messages are {open:true}. There's a lot of shared logic with getting snapshots
                // and creating documents. These operations can be done together; and I'll handle them
                // together.
                } else if (query.open || query.snapshot === null || query.create) {
                    // You can open, request a snapshot and create all in the same
                    // request. They're all handled together.
                    return handleOpenCreateSnapshot(query, callback);
                 // The socket is submitting an op.
                } else if ((query.op != null) || (((_ref3 = query.meta) != null ? _ref3.path : void 0) != null)) {
                    return handleOp(query, callback);
                } else {
                    console.warn("Invalid query " + (JSON.stringify(query)) + " from " + agent.sessionId);
                    abort();
                    return callback();
                }
            })
        });

        // ... And add the message to the queue.
        return docState[query.doc].queue(query);
    };

    // // Some utility methods for message handlers


    // Send a message to the socket.
    // msg _must_ have the doc:DOCNAME property set. We'll remove it if its the same as lastReceivedDoc.
    send = function(response) {
        if (response.doc === lastSentDoc) {
            delete response.doc;
        } else {
            lastSentDoc = response.doc;
        }

        // Its invalid to send a message to a closed session. We'll silently drop messages if the
        // session has closed.
        if (session.ready()) {
            return session.send(response);
        }
    };

    // Open the given document name, at the requested version.
    // callback(error, version)
    open = function(docName, version, callback) {
        var listener;
        if (!docState) {
            return callback('Session closed');
        }
        if (docState[docName].listener) {
            return callback('Document already open');
        }

        //p "Registering listener on //{docName} by //{socket.id} at //{version}"
        docState[docName].listener = listener = function(opData) {
            var opMsg;
            // Listener can be called after close
            if (!(docState != null ? docState[docName] : void 0)) {
                return;
            }

            //p "listener doc://{docName} opdata://{i opData} v://{version}"
            if (docState[docName].listener !== listener) {
                throw new Error('Consistency violation - doc listener invalid');
            }

            // Skip the op if this socket sent it.
            if (opData.meta.source === agent.sessionId) {
                return;
            }
            opMsg = {
                doc: docName,
                op: opData.op,
                v: opData.v,
                meta: opData.meta
            };
            return send(opMsg);
        };

        // Tell the socket the doc is open at the requested version
        return agent.listen(docName, version, listener, function(error, v) {
            if (error && docState) {
                delete docState[docName].listener;
            }
            return callback(error, v);
        });
    };

    // Close the named document.
    // callback([error])
    close = function(docName, callback) {

        var listener;
        //p "Closing //{docName}"
        if (!docState) {
            return callback('Session closed');
        }
        listener = docState[docName].listener;
        if (listener == null) {
            return callback('Doc already closed');
        }
        agent.removeListener(docName);
        delete docState[docName].listener;
        return callback();
    };

    // Handles messages with any combination of the open:true, create:true and snapshot:null parameters
    handleOpenCreateSnapshot = function(query, finished) {
        var callback, docData, docName, msg, step1Create, step2Snapshot, step3Open;
        docName = query.doc;
        msg = {
            doc: docName
        };
        callback = function(error) {
            if (error) {
                if (msg.open === true) {
                    close(docName);
                }
                if (query.open === true) {
                    msg.open = false;
                }
                if (query.snapshot !== void 0) {
                    msg.snapshot = null;
                }
                delete msg.create;
                msg.error = error;
            }
            send(msg);
            return finished();
        };
        if (query.doc == null) {
            return callback('No docName specified');
        }
        if (query.create === true) {
            if (typeof query.type !== 'string') {
                return callback('create:true requires type specified');
            }
        }
        if (query.meta !== void 0) {
            if (!(typeof query.meta === 'object' && Array.isArray(query.meta) === false)) {
                return callback('meta must be an object');
            }
        }
        docData = void 0;

        // This is implemented with a series of cascading methods for each different type of
        // thing this method can handle. This would be so much nicer with an async library. Welcome to
        // callback hell.
        step1Create = function() {
            if (query.create !== true) {
                return step2Snapshot();
            }

            // The document obviously already exists if we have a snapshot.
            if (docData) {
                msg.create = false;
                return step2Snapshot();
            } else {
                return agent.create(docName, query.type, query.meta || {}, function(error) {
                    if (error === 'Document already exists') {
                        return agent.getSnapshot(docName, function(error, data) {
                            if (error) {
                                return callback(error);
                            }
                            docData = data;
                            msg.create = false;
                            return step2Snapshot();
                        });
                    } else if (error) {
                        return callback(error);
                    } else {
                        msg.create = true;
                        return step2Snapshot();
                    }
                });
            }
        };

        // The socket requested a document snapshot
        //        if query.create or query.open or query.snapshot == null
        //          msg.meta = docData.meta
        step2Snapshot = function() {

            // Skip inserting a snapshot if the document was just created.
            if (query.snapshot !== null || msg.create === true) {
                step3Open();
                return;
            }

            // The document obviously already exists if we have a snapshot.
            if (docData) {
                msg.v = docData.v;
                if (query.type !== docData.type.name) {
                    msg.type = docData.type.name;
                }
                msg.snapshot = docData.snapshot;
            } else {
                return callback('Document does not exist');
            }
            return step3Open();
        };

        // Attempt to open a document with a given name. Version is optional.
        // callback(opened at version) or callback(null, errormessage)
        step3Open = function() {
            if (query.open !== true) {
                return callback();
            }

            // Verify the type matches
            if (query.type && docData && query.type !== docData.type.name) {
                return callback('Type mismatch');
            }
            return open(docName, query.v, function(error, version) {
                if (error) {
                    return callback(error);
                }

                // + Should fail if the type is wrong.
                //p "Opened //{docName} at //{version} by //{socket.id}"
                msg.open = true;
                msg.v = version;
                return callback();
            });
        };

        // Technically, we don't need a snapshot if the user called create but not open or createSnapshot,
        // but no clients do that yet anyway.
        if (query.snapshot === null || query.open === true) {
            return agent.getSnapshot(query.doc, function(error, data) {
                if (error && error !== 'Document does not exist') {
                    return callback(error);
                }
                docData = data;
                return step1Create();
            });
        } else {
            return step1Create();
        }
    };

    // The socket closes a document
    handleClose = function(query, callback) {
        return close(query.doc, function(error) {
            if (error) {

                // An error closing still results in the doc being closed.
                send({
                    doc: query.doc,
                    open: false,
                    error: error
                });
            } else {
                send({
                    doc: query.doc,
                    open: false
                });
            }
            return callback();
        });
    };

    // We received an op from the socket
    // ...
    //throw new Error 'No version specified' unless query.v?
    handleOp = function(query, callback) {
        var opData, _ref;
        opData = {
            v: query.v,
            op: query.op,
            meta: query.meta,
            dupIfSource: query.dupIfSource
        };

        // If it's a metaOp don't send a response
        return agent.submitOp(query.doc, opData, !(opData.op != null) && (((_ref = opData.meta) != null ? _ref.path : void 0) != null) ? callback : function(error, appliedVersion) {
            var msg;
            //p "Sending error to socket: //{error}"
            msg = error ? {
                doc: query.doc,
                v: null,
                error: error
            } : {
                doc: query.doc,
                v: appliedVersion
            };
            send(msg);
            return callback();
        });
    };

    // Authentication process has failed, send error and stop session
    failAuthentication = function(error) {
        session.send({
            auth: null,
            error: error
        });
        return session.stop();
    };

    // Wait for client to send an auth message, but don't wait forever
    timeout = setTimeout(function() {
        return failAuthentication('Timeout waiting for client auth message');
    }, AUTH_TIMEOUT);

    buffer = [];

    var isAuthed = false;
    // Walk through message buffer and handle all messages
    // if we are already authorized.
    handleBuffer = function() {

        // If we are not authed, we do not want to handle the buffer.
        if (!isAuthed) {
            return;
        }
        var length = buffer.length;
        for (var i = 0; i < length; i++) {
            handleMessage(buffer.shift());
        }
    };

    // Hook up handler for every message received.
    // On msg.auth call it will 'connect' and run the authoriation for that.
    // Until authorized messages will be stored in the buffer, and will be handled
    // when authorization is successful.
    // When authorized single message will be handled in the buffer each time.
    session.on('message', function(msg) {

        if (typeof msg.auth !== 'undefined') {
            data.authentication = msg.auth;

            // Create the 'connection'.
            createAgent(data, function(error, agent_) {

                // Clear the waiting for auth timeout.
                clearTimeout(timeout);

                if (error) {
                    // The client is not authorized, so they shouldn't try and reconnect.
                    return failAuthentication(error);
                } else {
                    agent = agent_;
                    stats.addUserAgent(agent.sessionId, agent);
                    session.send({
                        auth: agent.sessionId
                    });
                    isAuthed = true;
                    handleBuffer();
                }
            });
        } else {
            buffer.push(msg);
        }

        handleBuffer();
    });

    return session.on('close', function() {
        var docName, listener;
        if (!agent) {
            return;
        }
        //console.log "Client //{agent.sessionId} disconnected"
        for (docName in docState) {
            listener = docState[docName].listener;
            if (listener) {
                agent.removeListener(docName);
            }
        }

        stats.removeUserAgent(agent.sessionId);

        return docState = null;
    });
};
