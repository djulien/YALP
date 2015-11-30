
'use strict';

require('colors');
const fs = require('fs');
const path = require('path');
const logger = require('my-plugins/utils/logger')();
const isStream = require('is-stream');
const stream = require('stream');
const PassThrough = stream.PassThrough || require('readable-stream').PassThrough;
//const zlib = require('zlib');


module.exports.rd = rd;
module.exports.wr = wr;
module.exports.echo = echo;
module.exports.rdwr = rdwr;
module.exports.stmon = stmon;


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


//log stream events (for debug):
function stmon(stream, desc)
{
    if (!desc /*arguments.length < 2*/) desc = "unamed stream"; //{ stream = desc; desc = "stream"; }
    if (!isStream(stream)) throw "'" + desc + "' is not a stream";
    desc = (isStream.duplex(stream)? 'D': '') + (isStream.readable(stream)? 'R': '') + (isStream.writable(stream)? 'W': '') + " " + (desc || 'stream');
    return stream
        .on('open', function() { logger("%s opened".green, desc); })
        .on('readable', function(data) { logger("%s readable".blue, desc); }) //readable only
        .on('data', function(data) { logger("%s data in len %d".blue, desc, data.length || '(no len)'); }) //readable only
        .on('drain', function() { logger("%s drained".green, desc); }) //writable only
        .on('pipe', function() { logger("%s piped".cyan, desc); })
        .on('unpipe', function() { logger("%s unpiped".cyan, desc); })
        .on('end', function() { logger("%s end".green, desc); }) //readable only?
        .on('finish', function() { logger("%s flushed".green, desc); }) //writable only?
        .on('close', function() { logger("%s closed".cyan, desc); })
        .on('error', function(err) { logger("%s error: %j".red, desc, err); });
}


//eof
