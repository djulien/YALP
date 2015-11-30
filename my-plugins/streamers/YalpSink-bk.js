
'use strict';

require('colors');
var fs = require('fs');
var glob = require('glob');
var Q = require('q'); //https://github.com/kriskowal/q
var inherits = require('inherits');
var clock = require('my-plugins/utils/clock');
var makenew = require('my-plugins/utils/makenew');
var stream = require('stream');
//var Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
var Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html
var Elapsed = require('my-plugins/utils/elapsed');


//frame writer stream:
function YalpSink(opts)
{
    if (!(this instanceof YalpSink)) return makenew(YalpSink, arguments);
    options.objectMode = true;
    Writable.call(this, options); //base class

    this.opts = (typeof opts == 'string')? {name: opts}: opts ||{}; //expose unknown options to others
}
module.exports.YalpSink = YalpSink;


YalpSink.prototype._write = function(chunk, encoding, done)
{
    throw "YalpSink._write TODO: process chunk, call done";
//TODO: store chunk, then call cb when done
    var buffer = Buffer.isBuffer(chunk) ? chunk : new Buffer(chunk, encoding); //convert string to buffer if needed
    done();
}


//eof
//====================================================================================================

/*
//examples from http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html
function MyWritableStream(opts)
{
    if (!(this instanceof MyWritableStream)) return new MyWritableStream(options);
    options.objectMode = true;
    Writable.call(this, options); //base class
//TODO: custom init
}
util.inherits(MyWritableStream, Writable);
MyWritableStream.prototype._write = function (chunk, enc, cb)
{
//TODO: store chunk, then call cb when done
    var buffer = Buffer.isBuffer(chunk) ? chunk : new Buffer(chunk, enc); //convert string to buffer if needed
    cb();
};

//or instantiate directly; see http://stackoverflow.com/questions/21491567/how-to-implement-a-writable-stream
var echoStream = new stream.Writable();
echoStream._write = function (chunk, encoding, done)
{
  console.log(chunk.toString());
  done();
};
//or
ws.write = function(buf) {
   ws.bytes += buf.length;
}
ws.end = function(buf) {
   if(arguments.length) ws.write(buf);
   ws.writable = false;
   console.log('bytes length: ' + ws.bytes);
}

var wstream_prefab = fs.createWriteStream('myOutput.txt', {encoding: whatever});
var wrStream_custom = new MyWritableStream({});

wstream.on('finish', function () { console.log('file has been written'); });
wstream.write(buffer); //binary data
wstream.write(buffer);
wstream.end(); //eof+close
*/
