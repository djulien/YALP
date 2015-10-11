//YALP plug-in to send sequenced data to hardware
'use strict';

var inherits = require('inherits');
//var Tokenizer = require('tokenizer');
//require('buffertools').extend(); //https://github.com/bnoordhuis/node-buffertools
//var elapsed = require('my-plugins/utils/elapsed');
var relpath = require('my-plugins/utils/relpath');


module.exports = Outhw;


//http://www.sandersdenardi.com/readable-writable-transform-streams-node/
//var baseclass = require('stream').Writable;
//can't get streaming to work; just use events instead
var baseclass = require('events').EventEmitter;

function Outhw(opts)
{
    if (!(this instanceof Outhw)) return new Outhw(opts); //make "new" optional; make sure "this" is set
    baseclass.call(this, Object.assign(opts || {}, {objectMode: true, })); //pass options to base class; allow binary data

    this.isouthw = true;
    var this_ee = this;
    this.on('data-rcv', function(chunk, ack_cb)
    {
        if (!this_ee.isouthw) throw "wrong 'this'"; //paranoid/sanity context check
        this_ee._write(chunk, 'utf8??', ack_cb); //CAUTION: don't send ack until current stack is cleared (else recursion)
//        this_ee._write(chunk, 'utf8??', function() {
//            if (!this_ee.isouthw) throw "wrong 'this'"; //paranoid/sanity context check
//            process.nextTick(function() {
//                if (!this_ee.isouthw) throw "wrong 'this'"; //paranoid/sanity context check
//                this_ee.emit('data-ack'); }); }); //CAUTION: don't send ack until current stack is cleared (else recursion)
//        this_ee._write(chunk, 'utf8??', function() { this_ee.emit('data-ack'); }); //CAUTION: don't send ack until current stack is cleared (else recursion)
    });
};
inherits(Outhw, baseclass);


//seems like "non-flowing" mode is more appropriate here - that will avoid large unnecessary memory consumption
//this will also allow a couple of frames at a time to be generated on demand without spiking the cpu
Outhw.prototype._write = function(chunk, encoding, done_cb)
{
    if (!this.isouthw) throw "wrong 'this'"; //paranoid/sanity context check
    console.log('outhw write: '.yellow + JSON.stringify(chunk));
    setTimeout(done_cb, 1000); //tell sender to release this buffer and send another one; simulate time delay
//    if (!this.isouthw) throw "wrong 'this'"; //paranoid/sanity context check
};


//eof

/*
//for example see https://strongloop.com/strongblog/practical-examples-of-the-new-node-js-streams-api/
var xform = require('stream').Transform || require('readable-stream').Transform; //poly-fill for older node.js
var outhw = new xform({ objectMode: true, });

outhw._transform = function (chunk, encoding, done)
{
    console.log("outhw: in ".blue, JSON.stringify(chunk));
    done();
}
outhw._flush = function (done)
{
    console.log("outhw: eof".cyan);
    done();
}
*/
