module.exports = (function () {

    "use strict";

    var _ = require('underscore');
    var rp = require('request-promise');
    var JsonSchemaValidator = require('jsck');

    var Validator = function (options) {

        this.retryCount = 0;
        this.options = options.validation;

        this.handlerConfigs = [];

        _.each(this.options.schemaMappings, _.bind(function (mapping) {
            this.handlerConfigs.push({
                docNamePattern: mapping.docNamePattern,
                schemaURI: this.options.baseSchemaURI + mapping.schemaFileName,
                validator: null
            })
        }, this));

        this._loadValidators();


    };

    Validator.prototype = {

        /**
         * Validate the snapshot with the schema that corresponds to the doc name. Validation errors will be logged to
         * the console.
         * @param docName : name of the snapshot doc
         * @param op : last applied op (for error logging)
         * @param snapshot : snapshot to be validated
         * @returns {boolean} : true if validation succeeds or no validator is mapped to this doc. Otherwise, false.
         */
        validate: function (docName, op, snapshot) {

            try {

                // find the handler that matches the document name
                var handlerConfig = _.find(this.handlerConfigs, function (handlerConfig) {
                    return handlerConfig.docNamePattern.test(docName);
                });

                // Validate the snapshot against the schema
                var isValid = false;
                if (handlerConfig) {
                    if (handlerConfig.validator) {
                        var errors = handlerConfig.validator.validate(snapshot).errors;
                        if (errors && errors.length > 0) {
                            console.error('Validation: ERROR: Validation FAILED! Applied Op:' + JSON.stringify(op) + ', ERRORS: ' + JSON.stringify(errors));
                        } else {
                            console.log('Validation: SUCCESS: Validation Passed!');
                            isValid = true;
                        }
                    } else {
                        console.log("Validation: WARN: Schema validator has not initialized yet for doc: " + docName);
                        isValid = true;
                    }
                } else {
                    console.log("Validation: WARN: No validator assigned for doc: " + docName);
                    isValid = true;
                }

                return isValid;

            } catch (error) {
                // make sure no unexpected errors make it through.
                console.error("Validation: Unexpected Error: " + error);
            }

        },
        /**
         * Load the schema files from the app server. If the files cannot be retrieved, then retry every X seconds.
         * @private
         */
        _loadValidators: function () {

            var scheduleRetry = false;
            _.each(this.handlerConfigs, _.bind(function (handler) {
                if (!handler.validator) {
                    this._loadValidator(handler);
                    scheduleRetry = true;
                }
            }, this));

            if (scheduleRetry) {
                this.retryCount++;
                console.log("Validation: Scheduling retry...(" + this.retryCount + ")");
                setTimeout(_.bind(this._loadValidators, this), this.options.retryIntervalMillis);
            } else {
                console.log("Validation: All " + this.handlerConfigs.length + " schemas are loaded");
            }
        },
        /**
         * Make a REST call for a single schema file
         * @param handler
         * @returns Promise
         */
        _loadValidator: function (handler) {
            return rp({
                uri: handler.schemaURI,
                method: 'GET'
            })
                .then(this._initValidator)
                .then(_.bind(function (schemaHandler, validator) {
                    console.log("Validation: Initialized validator for schema: " + schemaHandler.schemaURI);
                    schemaHandler.validator = validator;
                }, this, handler))
                .catch(this._logRequestError);
        },
        /**
         * Convert a schema file string to a validator object
         * @param schema string
         * @returns {JsonSchemaValidator.draft4}
         */
        _initValidator: function (schema) {
            var schemaObj = JSON.parse(schema);
            return new JsonSchemaValidator.draft4(schemaObj);
        },
        /**
         * Log a http request error to the console
         * @param error
         * @private
         */
        _logRequestError: function (error) {
            var errorMsg = "Validation: ERROR: Failed to retrieve uri: " + error.options.uri;
            if (error.statusCode) {
                errorMsg += ", StatusCode: " + error.statusCode;
            } else if (error.message) {
                errorMsg += ", Message: " + error.message;
            }
            console.error(errorMsg);
        }

    };


    return Validator;

}());

