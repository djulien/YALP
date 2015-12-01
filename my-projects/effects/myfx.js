
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
/// process all effects found in a stream
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
    models.ports.forEach(function(port) { port.reset(); }); //clear buffers
    var m_withfx = 0, m_without = 0, m_unkn = 0, m_errors = 0;
    this.on('data', function(data)
//    this.onfxdata = function(data)
    {
        var has_time = (typeof data.time != 'undefined'); //frames with timestamp are synced
        if (has_time && (typeof this.elapsed == 'undefined')) this.elapsed = new Elapsed(data.time); //sync playback timer to first frame, then subsequent frames to timer
//            FxDispatch(data);
//            console.log("in data", data);
        if (typeof data.fx == 'undefined') { ++m_without; return; } //no effect to process
        console.log("fx json[%d]: time %s, has buf? %s, data", m_withfx++, has_time? data.time: '(no time)', Buffer.isBuffer(data.buf), data);
        if (isNaN(++this.opcodes[data.fx])) this.opcodes[data.fx] = 1;
        if (FxPlayback.myfx.MyFx.ismine(data.fx)) FxPlayback.myfx.MyFx[data.fx](data); //apply fx
        else { ++m_unkn; logger("unknown effect: '%s' (ignored)".red, data.fx || '(none)'); }
        if (!has_time) return; //don't need to refresh hardware on this frame
debugger;
        FxPlayback.myfx.MyFx.render(data.time);
        this.flush_ports(data.time); //send bytes to hardware at the correct time
    }.bind(this));
//    }
    this.on('error', function (err) //syntax errors will land here; note, this ends the stream.
    {
        ++m_errors;
        logger("error: ".red, err);
    }.bind(this))
    .on('finish', function()
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
    this.emit('data', buf); //kludge: force on() to see data (makes interface a little more consistent)
//    this.onfxdata(buf);
    done();
}


//controls timing of port output:
FxPlayback.prototype.flush_ports = function flush_ports(frtime, retry)
{
    var delay = frtime - this.elapsed(); //always compare to start in order to minimize cumulative timing error
    if (delay < -2.5) logger("frame %s is overdue by %s".red, frtime, delay);
    else if (delay < +2.5) logger("frame %s is more-or-less on time: delay %s".yellow, frtime, delay);
    else
    {
        logger("frame %s is pre-mature after %s: wait %s".blue, delay, retry? "retry": "pre-render", frtime);
        setTimeout(function() { this.flush_ports(frtime, true); }.bind(this), delay);
        return;
    }
    models.ports.forEach(function(port) { port.flush(); });
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
            console.log("json[%d]: time %s, data %j", withfx++, (typeof data.time != 'undefined')? data.time: '(no time)', data);
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

//pre-defined generic or special-purpose pseudo-effects

//var MyFx = FxPlayback.prototype.MyFx = {}
//define top-level namespace for effects
//function MyFx()

const models = require('my-projects/models/my-models').models;
const chlist = require('my-projects/models/my-models').chlist;


//project incoming channel values onto model canvas and mark dirty:
Model2D.prototype.vix2render = function(vix2buf)
{
    if ((this.opts.dedup !== false) && this.priorbuf && !bufdiff(vix2buf, this.priorbuf)) return; //no change
    this.priorbuf = vix2buf;
    this.dirty = true;
}


//pseudo-namespace + state:
FxPlayback.prototype.MyFx =
{
    chbuf: new Buffer(4 * chlist.length), //"channel" (control value) list; used for Vixen2 channels
    ismine: function ismine(fxname)
    {
        return fxname && (fxname in this) && (typeof this[fxname] == 'function'); //.prototype;
    },
    render: function(frtime) //NOTE: render runs about 1 frame ahead so port flush will be on time
    {
//        if (typeof this.elapsed == 'undefined') this.elapsed = new Elapsed(frtime); //start elapsed time counter when first frame is received; header frames come before first data frame to stay in sync even with setup or pre-render
//first render using Vixen channel info:
        vix2models.forEach(function(model)
        {
//            if (!model.vix2ch) return; //continue; //[0] = startch, [1] = count (optional)
            logger("render model '%s' @ %s msec", model.name, frtime);
            var vix2chbuf = this.chbuf.slice(model.vix2ch[0], model.vix2ch[0] + model.vix2ch[1]);
            if (typeof model.vix2alt != 'undefined')
            {
                var altbuf = this.chbuf.slice(model.vix2alt[0], model.vix2alt[0] + model.vix2alt[1]);
                var cmp = bufdiff(vix2chbuf, altbuf);
                if (cmp) logger("model '%s' vix2ch buf != altbuf: time %s, ofs %s", model.name, frtime, cmp);
            }
//            model.vix2render(vix2chbuf); //populate port buffers
            if ((model.opts.dedup !== false) && model.priorbuf && !bufdiff(vix2chbuf, model.priorbuf)) return; //no change
            model.priorbuf = vix2chbuf;
            model.vix2render(vix2chbuf); //project vix2 channels onto model canvas
            model.dirty = true;
        }.bind(this));
//then do general effect/animation rendering:
        models.forEach(function(model) { model.render(); }); //extract nodes from canvas; protocol will populate port output buffers
//        flush_ports(frtime);
    },
}


//raw buffer data:
//reassembles buf from fragments
FxPlayback.prototype.MyFx.rawbuf = function rawbuf(data)
{
    if (data.dup) return; //no change to channel data
    data.buf.copy(this.chbuf, Math.abs(data.diff[0] || 0)); //use copy rather than slice in case buffer contents change later or are shared
}


//load image from file:
FxPlayback.prototype.MyFx.image = function image(filename)
{
//TODO: duration, animation, etc
}


//namespace + state:
FxPlayback.prototype.MyFx.vix2json =
{
    Profile: function vix2json_prof(data)
    {
        this.prof_info = Object.assign(this.prof_info || {}, data); //just store profile props for access later
    },
    Sequence: function vix2json_seq(data)
    {
        this.seq_info = Object.assign(this.seq_info || {}, data); //just store sequence props for access later
    },
};


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// additional custom effects
//

//TODO: define additional custom effects:
//use nested namespaces as desired to group related effects into a hierarchy
//TODO: fx library manager?

//namespace + state:
FxPlayback.prototype.MyFx.xl3lib =
{
    butterfly: function() {},
    meteors: function() {},
};


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// global/shared instance to update custom models
//

//create one global, shared instance:
//this one handles basic updates to models
//caller can create additional Fx streams as needed
FxPlayback.myfx = new FxPlayback();
console.log(Object.getOwnPropertyNames(FxPlayback.myfx).filter(function (prop) { return typeof FxPlayback.myfx[prop] === 'function'; }));

//eof
