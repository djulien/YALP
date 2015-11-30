
'use strict';

require('colors');
var fs = require('fs');
//var glob = require('glob');
//var Q = require('q'); //https://github.com/kriskowal/q
var inherits = require('inherits');
var MruArray = require('my-plugins/utils/mru-array');
/*var sprintf =*/ require('sprintf.js'); //.sprintf; //, vsprintf = require('sprintf-js').vprintf;
var clock = require('my-plugins/utils/clock');
var Elapsed = require('my-plugins/utils/elapsed');
var makenew = require('my-plugins/utils/makenew');
var stream = require('stream');
//var Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
//var Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html
var Transform = stream.Transform || require('readable-stream').Transform;


//stream transform:
//options (implemented):
//options (TODO):
//source controls timing; as long as transform doesn't take too long to process then it will preserve that timing
function YalpXform(opts) //{}
{
    if (!(this instanceof YalpXform)) return makenew(YalpXform, arguments);
//    if (typeof opts == 'object')? opts = {param: opts};
//    opts.objectMode = true;
//    var args = Array.from(arguments);
//    args[0] = opts;
    this.objectMode = true; //one read/write per record on binary data (ignores length)
    Transform.call(this, arguments); //base class ctor

    this.opts = (typeof opts == 'string')? {name: opts}: opts ||{}; //expose unknown options to others
}
inherits(YalpXform, Transform);
module.exports.YalpXform = YalpXform;


YalpXform.prototype._transform = function(chunk, encoding, done)
{
    throw "YalpXform._transform TODO: process chunk, push result, call done";
    this.push(chunk);
    done();
}

YalpXform.prototype._flush = function(done)
{
    throw "YalpXform._flush TODO: finish processing last chunk, push result, call done";
    this.push("last_piece");
    done();
}


//eof
//====================================================================================================

/*
//examples from https://strongloop.com/strongblog/practical-examples-of-the-new-node-js-streams-api/

var stream = require('stream')
var liner = new stream.Transform( { objectMode: true } )

liner._transform = function (chunk, encoding, done) {
     var data = chunk.toString()
     if (this._lastLineData) data = this._lastLineData + data

     var lines = data.split('\n')
     this._lastLineData = lines.splice(lines.length-1,1)[0]

     lines.forEach(this.push.bind(this))
     done()
}

liner._flush = function (done) {
     if (this._lastLineData) this.push(this._lastLineData)
     this._lastLineData = null
     done()
}
*/


//eof

