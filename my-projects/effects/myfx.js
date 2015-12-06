
'use strict';

//const inherits = require('inherits');
//const makenew = require('my-plugins/utils/makenew');
const logger = require('my-plugins/utils/logger')();
const bufdiff = require('my-plugins/utils/buf-diff');
//var buf = models.entire.imgdata();
//require('my-plugins/my-extensions/json-revival');
//const bufferJSON = require('buffer-json'); //https://github.com/jprichardson/buffer-json
//const stmon = require('my-plugins/streamers/stmon').stmon;
//var split = require('split'); //https://github.com/dominictarr/split
//const stream = require('stream');
//const Duplex = stream.Duplex || require('readable-stream').Duplex; //for example see http://codewinds.com/blog/2013-08-31-nodejs-duplex-streams.html
//var Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
//const Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html
//const PassThrough = stream.PassThrough || require('readable-stream').PassThrough;

//const CatchMissing = true; //true => throw exc, false => log message, null => ignore

//no const Model2D = require('my-projects/models/model-2d'); //CAUTION: circular ref
//const ports = require('my-projects/models/my-ports').all;
//const models = require('my-projects/models/my-models').models;


//debugger;
//module.exports = MyFx;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// custom effect definitions
//

//pre-defined generic or special-purpose pseudo-effects
//used as a model mixin

//var MyFx = FxPlayback.prototype.MyFx = {}
//define top-level namespace for effects
function MyFxMixin(opts)
{
    Vix2Fx.apply(this, arguments); //nested ctor for each sub-namespace of fx
//    this.vix2 = new Vix2Fx();
}
module.exports = MyFxMixin;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// generic effects:

//raw buffer data:
//reassembles buf from fragments
//FxPlayback.prototype.
MyFxMixin.prototype.rawbuf = function rawbuf(data)
{
    if (data.dup) return; //no change to channel data
//    data.buf.copy(this.chbuf, Math.abs(data.diff[0] || 0)); //use copy rather than slice in case buffer contents change later or are shared
    throw "TODO: use imgdata()";
    this.imgdata(data);
}


//load image from file:
//FxPlayback.prototype.
MyFxMixin.prototype.image = function image(filename)
{
//    throw "TODO: fx.image";
    if (!filename) filename = process.cwd() + '/frame.data'; //_dirname
    var stream = fs.createReadStream(filename, {flags: 'r', objectMode: true});
    var buf = stream.read(); //read a single "image" from file
    stream.close();
    console.log("read '%s' len %s from file '%s'", this.name, buf.length, filename); //data.length);
//var imgdata = entire.imgdata();
//if (imgdata) imgdata = imgdata.data;
//console.log("imgdata len %s", imgdata.length); //data.length);
//console.log("imgdata ", imgdata); //data.length);
    this.imgdata(buf);
//TODO: duration, animation, etc
//TODO: xpm parser
    this.dirty = true;
    return this; //fluent
}


//project incoming channel values onto model canvas and mark dirty:
//Model2D.prototype.vix2render = function(vix2buf)
//{
//    if ((this.opts.dedup !== false) && this.priorbuf && !bufdiff(vix2buf, this.priorbuf)) return; //no change
//    this.priorbuf = vix2buf;
//    this.dirty = true;
//}


//pseudo-namespace + state:
//FxPlayback.prototype.MyFx = {};
/*
{
    ismine: function ismine(fxname)
    {
        return fxname && /-*(fxname in this) &&*-/ (typeof this[fxname] == 'function'); //.prototype;
    },
    render: function(frtime) //NOTE: render runs about 1 frame ahead so port flush will be on time
    {
//        if (typeof this.elapsed == 'undefined') this.elapsed = new Elapsed(frtime); //start elapsed time counter when first frame is received; header frames come before first data frame to stay in sync even with setup or pre-render
//then do general effect/animation rendering:
        models.forEach(function(model) { model.render(); }); //extract nodes from canvas; protocol will populate port output buffers
//        flush_ports(frtime);
    },
}
*/


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Vixen2 effects:
//

//const vix2chlist = require('my-projects/models/my-models').vix2chlist; //mapped Vixen2 channels
//const vix2buflen = 4 * vix2chlist.length;

var vix2models = module.exports.vix2models = [];
//var vix2_mappedch /*= module.exports.vix2mappedch*/ = {}; //vix2 channel range
var vix2_minch, vix2_maxch;


