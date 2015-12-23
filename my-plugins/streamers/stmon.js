
'use strict';

require('colors');
const fs = require('fs');
const path = require('path');
const logger = require('my-plugins/utils/logger')();
const unprintable = require('my-plugins/utils/unprintable');
const isStream = require('is-stream');
const stream = require('stream');
const PassThrough = stream.PassThrough || require('readable-stream').PassThrough;
//const zlib = require('zlib');


module.exports.rd = rd;
module.exports.wr = wr;
module.exports.echo = echo;
module.exports.rdwr = rdwr;
module.exports.stmon = stmon;
module.exports.not_stmon = not_stmon;


//create a file reader stream with debug monitoring:
function rd(infile, desc)
{
    if (!desc) desc = "infile";
    return stmon(fs.createReadStream(path.resolve(/*__dirname*/ process.cwd(), infile)), desc + " '" + infile + "'");
}


//create a file writer stream with debug monitoring:
function wr(outfile, desc)
{
    if (!desc) desc = "outfile";
    return stmon(fs.createWriteStream(path.resolve(process.cwd(), outfile)), desc + " '" + outfile + "'");
}


function echo()
{
//NOTE: can instantiate custom stream directly; see http://stackoverflow.com/questions/21491567/how-to-implement-a-writable-stream
    var count = 0;
    var echoStream = new stream.Writable({objectMode: true});
    echoStream._write = function (chunk, encoding, done)
    {
        var buf = JSON.parse(chunk); //, bufferJSON.reviver);
        console.log("json[%d]:", count++, buf);
        done();
    };
    echoStream.on('end', function() { console.log("%d json objects read", count); });
    return echoStream;
}


//create an in-out pass-thru stream with debug monitoring:
function rdwr(desc, cb)
{
    if (!desc) desc = "in/outfile";
    var passthru = stmon(new PassThrough(), desc);
    if (cb) passthru.on('data', cb);
    return passthru;
}


function not_stmon(stream, desc, showbuf) { return stream; }


//log stream events (for debug):
function stmon(stream, desc, showbuf)
{
    if (!desc /*arguments.length < 2*/) desc = "unamed stream"; //{ stream = desc; desc = "stream"; }
    if (!isStream(stream)) throw "'" + desc + "' is not a stream";
    desc = (isStream.duplex(stream)? 'D': '') + (isStream.readable(stream)? 'R': '') + (isStream.writable(stream)? 'W': '') + " " + (desc || 'stream');
    var oldwrite = stream.write;
    stream.write = function stmon_onwrite(data, cb)
    {
        fmt(desc + " OUTGOING", data, showbuf);
        oldwrite.apply(stream, arguments);
    };
    return stream
        .on('open', function() { logger("%s opened %s".green, desc); })
        .on('readable', function(data) { logger("%s readable".blue, desc); data = null; }) //readable only
        .on('data', function stmon_ondata(data) { fmt(desc + " INCOMING", data, showbuf); data = null; }) //readable only, not for writes
        .on('drain', function() { logger("%s drained".green, desc); }) //writable only
        .on('pipe', function(src) { logger("%s piped from a %s".cyan, desc, src.constructor.name); })
        .on('unpipe', function(src) { logger("%s unpiped from a %s".cyan, desc, src.constructor.name); })
        .on('end', function() { logger("%s end".green, desc); }) //readable only?
        .on('finish', function() { logger("%s flushed".green, desc); }) //writable only?
        .on('close', function() { logger("%s closed".cyan, desc); })
        .on('error', function(err) { logger("%s error: %j".red, desc, err.message || err); err = null; });
}

function fmt(desc, data, showbuf)
{
    var sbuf = !showbuf? '': (typeof data == 'string')? ': ' + unprintable(data): ': ' + JSON.stringify(data);
    logger("%s len %s%s".blue, desc, (typeof data.length != 'undefined')? data.length: '(none)', sbuf);
    sbuf = null;
}

//eof
