//start up YALP server and UI
'use strict';

require('colors');
const cfg = require('./package.json').yalp || {};
//const touch = require('touch');
//var trigger = path.join(__dirname, "trigger.js"); //use a trigger file for more flexible watch include/exclude
const cluster = require('cluster'); //overkill; can't get supervisor to work consistently, so use cluster instead
//const logger = require('my-plugins/utils/logger');
const logger = require('my-plugins/streamers/logger');
var path = require('my-plugins/my-extensions/multi-path');
logger.detail = 99;
logger.pipe(process.stdout);

var served = {};
const CWD = process.cwd(); //_dirname; //save initial value in case it changes
const PORT = parseInt(process.argv[2]) || cfg.port || 2016;


function startui(port)
{
//logger.log("host = " + host, path.sep);
    var uri = 'http://' + "localhost" + ':' + port + '/'; //path.sep + 'YALP.html');
    if (cfg.ui !== 'false') launch_shim(uri, cfg.ui, function launch_cb(err)
    {
        if (err) throw err;
        else logger.log("browser '%s' opened".cyan, cfg.ui);
    });
    function launch_shim(uri, browser, callback)
    {
        return browser? launch(uri, browser, callback): launch(uri, callback);
    }
}


//function my_http(args)
//{
//    if (!(this instanceof my_http)) return makenew(my_http, arguments);
//    http.apply(this, arguments); //base class
//}
function server(port) //, startui)
{
//    var reloader = sockjs.createServer({ sockjs_url: 'http://localhost:' + port + '/js/sockjs.min.js' }); //TODO: map this?
//    reloader.on('connection', function(conn)
    var echo = sockjs.createServer({ sockjs_url: 'http://cdn.jsdelivr.net/sockjs/1.0.1/sockjs.min.js' });
    echo.on('connection', function(conn)
    {
        conn.on('data', function(message) { console.log("sockjs data: %j".cyan, message); conn.write(message); });
        conn.on('close', function() { console.log("sockjs close".cyan); });
    });

    var file = new staticc.Server('./public');
    var svr = http.createServer(function http_req(req, resp)
//    server.addListener('request', function(req, res) { static_directory.serve(req, res); });
//    server.addListener('upgrade', function(req,res){ res.end(); });
    {
//set up express-compatible functions:
        resp.type = function resp_type(mime_type) { return resp.writeHead(200, {"Content-Type": mime_type}); };
        resp.send = function resp_send(code, msg)
        {
            resp.statusCode = (arguments.length > 1)? code: 200;
            return resp.end((arguments > 1)? msg: code);
        };

        var uri = url.parse(req.url).pathname;
        logger.log("http req for '%s', is reload %s? %s".blue, req.url, (svr.my_reload || {}).url || '-', ((svr.my_reload || {}).url == req.url)? "Y": "N");
        if (toobusy()) resp.send(503, "Server too busy; try again later.");
        else req.addListener('end', function on_reqend()
        {
            var filename = path.resolve('./public', uri);
            if (!++served[filename]) { served[filename] = 1; process.send({served: filename}); }
            if ((svr.my_reload || {}).url == req.url) svr.my_reload.cb(req, resp);
//    res.type('text/javascript')
//    res.send(clientCode)
            else file.serve(req, resp);
        }).resume();
    }); //.listen(port);
    echo.installHandlers(svr, {prefix:'/echo'});
    svr.listen(port);
//    reloader.installHandlers(svr, {prefix:'/echo'});
    logger.log("server pid %s listening on: http://localhost:%s/\nCTRL+C to shut down".green, process.pid, port);

    var app = { get: function(url, cb) { svr.my_reload = {url: url, cb: cb} }}; //simulate express for reload
//    reload(svr, app); //, [reloadDelay], [wait]); //tell browser to reload if it was connected to me
//logger.log("reload listener");
}


