
'use strict';

const bufdiff = require('my-plugins/utils/buf-diff');
const showthis = require('my-plugins/utils/showthis');
const logger = require('my-plugins/utils/logger')();

module.exports = Vix2Fx; //main export item


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Vixen2 effects (really just a compatibility layer):
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
        this.vix2.chbuf = new Buffer(this.MyFx.vix2.chbuflen); //"channel" (control value) list; used for Vixen2 channels
        this.vix2.prior = new Buffer(this.MyFx.vix2.chbuflen); //for dedup
    }
    else if (typeof this.opts.vix2ch != 'undefined') //child model ch bufs just ref into whole-house bufs
    {
//too soon:        if (!this.vix2render) throw "Vixen2-aware model '" + this.name + "' has no vix2render()";
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
        vix2models.unshift(this); //kludge: insert in reverse order to force z-order sort
    }
}


Vix2Fx.prototype.chbuflen = 512; //must be large enough to hold all Vixen channels


//save profile info for future ref:
Vix2Fx.prototype.Profile = function vix2prof(data)
{
//console.log("this", this);
    if (this.parent) throw "not whole-house model";
    this.vix2.prof = data; //Object.assign(this.seq_info || {}, data); //just store profile props for access later
}

//save seq info for future ref:
Vix2Fx.prototype.Sequence = function vix2seq(data)
{
    if (this.parent) throw "not whole-house model";
    this.vix2.seq = data; //Object.assign(this.seq_info || {}, data); //just store sequence props for access later
}


//Vixen2 raw buffer data:
//dedups and renders to model canvas
//FxPlayback.prototype.
Vix2Fx.prototype.partbuf =
Vix2Fx.prototype.rawbuf = function rawbuf(data)
{
//    if (!(this instanceof Model2D)) throw "wrong this in vix2fx";
    if (this.parent) //throw "Vixen2 effects should only be applied to whole-house model";
    {
//        logger("render vix2 model '%s' @ %s msec", this.name, data.time);
//        var bufpart = this.vix2chbuf.slice(model.vix2ch[0], model.vix2ch[0] + model.vix2ch[1]); //CAUTION: ref to parent buffer
        if (this.vix2.altbuf)
        {
//            var altbuf = this.chbuf.slice(model.vix2alt[0], model.vix2alt[0] + model.vix2alt[1]);
            var cmp = bufdiff(this.vix2.chbuf, this.vix2.altbuf);
            if (cmp) logger("model '%s' vix2ch buf != altbuf: time %s, ofs %s, bufs: %j vs. %j", this.name, data.time, cmp, this.vix2.chbuf, this.vix2.altbuf);
        }
//        showthis.call(this, "vix2fx.rawbuf");
//            model.vix2render(data.time, vix2chbuf); //populate port buffers
        if ((this.opts.dedup !== false) && /*model.priorbuf*/ data.time && !bufdiff(this.vix2.chbuf, this.vix2.prior)) return; //no change
//        model.priorbuf = partbuf; //CAUTION: ref to parent buffer
        this.vix2render(data.time, this.parent.vix2.chbuf); //partbuf); //project vix2 channels onto model canvas; use full chbuf to preserve offsets
        this.dirty = true;
        return;
    }
    if (data.dup) return; //already deduped; no change to channel data
    var dataofs = Math.abs((data.bufdiff || [0])[0]);
    data.buf.copy(this.vix2.chbuf, dataofs); //use copy rather than slice in case buffer contents change later or are shared
    if ((this.opts.dedup !== false) && /*this.priorbuf*/ data.frtime && !bufdiff(this.vix2.chbuf, this.vix2.prior)) return; //no change
//    this.priorbuf = data.buf;
    this.dirty = true; //redundant, set it for completeness
    if (vix2models.first.parent) vix2models.sort(function(lhs, rhs) { return (lhs.parent? lhs.opts.zorder || 0: -1) - (rhs.parent? rhs.opts.zorder || 0: -1); });
    vix2models.forEach(function vix2_rawbuf_propagate(model)
    {
        if (!model.parent) return; //skip self (whole-house is only model without a parent)
//            if (!model.vix2ch) return; //continue; //[0] = startch, [1] = count (optional)
        model.MyFx.vix2.rawbuf.call(model, data);
    }.bind(this));
    data.buf.copy(this.vix2.prior, dataofs); //need copy rather than slice/ref; do this after child models so they can dedup
    this.dirty = false;
}

//eof
