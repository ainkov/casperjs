/*
 * Wrappers around phantomjs' onFileDownload and
 * utility functions
 */

var require = patchRequire(require);

var fs = require('fs');
var system = require('system');
var cryptojs = require('cryptojs').create();

var jqueryPath = '/home/cap/dev/casperjs-ainkov/modules/jquery.js';
var jqueryXpathPath = '/home/cap/dev/casperjs-ainkov/modules/jquery.xpath.js';

exports.jqueryPath = jqueryPath;
exports.jqueryXpathPath = jqueryXpathPath;

exports.create = function(casper) {

    if (casper === undefined) {
        casper = require('casper').create({
            clientScripts : [jqueryPath, jqueryXpathPath],
            verbose : true,
            logLevel : "debug",
            stepTimeout : 60000
        });
    }

    var cdp = new CDP(casper);

    casper.on("remote.message", function(message) {
        this.echo("remote console.log: " + message);
    });

    return cdp;
};

var CDP = function CDP(casper) {

    this.casper = casper;

    this.downloaded = 0;
    this.in_download = 0;
    
    this.interactive = 0;
};

CDP.prototype.selectMultipleFirstN = function (selector, items_to_select) {
    var items_selected = 0;

    $(selector + " > option").each(function(index) {
        if (items_selected < items_to_select) {

            $(this).prop("selected", true);
            $(selector).trigger("change");

            items_selected = items_selected + 1;
        }
    });
};

CDP.prototype.selectMultipleLastN = function (selector, items_to_select) {
    var items_selected = 0;

    $($(selector + " > option").get().reverse()).each(function(index) {
        if (items_selected < items_to_select) {

            $(this).prop("selected", true);
            $(selector).trigger("change");

            items_selected = items_selected + 1;
        }
    });
};

CDP.prototype.selectMultipleByValue = function (selector, values) {

    console.log(values);

    for (var i = 0; i < values.length; i++) {
        $(selector + " > option[value='" + values[i] + "']").prop("selected", true);
        $(selector).trigger("change");
    }
}

CDP.prototype.selectMultipleByText = function (selector, values) {

    for (var i = 0; i < values.length; i++) {
        $(selector + " > option:contains('" + values[i] + "')").prop("selected", true);
        $(selector).trigger("change");
    }

}

CDP.prototype.setDownload = function(filename, callback) {

    var cdp = this;
    
    return function() {
        cdp.in_download = 1;

        var cas = this;

        cas.page.onFileDownload = function(url, responseData) {

            console.log("DOWNLOAD STARTED");

            cas.downloadInProgress = true;

            if (callback && !callback(responseData)) {
                console.log("Download stopped due to callback");
                cas.downloadInProgress = false;
                return;
            }

            if (filename) {
                cas.options.stepTimeout = 600000;
                return filename;
            }

            var contentDisposition = responseData['contentDisposition'];
            if (contentDisposition) {
                console.log("Content-Disposition found");

                var filenameRegex = /filename\s*="([^"]+)"/i;
                var result;

                if ((result = filenameRegex.exec(contentDisposition)) !== null) {
                    cas.options.stepTimeout = 600000;
                    return result[1];
                }
            }

            console.log("Unknown filename");
            cas.downloadInProgress = false;
            return;
        };

        cas.page.onFileDownloadFinished = function() {
            console.log("DOWNLOAD FINISHED");

            cdp.in_download = 0;

            cas.options.stepTimeout = 60000;
            cas.downloadInProgress = false;
        };

        cas.page.onFileDownloadError = function() {
            console.log("DOWNLOAD ERROR");

            cdp.in_download = 0;

            cas.options.stepTimeout = 60000;
            cas.downloadInProgress = false;
        };

    };
};

CDP.prototype.saveContent = function(filename) {

    var cdp = this;

    return function() {
        var content = cdp.casper.getHTML();

        cdp.downloaded += 1;
        fs.write(filename, content, 'w');
    };
};

CDP.prototype.run = function() {
    var cdp = this;
    var casper = this.casper;

    casper.run();
};

