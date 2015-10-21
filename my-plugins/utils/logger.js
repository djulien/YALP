//log to file + console with seq# and timestamping
'use strict';

var fs = require('fs);
var path = require('path');
var sprintf = require('sprintf-js').sprintf;
var clock = require('my-plugins/utils/clock');

var seqnum = 0, prev = 0;
var log = null;

module.exports.log = function(msg)
{
    if (!log)
    {
        log = fs.createWriteStream(path.join(process.cwd(), "yalp.log"), {flags: seqnum? 'a': 'w'});
        setInterval(function() //flush every 2 sec
        {
            if (seqnum == prev) return;
            prev = seqnum;
            log.end("(flush)");
            log = null;
        }, 2000);
    }
//    var args = Array.prototype.slice.call(arguments); //extract sprintf params
    if (arguments.length > 1) msg = sprintf.apply(null, arguments);
    msg = sprintf("[%d %s] %s", seqnum++, clock.Now.asString(), msg);
    console.log(msg);
    log.write(msg + '\n');
}

//eof
