
'use strict';

const fs = require('fs');
const path = require('path');

var log = fs.createWriteStream("test1.log");

process.exit;

const mrufile = require('my-plugins/streamers/mrufile');
var log = new mrufile({filename: 'mru.log', bytes: 300, append: true});
setTimeout(function() { for (var i = 0; i < 10; ++i) logger2("msg", i, "                                                            "); }, 2500);


const Logger = require('my-plugins/streamers/logger');

const logfile1 = fs.createWriteStream(path.join(process.cwd(), "test1.log"));

var logger1 = new Logger();
logger1.pipe(logfile1);

var logger2 = new Logger({filename: "test2.log", detail: 20, limit: 30});

logger1("msg 1");
setTimeout(function() { logger1(30, "msg 2"); logger2(30, "msg2"); }, 300);
setTimeout(function() { logger2(30, "msg3"); }, 2000);
setTimeout(function() { for (var i = 0; i < 10; ++i) logger2("msg", i, "                                                            "); }, 2500);

var logger = Logger; //first one
var buf = new Buffer(4);
buf.fill(1);
logger("msg4 %s", "hello", "bye", buf);

setTimeout(function() { logger(30, "msg4"); }, 3000);
setTimeout(function() { logger.detail = 99; logger(30, "msg4"); }, 3000);

//eof
