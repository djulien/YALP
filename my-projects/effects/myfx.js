
'use strict';

//const inherits = require('inherits');
//const makenew = require('my-plugins/utils/makenew');
const logger = require('my-plugins/utils/logger')();
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

const Vix2Fx = require('my-projects/effects/vix2fx');
const xLNc3Fx = require('my-projects/effects/xlnc3fx');


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

//include additional "libraries" of effects under nested namespaces:
MyFxMixin.prototype.vix2 = Vix2Fx.prototype;
MyFxMixin.prototype.xlnc3 = xLNc3Fx.prototype;


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

//create one global, shared instance:
//this one handles basic updates to models
//caller can create additional Fx streams as needed
//FxPlayback.myfx = new FxPlayback();
//console.log(Object.getOwnPropertyNames(FxPlayback.myfx).filter(function (prop) { return typeof FxPlayback.myfx[prop] === 'function'; }));

//eof
