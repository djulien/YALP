#!/usr/local/bin/node --expose-gc

'use strict'; //helps catch errors

var real_start = Date.now(); //do this first for more accurate timing
require('colors');
require('my-plugins/my-extensions');
global.ROOTDIR = __dirname; //path.relative(path.dirname(require.main.filename), filename); //make it easier for other modules to navigate
var hostname = require('os').hostname();
var logger = require('my-plugins/utils/logger')({started: real_start, detail: 99});
var shortname = require('my-plugins/utils/shortname');

logger("starting YALP server (%s) ...".green, hostname);
logger("my root '%s'".blue, global.ROOTDIR);

var opts = {ui: false, xui: "/usr/bin/google-chrome-stable"};
var app = require('express')(); //express();
var email = require('my-plugins/utils/email');
var launch = require('open'); //https://github.com/pwnall/node-open/blob/master/lib/open.js; NOTE: opener starts with #! (ES6), so use open instead
app.get('/quit', require('my-plugins/routes/get/98-quit').handler);
app.get('*', require('my-plugins/routes/get/99-any').handler);
app.on('close', function() { logger("closed".yellow); });

global.seqnum = 0;
var timeout = setTimeout('throw "Start-up is taking too long!";', 5000);
var server = app.listen(opts.port || /*(new Date()).getFullYear()*/ 2015, opts.host || "localhost", function()
//server.listen(opts.port || /*(new Date().getFullYear()*/ 2015, opts.host || "localhost", function()
{
    var host = server.address().address; //.replace(/^::$/, "localhost");
    var port = server.address().port;
    logger("YALP listening at http://%s:%s after %s".green, host, port, logger.elapsed.scaled());
    if (email) email('YALP ready', 'server listening at %s:%s on %s pid %d after %s', host, port, hostname, process.pid, logger.elapsed.scaled());

    if (/*!bool.isfalse*/(opts.ui !== false) && (opts.ui != "none")) //launch UI in browser
    {
        var url = 'http://' + host + ':' + port + '/'; //path.sep + 'YALP.html');
        if (!opts.ui || /*bool.istrue*/(opts.ui === true)) opts.ui = null; //"default";
        logger("starting ui '%s' -> %s ... ".green, shortname(opts.ui || '(default)'), url);
        launch(url, opts.ui, function (err)
        {
            if (err) throw err;
            else logger("browser launched".green);
        });
    }
    clearTimeout(timeout);
});
app.get('/quit', require('my-plugins/routes/get/98-quit').handler);


//from http://glynnbird.tumblr.com/post/54739664725/graceful-server-shutdown-with-nodejs-and-express
function gracefulShutdown()
{
    logger("Shutting down ...".yellow);
//http://stackoverflow.com/questions/17960452/how-can-i-get-a-list-of-callbacks-in-the-node-work-queue-or-why-wont-node-ex
//    console.log("handles", process._getActiveHandles());
//    console.log("requests", process._getActiveRequests());
    server.close(function() { logger("Connections closed.".green); process.exit(); });
    setTimeout(function() { logger("Timeout while closing connections, forcing exit.".red); process.exit(); }, 5*1000);
}

//setTimeout(gracefulShutdown, 3*1000);
process.on('SIGINT', gracefulShutdown); //Ctrl+C
process.on('SIGTERM', gracefulShutdown); //kill

//eof
