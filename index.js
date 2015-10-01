//YALP main entry point
//setup:
//1. git clone https://github.com/djulien/yalp.git
//2. cd yalp
//3. npm install
//4. npm run symlinks
//5. open port in firewall if running remotely
//usage:
//1. npm [run-script] start

'use strict'; //helps catch errors
//var path = require('path');
global.ROOTDIR = __dirname; //path.relative(path.dirname(require.main.filename), filename); //make it easier for other modules to navigate
var elapsed = require('my-plugins/utils/elapsed').toString;
//require('my-plugins/config'); //load config settings (global)
//var pkg = require('./package.json'); //introspect: read my package + config settings
require('colors'); //makes console messages easier to distinguish
try { require('my-plugins/check-install'); }
catch (exc) { console.log("YALP not installed correctly (are sym links ok?)".red); process.exit(0); }
require('my-plugins/my-extensions'); //load custom language extensions

var opts = require('my-plugins/cmdline'); //combine command line options and config settings
//var bool = require('my-plugins/utils/bool-checks');
var hostname = require('os').hostname();

console.log("starting YALP server (%s) ...".green, hostname);
console.log("my root '%s'".blue, global.ROOTDIR);
//console.log("config:", global.pkg.yalp);

//http://stackoverflow.com/questions/7310521/node-js-best-practice-exception-handling

//try{
console.log("TODO: run npm find-dupes, outdated, or update periodically, also flatten?".red);
console.log("TODO: convert console.log to debug".red);
if (/*!bool.isfalse*/(opts.faultmon !== false)) require('my-plugins/fault-mon'); //notify and/or restart after crash

var email = require('my-plugins/utils/email');
//see http://expressjs.com/starter/
//var express = require('express');
var app = require('express')(); //express();
//var app = require('express').createServer();
//var http = require('http'); //NOTE: according to http://expressjs.com/guide/migrating-4.html express 4.x no longer needs this, but socket.io needs it
//var server = http.createServer(app);
//http.globalAgent.maxSockets = opts.max_sockets || 10; //http://webapplog.com/seven-things-you-should-stop-doing-with-node-js/

//var server = require('http').createServer(app);
//var io = require('socket.io')(server);

// set the view engine to ejs
//app.set('view engine', 'ejs');
require('my-plugins/routes')(app); //(server); //(app); //set up web server routes and middleware
//require('my-plugins/auto-build'); //detect changes + re-package bundles (incremental)

if (/*!bool.isfalse*/(opts.filemon !== false)) require('my-plugins/file-mon'); //file watcher + incremental bundler

process.on('SIGTERM', function()
{
    console.log("terminating ...".red);
    if (email) email('YALP crash', 'terminate after %s', elapsed()); //no worky
//    app.close();
    server.close();
});

//http://stackoverflow.com/questions/20165605/detecting-ctrlc-in-node-js
process.on('SIGINT', function()
{
    console.log("Caught interrupt signal".red);
    if (email) email('YALP quit', 'interrupt signal after %s', elapsed()); //no worky
//    if (i_should_exit)
        process.exit();
});

process.on('uncaughtException', function(err)
{
    console.log('Exception: ' + err.stack);
    if (email) email('YALP exc', 'uncaught exc after %s', elapsed()); //no worky?
});

var timeout = setTimeout('throw "Start-up is taking too long!";', 5000);
var server = app.listen(opts.port /*|| /-*(new Date().getFullYear()*-/ 2015*/, opts.host || "localhost", function()
//server.listen(opts.port || /*(new Date().getFullYear()*/ 2015, opts.host || "localhost", function()
{
    var host = server.address().address; //.replace(/^::$/, "localhost");
    var port = server.address().port;
    console.log("YALP server listening for http at %s:%s after %s".green, host, port, elapsed());
    if (email) email('YALP ready', 'server listening at %s:%s on %s after %s', host, port, hostname, elapsed());

    if (/*!bool.isfalse*/(opts.ui !== false) && (opts.ui != "none")) //launch UI in browser
    {
        var url = 'http://' + host + ':' + port + '/'; //path.sep + 'YALP.html');
        if (!opts.ui || /*bool.istrue*/(opts.ui === true)) opts.ui = null; //"default";
        console.log("starting ui '%s' -> %s ... ".green, opts.ui || '', url);
        var launch = require('open'); //https://github.com/pwnall/node-open/blob/master/lib/open.js; NOTE: opener starts with #! (ES6), so use open instead
        launch(url, opts.ui, function (err)
        {
            if (err) throw err;
            else console.log("browser launched".green);
        });
    }
    clearTimeout(timeout);
});

//} catch (exc) { console.log("ERROR:".red, exc, '@' + require('my-plugins/utils/stack-trace')()); }

console.log("YALP server init complete after %s".blue, elapsed());
//eof
