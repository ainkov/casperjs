/*
 * Wrappers around phantomjs' onFileDownload and
 * utility functions
 */

var require = patchRequire(require);

var cdp_module = require('cdp');

exports.create = function(options) {

    var cdp;

    if (options === undefined) {
        cdp = cdp_module.create();
    } else {

        if (options.casper) {
            cdp = cdp_module.create(options.casper);
        } else {
            cdp = cdp_module.create();
        }

        if (options.clientScripts) {
            handleClientScripts(cdp, options.clientScripts);
        }

        cdp.saveFile = function() {
            this.setDownload(current_table);
        };

    }

    return new genie(cdp);
};

function handleClientScripts(cdp, clientScripts) {

    var result = [];

    clientScripts.forEach(function(clientScript) {
        var clientScriptPath = cdp_module[clientScript];

        if (!clientScriptPath) {
            cdp.casper.log("Client script " + clientScript + " is not supported. Exiting", 'error', 'genie');
            cdp.casper.exit(1);
        } else {
            cdp.casper.log("Adding " + clientScript + " to client scripts", 'debug', 'genie');
            result.push(clientScriptPath);
        }

    });

    if (result.length == 0) {
        cdp.casper.log('Client scripts disabled', 'debug', 'genie');
    }

    cdp.casper.options.clientScripts = result;
}


function genie(cdp) {
    this.cdp = cdp;


    var casper = this.cdp.casper;

    var options = {};
    ['onError', 'onStepTimeout', 'onWaitTimeout', 'onTimeout'].forEach(function(el) {

        options[el] = casper.options[el];
    });

    this.options = options;
};

genie.prototype.stopErrors = function() {
    var casper = this.cdp.casper;

    casper.log('Stopping errors', 'debug', 'genie');

    casper.options.onStepTimeout = function() {
        casper.log('Step timeout but I\'ll continue', 'warning', 'genie');
    };

    casper.options.onWaitTimeout = function() {
        casper.log('Wait timeout but I\'ll continue', 'warning', 'genie');
    };

    casper.options.onTimeout = function() {
        casper.log('Timeout but I\'ll continue', 'warning', 'genie');
    };
    
    var options = this.options;
    options['step.error'] = function(err) {
        casper.log('Step error: ' + err + ' but I\'ll continue', 'error', 'genie');
    };

    casper.on('step.error', options['step.error']);

    casper.options.silentErrors = 1;
};

genie.prototype.enableErrors = function() {

    var casper = this.cdp.casper;

    casper.log('Enabling errors', 'debug', 'genie');

    var options = this.options;

    ['onError', 'onStepTimeout', 'onWaitTimeout', 'onTimeout'].forEach(function(el) {
        casper.options[el] = options[el];
    });

    casper.removeListener('step.error', options['step.error']);

    casper.options.silentErrors = 0;
};

genie.prototype.run = function(tables) {

    var genie = this;
    var casper = genie.cdp.casper;

    casper.start();

    for (var table in tables) {

        (function(table) {

            var tableOptions = tables[table]['options'] || {};

            if (!tableOptions.die) {

                casper.then(function() {
                    genie.stopErrors();
                });
            }

            if (tableOptions.clientScripts) {

                casper.then(function() {
                    handleClientScripts(genie.cdp, tableOptions.clientScripts);
                });

            }

            var tableSteps = tables[table]['steps'];

            if (!tableSteps) {
                casper.log("No steps found for table " + table, 'error', 'genie');
                casper.exit(1);
            }

            casper.then(function() {
                genie.currentTable = table;
                casper.log('Starting steps for table ' + genie.currentTable, 'debug', 'genie');
            });

            tableSteps.call(genie.cdp);

            casper.then(function() {
                casper.log('Finished steps for table ' + genie.currentTable, 'debug', 'genie');
            });

            if (!tableOptions.die) {

                casper.then(function() {
                    genie.enableErrors();
                });
            }

        })(table);
    }

    this.cdp.run();

};

