'use strict';

const clock = require('my-plugins/utils/clock');

//const supervisor = require('supervisor/lib/supervisor');
console.log("req main", clock.Now.asTimeString(), require.main.filename, process.argv);

//TODO: use https://github.com/pillarjs/send?

//below is based on https://github.com/cloudhead/node-static

const fs = require("fs");

fs.watch(__dirname, { persistent: true, recursive: true }, function unreliable(event, filename)
{
//event is either 'rename' or 'change'
//The recursive option is only supported on OS X and Windows.
//persistent indicates whether the process should continue to run as long as files are being watched.
    console.log("WATCH: ", event, filename);
//  if ( newStat.mtime.getTime() !== oldStat.mtime.getTime() )
});


//NOTE: supervisor is already watching for file changes, so we don't need watchify here
console.log("browserify ...");
const browserify = require('browserify');
//var b = browserify();
var b = browserify(
{
    cache: {}, //true, // equivalent to "public, max-age=60"
    packageCache: {},
    precompile: true,
//                minify: true,
//                gzip: true,
    debug: true,
});
b.add('./public/js/yalpui.js');
var bundled = fs.createWriteStream('./public/js/yalpui-bundled.js');
b.bundle().pipe(bundled);
console.log("... browserify");


const url = require("url");
//const path = require("path");
const http = require('http');
//const inherit = require('inherit');
//const makenew = require('my-plugins/utils/makenew');
const staticc = require('node-static');

//function my_http(args)
//{
//    if (!(this instanceof my_http)) return makenew(my_http, arguments);
//    http.apply(this, arguments); //base class
//}

const PORT = parseInt(process.argv[2]) || 2016;
const cwd = process.cwd(); //save initial value in case it changes

var file = new staticc.Server('./public');
var svr = http.createServer(function http_req(request, response)
{
    var uri = url.parse(request.url).pathname;
    console.log('http req for ' + request.url + ", is reload " + (svr.my_reload.url || '-') + "? " + ((svr.my_reload && (svr.my_reload.url == request.url))? "Y": "N"));
    request.addListener('end', function on_reqend()
    {
        if (svr.my_reload && (svr.my_reload.url == request.url))
        {
            response.type = function resp_type(mime_type) { return response.writeHead(200, {"Content-Type": mime_type}); };
            response.send = function resp_send(str) { return response.end(str); };
            svr.my_reload.cb(request, response);
        }
//    res.type('text/javascript')
//    res.send(clientCode)
        else file.serve(request, response);
    }).resume();
}).listen(PORT);
console.log("Server listening on: http://localhost:%s/\nCTRL + C to shutdown", PORT);

const reload = require('reload'); //https://github.com/jprichardson/reload
var app = { get: function(url, cb) { svr.my_reload = {url: url, cb: cb} }}; //simulate express for reload
reload(svr, app); //, [reloadDelay], [wait])
console.log("reload listener");

//eof
/*
//below is based on https://github.com/expressjs/serve-static
or

//below is based on https://gist.github.com/ryanflorence/701407

var server = http.createServer(function handleRequest(request, response)
{
    var uri = url.parse(request.url).pathname, filename = path.join(cwd, 'public', uri);
//    response.end('It Works!! Path Hit: ' + request.url);
//    path.exists(filename, function(exists)
//    if (filename.indexOf(cwd) !== 0) //avoid folder traversal attack
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
    console.log("Server listening on: http://localhost:%s/\nCTRL + C to shutdown", PORT);
});
*/
