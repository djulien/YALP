//YALP plug-in to send sequenced data to hardware
//this is a generic base class; instances need to supply the actual output() logic
'use strict';

var inherits = require('inherits');
//var Tokenizer = require('tokenizer');
//require('buffertools').extend(); //https://github.com/bnoordhuis/node-buffertools
//var elapsed = require('my-plugins/utils/elapsed');
var relpath = require('my-plugins/utils/relpath');
var Now = require('my-plugins/utils/clock').Now;


module.exports = Outhw;

//TODO    var b = binding.slice(allocPool, poolOffset, poolOffset + size);


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
}
inherits(Outhw, baseclass);


//seems like "non-flowing" mode is more appropriate here - that will avoid large unnecessary memory consumption
//this will also allow a couple of frames at a time to be generated on demand without spiking the cpu
Outhw.prototype._write = function(chunk, encoding, done_cb)
{
    if (!this.isouthw) throw "wrong 'this'"; //paranoid/sanity context check
//    console.log('outhw write: '.yellow + JSON.stringify(chunk));
//    setTimeout(function() { done_cb(); }, 1000); //tell sender to release this buffer and send another one; simulate time delay
//    if (!this.isouthw) throw "wrong 'this'"; //paranoid/sanity context check
    if (!chunk.data) chunk = {data: chunk};
    if (!chunk.id) chunk.id = '??';
//example for static format immediate-output-only controllers:
    var this_outhw = this;
    mySetTimeout(function()
    {
        if (!this_outhw.isouthw) throw "wrong 'this'"; //paranoid/sanity context check
        var delay = chunk.at - Now(); //NOTE: do not use cached value here, so delay is accurate
        if ((delay < 0) || (delay > 5)) console.log("%s: id '%s', len %d, delay %d msec going out NOW".red, (delay < 0)? "overdue": "premature", chunk.id, chunk.data.length, delay);
        else console.log("outhw: id '%s', len %d, delay %d msec going out on time".cyan, chunk.id, chunk.data.len, delay);
        this_outhw.out(chunk.id, chunk.data, chunk.data.length);
    }, chunk.at - Now());
//example for delayed out-then-verify controllers (RenXt):
/*TODO
//overlapped: buffer.slice(start, end=buffer.length); https://docs.nodejitsu.com/articles/advanced/buffers/how-to-use-buffers
    if (this.inbuf) //verify results of previous I/O
    {
        var inlen = this.in(chunk.id, this.inbuf, this.inbuf.length);
        while (inlen < this.inbuf.length) { this.inbuf[inlen] = this.outbuf[inlen] ^ 0xff; ++inlen; } //flip bits to force compare failure
        var cmp = this.outbuf.compare(this.inbuf);
        if (cmp) console.log("outhw COMPARE FAILED: id '%s', len %d".red, this.previd, inlen);
    }
    if (!this.outbuf || (this.outbuf.length < chunk.data.length))
    {
        this.previd = chunk.id; //this.prevat = chunk.at;
        this.outbuf = new Buffer(chunk.data.length);
        this.inbuf = new Buffer(chunk.data.length);
    }
    chunk.data.copy(this.outbuf); //, targetStart=0, sourceStart=0, sourceEnd=buffer.length); //make a copy of data before sending
    this.out(chunk.id, chunk.data, chunk.data.length, chunk.at);
*/
};


//TODO: child classes should override this with real I/O
Outhw.prototype.out = function(id, data, len)
{
//    var now = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''); //http://stackoverflow.com/questions/10645994/node-js-how-to-format-a-date-string-in-utc
//    var now = new Date().toISOString().substr(11, 12);
    console.log("OUT[%s] '%s' %d: %s".cyan, Now.asString(), id, len, data.toString('hex'));
}


function mySetTimeout(func, delay)
{
    if (delay < 5) func(); //NOTE: 4 msec is minimum delay provided by browsers; not sure about node.js
    else setTimeout(func, delay);
}

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
