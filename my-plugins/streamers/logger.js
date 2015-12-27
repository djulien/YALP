//log to stream + console with seq# and timestamping
'use strict';

//TODO: use winston or bunyan?
// https://strongloop.com/strongblog/compare-node-js-logging-winston-bunyan/
//doesn't seem to be an mru/limit option

require('colors');
var fs = require('fs');
var path = require('path');
/*var sprintf =*/ require('sprintf.js'); //.sprintf;
var clock = require('my-plugins/utils/clock');
var elapsed = require('my-plugins/utils/elapsed');
var caller = require('my-plugins/utils/caller').caller;
var stream = require('stream');
var Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html

var cwd = process.cwd(); //save it in case cwd changes


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
module.exports =
function Logger(opts) //level, fmt)
{
    if (this instanceof Logger) //ctor; set options
    {
//        return makenew(Logger, arguments);
        this.objectMode = true; //one read/write per record on binary data (ignores length)
        Readable.apply(this); //, arguments); //base class ctor; args are all mine, so don't pass those along
        if (!opts) opts = {};
        if (opts.filename)
        {
            var wrofs = 0;
            var mru = opts.limit? new Buffer(opts.limit): null;
            var filename = (opts.filename === true)? path.join(process.cwd(), "test1.log"): opts.filename;
            if (opts.append) throw "append not implemented"; //TODO: read/truncate file contents
            var file = fs.createWriteStream(filename); //, { flags: opts.append? 'a': 'w', defaultEncoding: 'utf8', mode: 0o666 }););
            this.pipe(file);
        }
        this.seqnum = 0; //, prev = 0;
        this.elapsed = new elapsed(opts.elapsed); //allow caller to back-date timer
        this.color = opts.color; //!== false); //allow caller to change
//        var depth_adjust = 0;
        this.detail = (typeof opts.detail != 'undefined')? opts.detail || 1; //allow caller to change
        return;
    }
//    if (!arguments.length) //allow clean exit
//    {
//        if (timer) clearInterval(timer); timer = null;
//        if (logfile) logfile.end("(eof)\n");
//        return;
//    }
    var args = Array.from/*prototype.slice.call*/(arguments); //extract sprintf varargs
//    console.log(arguments.length + " log args: ", arguments);
    if (typeof level === 'string') { fmt = level; level = 0; args.splice(0, 0, 1); } //Array.prototype.splice.call(arguments, 0, 0, 1); }
    if (level > /*module.exports.*/ logger.DetailLevel) return;
    var numvals = 0;
    for (;;)
    {
        var ofs =
    }
    if (args.length > 2) fmt = sprintf.apply(null, args.slice(1)); //null, args.slice(1)); //Array.prototype.slice.call(arguments, 1));
//    else if (!args.length) fmt = sprintf("%s '%s' is ready after %s", chkprop.substr(2), this.name, this.elapsed.scaled());
    ++/*module.exports.*/ logger.depth_adjust; //show my caller, not me
    fmt = fmt /*.replace(/@logger:.*$/, ' @')*/ + ' ' + caller(-/*module.exports.*/ logger.depth_adjust); /*module.exports.*/ logger.depth_adjust = 0;
//    fmt += "caller(" + svdepth + "): " + caller(0);
//    debugger;
    var stamp = '+' + ((logger.elapsed.now + .5) / 1000).toString().slice(0, -1); // /*logfile*/ seqnum? '+' + logger.elapsed.now / 1000: '=' + clock.Now.asDateTimeString();
    if (!logfile)
    {
//        logger.elapsed = new elapsed();
        logfile = fs.createWriteStream(filename, {flags: seqnum? 'a': 'w'});
        logfile.on('error', function(err) { console.log(("LOG ERROR: " + err).red); process.exit(1); });
//        logfile.on('finish', function() { console.log("LOG FINISH"); });
//        logfile.on('drain', function() { console.log("LOG DRAIN"); });
        /*timer =*/ setTimeout(function() //flush after 2 sec of no activity; don't use setInterval so main can exit if idle
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

    var ColorCodes = /\x1b\[\d+m/g;
    if (!seqnum && logger.elapsed.now) //show real start time
    {
        var fmt0 = sprintf("[%d =%s] STARTED >> '%s'".blue, -1, clock.Now.asDateTimeString(clock.Now() - logger.elapsed.now, false), path.relative(process.cwd(), filename)); //adjust clock back to actual start time
        console.log(fmt0);
        logfile.write(fmt0.replace(ColorCodes, '') + '\n');
    }
    fmt = sprintf("%s[%d %s] %s", (level > /*module.exports*/ logger.DetailLevel)? 'X': '', seqnum++, stamp, fmt);

    var svcolor = [];
    fmt = fmt.replace(ColorCodes, function(str) { svcolor.push(str); return ''; }); //strip color codes
    if (!svcolor.length) svcolor.push('');
    console.log(svcolor[0] + fmt + svcolor[svcolor.length - 1]); //reapply color to end of line
//debugger;
    logfile.write(fmt + '\n'); //, 'utf8', function(err) { if (err) console.log("loggr write: err? " + err); }); //strip color codes in log file
//    console.log("logger", logfile);
    return this; //fluent
}

/*module.exports.*/ logger.DetailLevel = 1;
/*module.exports.*/ logger.depth_adjust = 0;
/*var*/ logger.elapsed = new elapsed();

//eof
