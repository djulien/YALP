//log to file + console with seq# and timestamping
'use strict';

require('colors');
var fs = require('fs');
var path = require('path');
/*var sprintf =*/ require('sprintf.js'); //.sprintf;
var clock = require('my-plugins/utils/clock');
var caller = require('my-plugins/utils/caller').caller;
var elapsed = require('my-plugins/utils/elapsed');

var logfile = null;
var seqnum = 0; //, prev = 0;
//var elapsed = new elapsed();
var filename = path.join(process.cwd(), "yalp.log"); //save it in case cwd changes
//var depth_adjust = 0;

///*module.exports.*/ var DetailLevel = 1;

module.exports = function(opts)
{
    if (opts.detail) logger.DetailLevel = opts.detail;
//    var svstarted = logger.elapsed.now;
    if (opts.started) logger.elapsed.started = opts.started;
//    console.log("logger started was %d, is %d", svstarted, logger.elapsed.now);
//    console.log("logger detail %d", logger.DetailLevel);
    return logger;
}

//level 0 => always logged
/*module.exports.logger = function*/ function logger(level, msg)
{
//    if (!arguments.length) //allow clean exit
//    {
//        if (timer) clearInterval(timer); timer = null;
//        if (logfile) logfile.end("(eof)\n");
//        return;
//    }
    var args = Array.prototype.slice.call(arguments); //extract sprintf varargs
//    console.log(arguments.length + " log args: ", arguments);
    if (typeof level === 'string') { msg = level; level = 0; args.splice(0, 0, 1); } //Array.prototype.splice.call(arguments, 0, 0, 1); }
    if (level > /*module.exports.*/ logger.DetailLevel) return;
    if (args.length > 2) msg = sprintf.apply(null, args.slice(1)); //Array.prototype.slice.call(arguments, 1));
//    else if (!args.length) msg = sprintf("%s '%s' is ready after %s", chkprop.substr(2), this.name, this.elapsed.scaled());
    ++/*module.exports.*/ logger.depth_adjust; //show my caller, not me
    msg = msg /*.replace(/@logger:.*$/, ' @')*/ + ' ' + caller(-/*module.exports.*/ logger.depth_adjust); /*module.exports.*/ logger.depth_adjust = 0;
//    msg += "caller(" + svdepth + "): " + caller(0);
//    debugger;
    var stamp = '+' + logger.elapsed.now / 1000; // /*logfile*/ seqnum? '+' + logger.elapsed.now / 1000: '=' + clock.Now.asString();
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
        process.on('exit', function(code) { if (logfile) logfile.end("exit(%d)", code); logfile = null; });
    }

    if (!seqnum && logger.elapsed.now) //show real start time
    {
        var msg0 = sprintf("[%d =%s] STARTED".blue, -1, clock.Now.asString(clock.Now() - logger.elapsed.now)); //adjust clock back to actual start time
        console.log(msg0);
        logfile.write(msg0 + '\n');
    }
    msg = sprintf("%s[%d %s] %s", (level > /*module.exports*/ logger.DetailLevel)? 'X': '', seqnum++, stamp, msg);
    console.log(msg);
    debugger;
    logfile.write(msg.replace(/\x1b\[\d+m/g, "") + '\n'); //, 'utf8', function(err) { if (err) console.log("loggr write: err? " + err); }); //strip color codes in log file
//    console.log("logger", logfile);
}

/*module.exports.*/ logger.DetailLevel = 1;
/*module.exports.*/ logger.depth_adjust = 0;
/*var*/ logger.elapsed = new elapsed();


//eof
