
'use strict';
const fs = require('fs');
const path = require('path');

//if (false)
{

const logger = require('my-plugins/streamers/logger'); //latest/global object

const logfile1 = fs.createWriteStream(path.join(process.cwd(), "test1.log"));

var logger1 = logger.create();
logger1.pipe(logfile1);

var logger2 = logger.create({filename: "test2.log", detail: 20, limit: 30});

logger1.log("msg 1");
setTimeout(function() { logger1.log(30, "msg 2"); logger2.log(30, "msg2"); }, 300);
setTimeout(function() { logger2.log(30, "msg3"); }, 2000);
setTimeout(function() { for (var i = 0; i < 10; ++i) logger2.log("msg", i); }, 2500);

//var logger = Logger; //first one
var buf = new Buffer(4);
buf.fill(1);
logger.log("msg4 %s", "hello", "bye", buf);

setTimeout(function() { logger.log(30, "msg4"); }, 3000);
setTimeout(function() { logger.detail = 99; logger.log(30, "msg4"); }, 3000);
}


if (false)
{
//const fs = require('fs');
//const path = require('path');
const mrufile = require('my-plugins/streamers/mrufile');

//var log = fs.createWriteStream("test1.log");
//var log = new mrufile({filename: 'mru.log', bytes: 300, append: true});
var log = new mrufile('mru.log', {bytes: 300});

//var buf = '';
//for (var i in log) buf += ', ' + i;
//console.log("mru methods " + buf);

setTimeout(function()
{
//setTimeout(function() { for (var i = 0; i < 10; ++i) logger2("msg", i, "                                                            "); }, 2500);
for (var i = 0; i < 8; ++i)
    log.write("msg" + i + "                              \n");
}, 2);

setTimeout(function()
{
debugger;
    for (var i = 8; i < 10; ++i)
        log.write("msg" + i + "                              \n".substr(i >= 10));
}, 2100);

setTimeout(function() { process.exit(); }, 4200);
}

//eof
