'use strict';

var url = require('url');
var path = require('path');
var logger = require('my-plugins/utils/logger');
//var contentDisposition = require('content-disposition'); //https://www.npmjs.com/package/content-disposition
var mime = require('mime-types'); //https://github.com/jshttp/mime-types

var ASSETDIR = "public";

//var seqnum = 0;
//var ROOTDIR = path.join(require.main.filename, "..", ASSETDIR);
//console.log("root dir", ROOTDIR);
//console.log("parent ", module.parent); //node-glob-loader, not useful
//console.log("main ", require.main.filename); //server.js


//http.createServer(function (/*http.IncomingMessage*/ req, /*http.ServerResponse*/ resp)
//server.use(express.static(__dirname));
//app.use(express.static(__dirname + '/public')); //browser assets

//use this instead of express.static for easier debug/log:
module.exports.uri = '*';
module.exports.handler = function (req /*:http.IncomingMessage*/, resp /*:http.ServerResponse*/, next_handler)
{
    var timer = null;
//    var outbuf = {};

    logger("get[%d]: %s".blue, global.seqnum, req.url);
//    console.log();
    if (req.url == "/") //default doc
    {
        req.url =  "/index.html"; //"/YALP.html";
//        global.seqnum = 0; //easier session debug
    }
//    req.url = path.join(ASSETDIR, req.url); //rebase to public (assets) folder
    var parsed = url.MyParse(req.url, true); //true = want query string
    resp.shouldKeepAlive = false;
//    req.on("close", function() { console.log("request close.blue"); });
//    req.on("end", function() { console.log("request end.blue"); }); //; got " + body.length + " bytes");
        try { handler(); }
        catch (exc) { reply({ERROR: exc.toString()}, 500); }
//    next_handler(); // pass control to the next handler

    function handler()
    {
//        if (parsed.pathname == "/js/jquery.js") //kludge: caller's path getting messed up somewhere
//        {
//            parsed.pathname = "/lib/jquery/jquery-1.11.2.js";
//            console.log("path fixup");
//        }
//http://stackoverflow.com/questions/7042340/node-js-error-cant-set-headers-after-they-are-sent
//    resp.writeHead(200, {"Content-Type": "application/json", 'Access-Control-Allow-Origin': '*'}); //http://stackoverflow.com/questions/10143093/origin-is-not-allowed-by-access-control-allow-origin; resp.state => body
//    resp.status = 200;
//    resp.setHeader("Content-Type", "application/json");
//    resp.setHeader('Access-Control-Allow-Origin', '*');
//        ++seqnum;
//        console.log("parsed.pathname = '" + parsed.pathname + "'");
        var writable = false; //!!parsed.pathname.match(wrfolders);
//        if (parsed.pathname == "/") parsed.seqnum = global.seqnum = 0; //easier session debug
        var filetype = path.extname(parsed.pathname).replace(/^\./, "").toLowerCase();
        var timeout = {mp3: 15000, wav: 15000, mp4: 60000, webm: 60000, wmv: 60000}[filetype] || 5000; //msec; bigger files take longer
        logger(/*sprintf(*/"GET req# %d: %s, writable? %d, file type '%s', timeout %d".blue, parsed.seqnum, parsed.urlparts, writable, filetype, timeout); //, mypath(req.url)));
//        timer = setTimeout(function() { reply({ERROR: "timeout"}, 500); }, timeout); //msec
        logger("serve file %s".blue, path.join(ASSETDIR, parsed.pathname)); //path.join(ROOTDIR, parsed.pathname));
        var abspath = path.join(global.ROOTDIR, ASSETDIR, parsed.pathname);
//        resp.setHeader('Content-Disposition', contentDisposition(abspath, {type: path.extname(abspath)}));
        resp.setHeader('Content-Type', mime.lookup(abspath));
//        console.log("send '%s' type '%s'", abspath, mime.lookup(abspath));
//        var stream = fs.createReadStream(abspath);
//        stream.pipe(reso);
//        onFinished(resp, function (err) { destroy(stream); })
        resp.sendFile(abspath, function(err)
        {
            if (err) return reply({ERROR: err.toString()}, 404);
            reply(); //if (timer) clearTimeout(timer);
        });
/*
    fs.exists(filename, function(exists) {
      if (!exists) {
        response.writeHead(404, {'Content-Type':'text/plain'});
        response.end("Can''t find it...");
      }
      fs.readFile(filename, 'binary',function(err, file){
        if (err) {
          response.writeHead(500, {'Content-Type':'text/plain'});
          response.end(err + "\n");
          return;
        }
        response.writeHead(200);
        response.write(file, 'binary');
        response.end();
      });
    });
*/
    }

    function reply(outbuf, code)
    {
        if (timer) clearTimeout(timer);
        if (!outbuf) return; //{ /*console.timeEnd("get-reply")*/; logger("get-static[%d] sent after %d msec", parsed.seqnum, parsed.elapsed()); return; } //already sent data
        try { resp.writeHead(code || 200, {"Content-Type": "application/json", 'Access-Control-Allow-Origin': '*'}); } //http://stackoverflow.com/questions/10143093/origin-is-not-allowed-by-access-control-allow-origin; resp.state => body
        catch (exc) { logger("can't write header: ", exc); }
        outbuf.seq = parsed.seqnum; //for easier debug
        logger("reply: " + JSON.stringify(outbuf)); //.toString());
//        outbuf = {seq: parsed.seqnum, ERROR: exc.toString()};
        resp.end(JSON.stringify(outbuf)); //resp.state => finished
//http://stackoverflow.com/questions/7042340/node-js-error-cant-set-headers-after-they-are-sent
//no        next_handler(); //pass control to next handler; TODO: this is probably not needed
//        console.timeEnd("get-reply");
        logger("get-static[%d] replied after %d msec".blue, parsed.seqnum, parsed.elapsed());
    }
}


url.MyParse = function(str, want_qry) //wedge in a descr
{
//    str = str.replace(/%[0-9A-F]{2}/gi, function(matched) { return String.fromCharCode("0x" + matched.substr(1)); }); //"*").replace(/%2E/gi, "."); //CAUTION: don't pull in > 2 hex digits at a time (assumes UTF-8); klugde: don't unesc "#" until after url is parsed (else treated as anchor)
//    str = str.replace(/#/g, "&amp;#35;");
//    var svstr = str;
//NOTE: "&" and "#" are both separators, so they must be escaped using URI, *not* URIComponent
//see http://stackoverflow.com/questions/747641/what-is-the-difference-between-decodeuricomponent-and-decodeuri
    str = decodeURI(str);
//    console.log("decodeURI " + svstr + " => " + str);
    var retval = this.parse(str, want_qry); //NOTE: this does not unescape %##, so do it above
    retval.pathname = decodeURI(retval.pathname); //kludge: re-decode; parse seems to be re-encoding t
    retval.path = decodeURI(retval.path);
    retval.urlparts = "path " + retval.pathname + (retval.search? ", search " + retval.search: ""); //: ("url " + retval.); //str);
    retval.seqnum = global.seqnum++;
//    retval.reqtime = (new Date()).getTime();
//    retval.elapsed = function() { return (new Date()).getTime() - retval.reqtime; } //msec
    retval.elapsed = function()
    {
        var now = (new Date()).getTime(); //msec
        if (!this.reqtime) this.reqtime = now;
        return now - retval.reqtime;
    }
//    console.log("parsed " + str, retval);
    return retval;
}


//eof
