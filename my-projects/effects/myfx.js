
'use strict';

const inherits = require('inherits');
const makenew = require('my-plugins/utils/makenew');
const logger = require('my-plugins/utils/logger')();
//var buf = models.entire.imgdata();
//require('my-plugins/my-extensions/json-revival');
const bufferJSON = require('buffer-json'); //https://github.com/jprichardson/buffer-json
const stmon = require('my-plugins/streamers/stmon').stmon;
//var split = require('split'); //https://github.com/dominictarr/split
const stream = require('stream');
//const Duplex = stream.Duplex || require('readable-stream').Duplex; //for example see http://codewinds.com/blog/2013-08-31-nodejs-duplex-streams.html
//var Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
const Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html
//const PassThrough = stream.PassThrough || require('readable-stream').PassThrough;


debugger;
//module.exports = MyFx;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// effects stream
//

//writable effects stream:
function FxPlayback(opts)
{
    if (!(this instanceof FxPlayback)) return makenew(FxPlayback, arguments);
    Writable.apply(this, arguments); //base class

//NOTE: can instantiate custom stream directly; see http://stackoverflow.com/questions/21491567/how-to-implement-a-writable-stream
//however, we use derivation in order to allow multiple instances
//    this.on('end', function() { console.log("%d json objects read", count); });
    stmon(this, "FxStream");
    this.opcodes = {};
    var m_withfx = 0, m_without = 0, m_unkn = 0, m_errors = 0;
//    this.on('fxdata', function(data)
    this.onfxdata = function(data)
    {
//            FxDispatch(data);
//            console.log("in data", data);
        if (typeof data.fx == 'undefined') { ++m_without; return; } //no effect to process
        console.log("fx json[%d]: time %s, data %j", m_withfx++, data.time || '(no time)', data);
        if (isNaN(++this.opcodes[data.fx])) this.opcodes[data.fx] = 1;
        if (FxPlayback.myfx.ismine(data.fx)) FxPlayback.myfx[data.fx](data);
        else { ++m_unkn; logger("unknown effect: '%s' (ignored)".red, data.fx || '(none)'); }
//    }.bind(this));
    }
    this.on('error', function (err) //syntax errors will land here; note, this ends the stream.
    {
        ++m_errors;
        logger("error: ".red, err);
    }.bind(this))
    .on('end', function()
    {
        logger("FxPlayback: %d with fx, %d without, %d unknown fx, %d errors".cyan, m_withfx, m_without, m_unkn, m_errors);
        logger("opcodes: %j", this.opcodes);
    }.bind(this));
}
inherits(FxPlayback, Writable);
module.exports /*.FxPlayback*/ = FxPlayback;


FxPlayback.prototype._write = function writer(chunk, encoding, done)
{
debugger;
    var buf = JSON.parse(chunk, bufferJSON.reviver);
//    console.log('write: ', chunk.length, encoding, typeof chunk, typeof buf, chunk.toString()); //(encoding));
//    this.emit('fxdata', buf); //kludge: make the interface a little more consistent
    this.onfxdata(buf);
    done();
}


/*
FxStream.prototype._read = function reader(size_ignored)
{
    this.push(data);
    this.push(null); //eof
}
*/


/*
MyFx.prototype.FxPlayback = function FxPlayback(rd)
{
    this.busy = true;
    this.opcodes = {};
    var withfx = 0, without = 0, unkn = 0, errors = 0;
    rd
//    .pipe(echoStream)
//        .pipe(split(JSON.parse)) //repair buffers; see https://github.com/jprichardson/buffer-json
//        .pipe(process.stdout)
        .on('data', function (data) //each chunk now is an object
        {
//            FxDispatch(data);
//            console.log("in data", data);
            if (typeof data.fx == 'undefined') { ++without; return; } //no effect to process
            console.log("json[%d]: time %s, data %j", withfx++, data.time || '(no time)', data);
            if (isNaN(++this.opcodes[data.fx])) this.opcodes[data.fx] = 1;
            if (MyFx.myfx.ismine(data.fx)) MyFx.myfx[data.fx](data);
            else { ++unkn; logger("unknown effect: '%s' (ignored)".red, data.fx || '(none)'); }
        }.bind(this))
        .on('error', function (err) //syntax errors will land here; note, this ends the stream.
        {
            ++errors;
            logger("error: ".red, err);
            this.busy = false;
        }.bind(this))
        .on('end', function()
        {
            logger("FxPlayback: %d with fx, %d without, %d unknown fx, %d errors".cyan, withfx, without, unkn, errors);
            logger("opcodes: %j", this.opcodes);
            this.busy = false;
        }.bind(this));
    return rd; //fluent
}
*/


/*
function example_consumer()
{
    var duplex = new FxStream();
    duplex.on('readable', function ()
    {
        for (;;)
        {
            var chunk = duplex.read();
            if (chunk === null) break;
            console.log('read: ', chunk.toString());
        }
    });
    duplex.write('Hello \n');
    duplex.write('World');
    duplex.end();
}
*/


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// effect definitions
//

var MyFx = FxPlayback.prototype.MyFx = {}; //define top-level namespace for effects

MyFx.ismine = function ismine(fxname)
{
    return fxname && (fxname in this.MyFx) && (typeof this.MyFx[fxname] == 'function'); //.prototype;
}


//pre-defined generic or special-purpose pseudo-effects

MyFx.rawbuf = function rawbuf(data)
{
//TODO: save raw data
}


MyFx.vix2json = {}; //namespace

MyFx.vix2json.Profile = function vix2json_prof(data)
{
    this.prof_info = Object.assign(this.prof_info || {}, data); //just store profile props for access later
}


MyFx.vix2json.Sequence = function vix2json_seq(data)
{
    this.seq_info = Object.assign(this.seq_info || {}, data); //just store sequence props for access later
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// additional custom effects
//

//TODO: define additional custom effects:
//use nested namespaces as desired to group related effects into a hierarchy
//TODO: fx library manager?


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// global/shared instance to update custom models
//

//create one global, shared instance:
//this one handles basic updates to models
//caller can create additional Fx streams as needed
FxPlayback.myfx = new FxPlayback();

//eof