function bundler()
{
//NOTE: supervisor is already watching for file changes, so we don't really need watchify here; OTOH it handles caching so might as well use it
//logger.log("... browserify");

    var fromArgs = require('watchify/bin/args');
    var outpipe = require('watchify/node_modules/outpipe');

//this is basically what the watchify cli does:
//see watchify/bin/cmd.js
//    var bw = fromArgs("./public/js/yalpui.js  ./node_modules/reload/lib/sockjs-0.3-min.js  -t require-globify  -o ./public/js/yalpui-bundled.js  -dv".split(/ +/));
    var bw = fromArgs("./public/js/yalpui.js  -o ./public/js/yalpui-bundled.js  -dv".split(/ +/));
    bw.bytes = bw.time = 0;
    bw.on('bytes', function (bytes) { bw.bytes = bytes; /*logger.log("bundle: %d bytes".yellow, bytes)*/; }); //number of bytes
    bw.on('time', function (time) { bw.time = time; /*logger.log("bundle: %d msec".yellow, time)*/; }); //time it took to create bundle (msec)
    bw.on('log', function (msg) { logger.log(("bundle msg: " + msg).yellow); }); //show size and time after each bundle created
    bw.on('error', function(msg) { logger.error(("bundle err: " + msg).red); });
    bw.on('update', bundle);
    bundle(bw.argv.o || bw.argv.outfile); //NOTE: need to call this manually the first time

    function bundle(ids) //array of bundle ids that changed
    {
        var ok = true;
        logger.log("bundle: update ids %j".yellow, ids);
//    var outfile = rel2abs("./bundles/uiloader.js");
        var outfile = bw.argv.o || bw.argv.outfile;
        var outStream = (process.platform === 'win32')? fs.createWriteStream(outfile): outpipe(outfile);
        bw.bundle()
            .on('error', function (err)
            {
                logger.error(String(err).red);
                ok = false;
                outStream.end('logger.error('+JSON.stringify(String(err))+');'); //show error in output file (will cause syntax error)
            })
            .pipe(outStream);
        outStream.on('error', function (err) { logger.error(err); });
        outStream.on('close', function () { logger.warn("bundle close: %s bytes to '%s' ok? %s (%s msec)".cyan, bw.bytes, outfile, ok, bw.time); });
    }
}


function my_watch(dirname, want_recursive)
{
    ++logger.depth_adjust; //show caller, not me
    logger.log("watching './%j' rec? %s ...".blue, path.relative(__dirname, dirname), !!want_recursive); //, path.relative(__dirname, trigger));
    watch(dirname, { recursive: want_recursive, followSymLinks: false }, function(filename)
    {
        filename = path.resolve(__dirname, filename);
//        if (filename == trigger) return;
        logger.warn("watched: '%s', served? %s".cyan, path.relative(__dirname, filename), !!served[filename]);
//        touch(trigger, {force: true});
        if (served[filename]) restartWorkers();
    });
}


var pending = null;
function restartWorkers()
{
    if (pending) clearTimeout(pending);
    pending = setTimeout(function restart_timer()
    {
        pending = null;
        logger.log("restarting workers ...".cyan);
        for (var id in cluster.workers)
        {
            cluster.workers[id].send({ type: 'shutdown'}); //, from: 'master' });
            setTimeout(function forceful() { if (cluster.workers[id]) { cluster.workers[id].kill('SIGKILL'); }}, 1000); //force it if graceful shutdown doesn't work
        }
    }, 1000);
};


logger.log("start");

//NOTE: require vars are global scope below, but only initialized if needed for master vs. worker

