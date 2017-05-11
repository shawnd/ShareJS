#!/usr/bin/env node
/**
 * Entry point to commit any uncommitted ops to all snaphots
 *
 *   local dev env usage: ./src/documentUpdater.js -f /home/vagrant/ceros/build/localenv/sharejs/options.js
 */
'use strict';

require('coffee-script');
var Model = require('./server/model');
var createDb = require('./server/db');

var argv = require('optimist')
    .usage("Usage: $0 -f options.js")
    .demand('f')
    .alias('f', 'options')
    .argv;

var options = require(argv.options);

var db = createDb(options.db);
var model = new Model(db);

model.flushDocumentsWithUncommittedOps(function (error) {
    if (error) {
        console.log(error);
    } else {
        console.log("All docs updated successfully");
    }
    model.closeDb();
});