//namespace + state:
//FxPlayback.prototype.
function Vix2Fx(opts)
{
//console.log("tpeof", typeof Model2D);
//console.log("mod2d", Model2D);
//    if (!(this instanceof Model2D)) throw "wrong this in fx.vix2";
    if (!this.parent) //whole-house model is the only one that needs to have a channel buffer; this allows sharing channels between child models
    {
//        /*if (!this.vix2info)*/ this.vix2 = Object.assign({}, Vix2Fx.prototype);
        this.vix2 = {};
        this.vix2.chbuf = new Buffer(this.fx.vix2.chbuflen); //"channel" (control value) list; used for Vixen2 channels
        this.vix2.prior = new Buffer(this.fx.vix2.chbuflen); //for dedup
    }
    else if (typeof this.opts.vix2ch != 'undefined') //child model ch bufs just ref into whole-house bufs
    {
        this.vix2 = {}; ///*if (!this.vix2info)*/ this.vix2 = Object.assign({}, Vix2Fx.prototype);
        if (!Array.isArray(this.opts.vix2ch)) this.opts.vix2ch = [this.opts.vix2ch, 1]; //[0] = startch, [1] = count (optional)
        if (typeof this.opts.vix2alt != 'undefined')
            if (!Array.isArray(this.opts.vix2alt)) this.opts.vix2alt = [this.opts.vix2alt, 1];
        this.vix2.chbuf = this.parent.vix2.chbuf.slice(this.opts.vix2ch[0], this.opts.vix2ch[0] + this.opts.vix2ch[1]); //CAUTION: ref to parent buffer
        this.vix2.prior = this.parent.vix2.prior.slice(this.opts.vix2ch[0], this.opts.vix2ch[0] + this.opts.vix2ch[1]); //CAUTION: ref to parent buffer
        if (typeof this.opts.vix2alt != 'undefined') this.vix2.altbuf = this.parent.vix2.chbuf.slice(this.opts.vix2alt[0], this.opts.vix2alt[0] + this.opts.vix2alt[1]);
        vix2_minch = vix2models.length? Math.min(vix2_minch, this.opts.vix2ch[0]): this.opts.vix2ch[0];
        vix2_maxch = vix2models.length? Math.max(vix2_maxch, this.opts.vix2ch[0]): this.opts.vix2ch[0];
        if (vix2_maxch - vix2_minch + 1 > this.parent.vix2.chbuf.length) throw "Vix2 chbuf on whole-house too small: is " + this.parent.vix2.chbuf.length + ", needs to be " + (vix2_maxch - vix2_minch + 1);
        vix2models.push(this);
    }
}
MyFxMixin.prototype.vix2 = Vix2Fx.prototype;


Vix2Fx.prototype.chbuflen = 512; //must be large enough to hold all Vixen channels


Vix2Fx.prototype.Profile = function vix2prof(data)
{
console.log("this", this);
    if (this.parent) throw "not whole-house model";
    this.vix2.prof = data; //Object.assign(this.seq_info || {}, data); //just store profile props for access later
}

Vix2Fx.prototype.Sequence = function vix2seq(data)
{
    if (this.parent) throw "not whole-house model";
    this.vix2.seq = data; //Object.assign(this.seq_info || {}, data); //just store sequence props for access later
}


//Vixen2 raw buffer data:
//dedups and renders to model canvas
//FxPlayback.prototype.
Vix2Fx.prototype.rawbuf = function rawbuf(data)
{
//    if (!(this instanceof Model2D)) throw "wrong this in vix2fx";
    if (this.parent) //throw "Vixen2 effects should only be applied to whole-house model";
    {
        logger("render vix2 model '%s' @ %s msec", this.name, data.time);
//        var bufpart = this.vix2chbuf.slice(model.vix2ch[0], model.vix2ch[0] + model.vix2ch[1]); //CAUTION: ref to parent buffer
        if (this.vix2.altbuf)
        {
//            var altbuf = this.chbuf.slice(model.vix2alt[0], model.vix2alt[0] + model.vix2alt[1]);
            var cmp = bufdiff(this.vix2.chbuf, this.vix2.altbuf);
            if (cmp) logger("model '%s' vix2ch buf != altbuf: time %s, ofs %s", this.name, data.time, cmp);
        }
//            model.vix2render(vix2chbuf); //populate port buffers
        if ((this.opts.dedup !== false) && /*model.priorbuf*/ data.time && !bufdiff(this.vix2.chbuf, this.vix2.prior)) return; //no change
//        model.priorbuf = partbuf; //CAUTION: ref to parent buffer
        this.vix2render(this.parent.vix2.chbuf); //partbuf); //project vix2 channels onto model canvas
        this.dirty = true;
        return;
    }
    if (data.dup) return; //already deduped; no change to channel data
    data.buf.copy(this.vix2.chbuf, Math.abs(data.diff[0] || 0)); //use copy rather than slice in case buffer contents change later or are shared
    if ((this.opts.dedup !== false) && /*this.priorbuf*/ data.frtime && !bufdiff(this.vix2.chbuf, this.vix2.prior)) return; //no change
//    this.priorbuf = data.buf;
    this.dirty = true; //redundant, set it for completeness
    vix2models.forEach(function(model)
    {
        if (!model.parent) return; //skip self (whole-house is only model without a parent)
//            if (!model.vix2ch) return; //continue; //[0] = startch, [1] = count (optional)
        model.fx.vix2.rawbuf.call(model, data);
    }.bind(this));
    data.buf.copy(this.prior, Math.abs(data.diff[0] || 0)); //need copy rather than slice/ref; do this after child models so they can dedup
    this.dirty = false;
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// xLights/Nutcracker effects:
//

//TODO: define additional custom effects:
//use nested namespaces as desired to group related effects into a hierarchy
//TODO: fx library manager?

//namespace + state:
//FxPlayback.prototype.
MyFxMixin.prototype.xl3lib =
{
    butterfly: function() { throw "TODO: xl3 butterfly"; },
    meteors: function() { throw "TODO: xl3 meteors"; },
};


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// additional custom effects
//


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//create one global, shared instance:
//this one handles basic updates to models
//caller can create additional Fx streams as needed
//FxPlayback.myfx = new FxPlayback();
//console.log(Object.getOwnPropertyNames(FxPlayback.myfx).filter(function (prop) { return typeof FxPlayback.myfx[prop] === 'function'; }));

//eof