//cluster example at http://www.sitepoint.com/how-to-create-a-node-js-cluster-for-speeding-up-your-apps/
if (cluster.isMaster)
{
    var fs = require("fs");
    var launch = require('open');
    var watch = require('node-watch');
    var browserify = require('browserify');

//    const supervisor = require('supervisor/lib/supervisor');
    logger.log("start: %s, pid %s, args %j".green, path.relative(__dirname, require.main.filename), process.pid, process.argv);
//    process.on('beforeExit', function onbefexit() { logger.log("before exit\n"); });
    process.on('exit', function onexit() { logger.warn("exit".red); });

    const numwk = 1; //require('os').cpus().length; //only need 1 worker for self reload (for now)
    for (var i = 0; i < numwk; ++i) cluster.fork();
//    var buf = ''; for (var i in cluster.workers) buf += ', ' + i; logger.log(buf);
    console.log("master: set up %s workers: %j".blue, numwk, cluster.workers);
    cluster.on('online', function online(worker) { logger.depth_adjust += 1; logger.log("worker %s is online".blue, worker.process.pid); });
    cluster.on('exit', function onexit(worker, code, signal)
    {
        logger.warn("worker '%s' died with code %s, signal %s".red, worker.process.pid, code, signal);
//        logger.log('Starting a new worker');
        cluster.fork(); //maintain worker count
    });
    for (var id in cluster.workers)
    {
        cluster.workers[id].on('message', function onmsg(data) //collect child logging into one log
        {
            logger.depth_adjust += 1;
            if (data.log) logger.log(data.level, data.log);
            else if (data.served) served[data.served] = true;
            else logger.log("unrecog msg: %j".red, data);
        });
    }

//with only 1 worker for restarting, we can watch in master process:
    my_watch('.', false); //this one can't be recursive; want to exclude node_modules and other subfolders
    my_watch(['./public', './my-plugins', './my-projects'], true); //changing files of interest will typically be in these subfolders
    bundler();
    startui(PORT);
}
else
{
    var url = require("url");
//const path = require("path");
    var http = require('http');
//const inherit = require('inherit');
//const makenew = require('my-plugins/utils/makenew');
    var staticc = require('node-static');
    var sockjs = require('sockjs'); //https://github.com/sockjs/sockjs-node
//    var reload = require('reload'); //https://github.com/jprichardson/reload
    var toobusy = function() { return false; } //require('toobusy'); //TODO: not compat with Node 4.x / NaN 2.x

//    var app = require('express')();
//    app.all('/*', function(req, res) {res.send('process ' + process.pid + ' says hello!').end();})
//    var server = app.listen(8000, function() {
//        logger.log('Process ' + process.pid + ' is listening to all incoming requests');
//    });

    process.send({log: "worker " + process.pid + " started", level: 1});
    process.on('message', function onmsg(msg)
    {
//        logger.log(msg);
        if (msg.type === 'shutdown') process.exit(0);
        else logger.warn("unrecognized msg: '%j'".red, msg.type || msg);
    });
    server(PORT);
}


//eof
//TODO: use https://github.com/pillarjs/send?

//below is based on https://github.com/cloudhead/node-static

//fs.watch(__dirname, { persistent: true, recursive: true }, function unreliable(event, filename)
//{
//event is either 'rename' or 'change'
//NOTE: The recursive option is only supported on OS X and Windows.
//persistent indicates whether the process should continue to run as long as files are being watched.
//    logger.log("WATCH: ", event, filename);
//  if ( newStat.mtime.getTime() !== oldStat.mtime.getTime() )
//});

//var towatch = [];
//const fs = require("fs");
//fs.readdir(__dirname, function dir_enum(err, files)
//{
//    files.forEach(function file_enum(filename)
//    {
//        if (filename.
//        if (fs.stat(filename).isDirectory()) towatch.push(filename);
//    });
//});


/*
//below is based on https://github.com/expressjs/serve-static
or

//below is based on https://gist.github.com/ryanflorence/701407

var server = http.createServer(function handleRequest(request, response)
{
    var uri = url.parse(request.url).pathname, filename = path.join(CWD, 'public', uri);
//    response.end('It Works!! Path Hit: ' + request.url);
//    path.exists(filename, function(exists)
//    if (filename.indexOf(CWD) !== 0) //avoid folder traversal attack
    var stat = fs.statSync(filename);
    if (stat.isDirectory()) filename = path.join(filename, 'index.html');
    else if (!stat.isFile())
    {
        response.writeHead(404, {"Content-Type": "text/plain"});
        response.write("404 Not Found\n");
        response.end();
        return;
    }
    fs.readFile(filename, "binary", function(err, file)
    {
        if (err)
        {
            response.writeHead(500, {"Content-Type": "text/plain"});
            response.write(err + "\n");
            response.end();
            return;
        }
        response.writeHead(200);
        response.write(file, "binary");
        response.end();
    });
});
server.listen(PORT, function listen()
{
    //Callback triggered when server is successfully listening. Hurray!
    logger.log("Server listening on: http://localhost:%s/\nCTRL + C to shutdown", PORT);
});
*/
