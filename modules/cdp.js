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

    casper.on('run.complete', function() {
        fs.write(cdp.result_file, '{ "downloaded" : ' + cdp.downloaded + ' }', 'w');
    });

    casper.on("remote.message", function(message) {
        this.echo("remote console.log: " + message);
    });

    return cdp;
};

var CDP = function CDP(casper) {

    var work_dir = casper.cli.get("work_dir");
    var index_file = casper.cli.get("index_file");
    var result_file = casper.cli.get("result_file");

    if (!fs.isDirectory(work_dir) || !fs.isWritable(work_dir)) {
        console.error("Passed work_dir doesn't exist or it is not writeable");
        phantom.exit(1);
    }

    if (!fs.isFile(index_file) || !fs.isReadable(index_file) || !fs.isWritable(index_file)) {
        console.error("Passed index_file doesn't exist or it is not writable or readable");
        phantom.exit(1);
    }

    if (!fs.isFile(result_file) || !fs.isReadable(result_file) || !fs.isWritable(result_file)) {
        console.error("Passed result_file doesn't exist or it is not writable or readable");
        phantom.exit(1);
    }

    this.casper = casper;

    this.work_dir = work_dir;
    this.index_file = index_file;
    this.result_file = result_file;

    this.downloaded = 0;
    this.in_download = 0;
    
    this.interactive = 0;

    this.index = this.loadIndex();

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
                return cdp.work_dir + '/' + filename;
            }

            var contentDisposition = responseData['contentDisposition'];
            if (contentDisposition) {
                console.log("Content-Disposition found");

                var filenameRegex = /filename\s*="([^"]+)"/i;
                var result;

                if ((result = filenameRegex.exec(contentDisposition)) !== null) {
                    cas.options.stepTimeout = 600000;
                    return cdp.work_dir + '/' + result[1];
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

        cas.page.onFileMD5 = function(hashsum) {

            if (cdp.index[filename] == hashsum) {
                console.log("HASHSUM IS THE SAME. SKIPPING");
                return 1;
            } else {
                console.log("UPDATING HASHSUM");
                cdp.index[filename] = hashsum;
                cdp.downloaded += 1;

                return 0;
            }
        };
    };
};

CDP.prototype.saveContent = function(filename) {

    var cdp = this;

    return function() {
        var content = cdp.casper.getHTML();
        var hashsum = cryptojs.MD5(content);

        if (cdp.index[filename] == hashsum) {
            console.log("HASHSUM IS THE SAME. SKIPPING");
        } else {
            console.log("UPDATING HASHSUM");
            cdp.index[filename] = hashsum + ""; // Stringify it
            cdp.downloaded += 1;
            fs.write(cdp.work_dir + '/' + filename, content, 'w');
        }
    };
};

CDP.prototype.loadIndex = function() {

    var index_content = fs.read(this.index_file);

    try {
        return JSON.parse(index_content);
    } catch(e) {
        console.log("Unable to parse index content. Empty or not valid");
        return {};
    }
};

CDP.prototype.saveIndex = function() {

    var cdp = this;

    return function() {
        fs.write(cdp.index_file, JSON.stringify(cdp.index, null, " "), 'w');
    }
};

CDP.prototype.debugOn = function(capture_options) {
    
    var cdp = this;
    var casper = this.casper;

    var debugFunction = function() {
        if (cdp.in_download == 0) {

            casper.evaluate(function(img) {
                __utils__.sendAJAX("http://localhost:8001/", 'POST', {'img' : img }, false);
            }, {'img' : casper.captureBase64('png', capture_options )});

        }

        if (cdp.interactive == 1) {
            console.log("Press enter to continue");
            system.stdin.readLine();
        }
    };

    casper.on('step.complete', function() {
        console.log("STEP COMPLETE");
        debugFunction();
    });

    casper.on('load.finished', function() {
        console.log("LOAD FINISHED");
        debugFunction();
    });

};

CDP.prototype.interactiveOn = function() {
    var cdp = this;
    var casper = this.casper;

    casper.then(function() {
        console.log("Going into interactive mode");
        cdp.interactive = 1;
    });
};

CDP.prototype.interactiveOff = function() {
    var cdp = this;
    var casper = this.casper;

    casper.then(function() {
        console.log("Leaving interactive mode");
        cdp.interactive = 0;
    });
};

CDP.prototype.run = function() {
    var cdp = this;
    var casper = this.casper;

    casper.then(cdp.saveIndex());

    casper.run();
};

