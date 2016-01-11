//log to stream + console with seq# and timestamping
'use strict';

//TODO: use winston or bunyan?
// https://strongloop.com/strongblog/compare-node-js-logging-winston-bunyan/
//doesn't seem to be an mru/limit option

require('colors');
const fs = require('fs');
const path = require('path');
/*var sprintf =*/ require('sprintf.js'); //.sprintf;
const clock = require('my-plugins/utils/clock');
const elapsed = require('my-plugins/utils/elapsed');
const caller = require('my-plugins/utils/caller').caller;
const makenew = require('my-plugins/utils/makenew');
const inherits = require('inherits');
const stream = require('stream');
//var Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
const Duplex = stream.Duplex || require('readable-stream').Duplex; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
//const cluster = require('cluster');

const cwd = process.cwd(); //save it in case cwd changes
var latest;

//level 0 => always logged
//NOTE: 2 ways to call:
// as ctor: set options
// as function: write message to logger stream
//options:
//  filename: pipe to specified filename; default bare readable stream if not specified
//  limit: max size of filename (bytes); only applies if filename specified
//  append: preserve existing filename contents (if filename specified)
//  detail: max detail level to log
//  color: true/false want console colors (default true)
//  elapsed: allow elapsed timer to be back-dated
/*module.exports.logger = function*/
//module.exports =
function Logger(opts) //level, fmt)
{
    if (!(this instanceof Logger)) return makenew(Logger, arguments); //.message; //ctor; set options
//        return makenew(Logger, arguments);
//        this.objectMode = true; //one read/write per record on binary data (ignores length)
    Duplex.apply(this); //, arguments); //base class ctor; args are all mine, so don't pass those along
    if (!opts) opts = {};
    if (opts.filename)
    {
        this.filename = (opts.filename === true)? path.join(cwd, "yalp.log"): opts.filename;
//            if (opts.append) throw "append not implemented"; //TODO: read/truncate file contents
        var file = fs.createWriteStream(this.filename); //, { flags: opts.append? 'a': 'w', defaultEncoding: 'utf8', mode: 0o666 }););
        this.pipe(file);
    }
    this.seqnum = 0; //, prev = 0;
    this.elapsed = new elapsed(opts.elapsed); //allow caller to back-date timer
    this.want_color = opts.color; //!== false); //allow caller to change
    this.want_console = opts.console; //!== false); //allow caller to change
    this.depth_adjust = 0;
    this.detail = (typeof opts.detail != 'undefined')? opts.detail: 1; //allow caller to change
    latest = this;
//        return;
//    }
//    this.message.apply(this, arguments);
//    return this; //fluent
}
inherits(Logger, Duplex);


Logger.prototype.log =
Logger.prototype.warn =
Logger.prototype.error =
function msg(detail, fmt, args)
{
//    if (!arguments.length) //allow clean exit
//    {
//        if (timer) clearInterval(timer); timer = null;
//        if (logfile) logfile.end("(eof)\n");
//        return;
//    }
    var args = Array.from/*prototype.slice.call*/(arguments); //extract sprintf varargs
//    console.log(arguments.length + " log args: ", arguments);
    if (typeof detail === 'string') { fmt = detail; detail = 0; args.splice(0, 0, 1); } //Array.prototype.splice.call(arguments, 0, 0, 1); }
    if (detail > /*module.exports.*/ this.detail) return;
    var numvals = (fmt.match(/%[^%]/g) || []).length;
    if (args.length > 2) fmt = sprintf.apply(null, args.slice(1)); //null, args.slice(1)); //Array.prototype.slice.call(arguments, 1));
    for (var i = numvals + 2; i < args.length; ++i) //include trailing (unformatted) values like console.log does
        fmt += args[i];
//    else if (!args.length) fmt = sprintf("%s '%s' is ready after %s", chkprop.substr(2), this.name, this.elapsed.scaled());
    ++/*module.exports.*/ this.depth_adjust; //show my caller, not me
    fmt = fmt /*.replace(/@logger:.*$/, ' @')*/ + ' ' + caller(-/*module.exports.*/ this.depth_adjust); /*module.exports.*/ this.depth_adjust = 0;
//    fmt += "caller(" + svdepth + "): " + caller(0);
//    debugger;
    var stamp = '+' + ((this.elapsed.now + .5) / 1000).toString().slice(0, -1); // /*logfile*/ seqnum? '+' + this.elapsed.now / 1000: '=' + clock.Now.asDateTimeString();
    if (process.send) return process.send({log: fmt, level: detail}); //cluster.isMaster) //send to parent to log

/*
    if (!logfile)
    {
//        logger.elapsed = new elapsed();
        logfile = fs.createWriteStream(filename, {flags: seqnum? 'a': 'w'});
        logfile.on('error', function(err) { console.log(("LOG ERROR: " + err).red); process.exit(1); });
//        logfile.on('finish', function() { console.log("LOG FINISH"); });
//        logfile.on('drain', function() { console.log("LOG DRAIN"); });
        /-*timer =*-/ setTimeout(function() //flush after 2 sec of no activity; don't use setInterval so main can exit if idle
        {
//            if (seqnum == prev) return;
//            prev = seqnum;
            if (logfile) logfile.end("(flush)\n");
            logfile = null;
        }, 2000);
        if (!logger.onexit)
        {
            logger.onexit = true;
            process.on('exit', function(code) { if (logfile) logfile.end("exit(%d)", code); logfile = null; });
        }
    }
*/

    var ColorCodes = /\x1b\[\d+m/g;
    if (!this.seqnum && this.elapsed.now) //show real start time
    {
        var fmt0 = sprintf("[%d =%s] pid %s STARTED >> '%s'".blue, -1, clock.Now.asDateTimeString(clock.Now() - this.elapsed.now, false), process.pid, this.filename); //adjust clock back to actual start time
        if (this.want_console) console.log(fmt0);
        this.push(fmt0.replace(ColorCodes, '') + '\n');
    }
    fmt = sprintf("%s[%d %s] %s", (detail > /*module.exports*/ this.detail)? 'X': '', this.seqnum++, stamp, fmt);

    var svcolor = [];
    fmt = fmt.replace(ColorCodes, function(str) { svcolor.push(str); return ''; }); //strip color codes
    if (!svcolor.length) svcolor.push('');
    if (this.want_console) console.log(this.want_color? svcolor[0] + fmt + svcolor[svcolor.length - 1]: fmt); //reapply color to end of line
//debugger;
    this.push(fmt + '\n'); //, 'utf8', function(err) { if (err) console.log("loggr write: err? " + err); }); //strip color codes in log file
//    console.log("logger", logfile);
//    this.message.pipe = function(dest)
//    {
//        this.pipe(dest);
//    }.bind(this);
    return this; //fluent
}

Logger.prototype._read =
function read(size)
{
}


Logger.prototype.create =
function ctor(opts)
{
    return makenew(Logger, arguments);
}


//Logger.prototype.message.pipe = function(dest)
//{
//    Logger.prototype.pipe;
//}

var shared = new Logger();
module.exports = shared; //expose method to write to global logger
//module.exports.create = Logger; //expose ctor so caller can create custom loggers

// /*module.exports.*/ logger.DetailLevel = 1;
// /*module.exports.*/ logger.depth_adjust = 0;
// /*var*/ logger.elapsed = new elapsed();

//eof
