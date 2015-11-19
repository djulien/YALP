
'use strict';

var inherits = require('inherits');
var makenew = require('my-plugins/utils/makenew');
var models = require('my-projects/models/model'); //generic models
var Rect2D = models.Rect2D;

function isdef(thing) { return (typeof thing !== 'undefined'); }


module.exports = IcicleSegment2D; //use function names so model.name can be set from ctor
//TODO: composite icicles (super-model)


var all_h;
var all_w = 0;
var all_startch;
var all_order = [];
function IcicleSegment2D(opts)
{
    if (!(this instanceof IcicleSegment2D)) return makenew(IcicleSegment2D, arguments);
    opts = (typeof opts == 'string')? {name: opts}: (typeof opts === 'number')? {w: opts}: opts || {};
//    if (isdef(opts.w) && (opts.w != 42)) throw "Incorrect col w: " + opts.w;
//    if (isdef(opts.h) && (opts.h != 51)) throw "Incorrect col h: " + opts.h;
//    opts.w = 42; opts.h = 51;
    if (!isdef(opts.h)) opts.h = 10;
    var args = Array.from(arguments); args[0] = opts;
    Rect2D.apply(this, args);

    this.xorder = [];
    (opts.order || []).forEach(function(range)
    {
        for (var x = range.from, dx = (range.from < range.to)? +1: -1;; x += dx)
        {
            this.xorder.push(x);
            all_order.push(x + all_w);
            if (x == range.to) break;
        }
    }.bind(this));
    if (this.xorder.length != opts.w) throw "Missing x order in '" + this.name + "': got " + this.xorder.length + ", expected " + opts.w;
    if (!isdef(all_h)) all_h = opts.h;
    if (opts.h != all_h) throw "Inconsistent h: got " + opts.h + ", expected " + all_h;
    if (!isdef(all_startch)) all_startch = this.startch; //overlay
    all_w += opts.w;

//    if (!IcicleSegment2D.all) IcicleSegment2D.all = [];
//    IcicleSegment2D.all.push(this);
//    allinst.push(this);
}
inherits(IcicleSegment2D, Rect2D);


IcicleSegment2D.prototype.xy2node = function(x, y) //override with custom node order
{
    return (x < 0)? -1: (x >= this.w)? this.numpx: this.xorder[x] * this.h + this.B2T(y); //if x out of range force result to be as well; override with custom node order
}


//composite:
IcicleSegment2D.all = function(opts)
{
    if (!(this instanceof IcicleSegment2D.all)) return makenew(IcicleSegment2D.all, arguments);
    opts = (typeof opts == 'string')? {name: opts}: (typeof opts === 'number')? {w: opts}: opts || {};
    if (isdef(opts.w) && (opts.w != all_w)) throw "Incorrect col w: " + opts.w + " (expected " + all_w + ")";
    if (isdef(opts.h) && (opts.h != all_h)) throw "Incorrect col h: " + opts.h + " (expected " + all_h + ")";
    opts.w = all_w;
    opts.h = all_h;
    opts.order = all_order;
    opts.startch = all_startch;
    var args = Array.from(arguments); args[0] = opts;
    Rect2D.apply(this, args);

    this.xmap = []; //map 14 Vixen2 ch to range of ic 207 columns (avg 15 each)
//        for (var x = 0; x < this.opts.w; ++x) this.xspread[Math.round(x / this.vix2ch[1])]
    for (var x = 0; x < this.opts.vix2ch[1]; ++x) this.xmap.push(Math.round(this.opts.w * x / this.opts.vix2ch[1]));
    this.xmap.push(this.opts.w);
    console.log("ic.all xmap:", this.xmap);
//    this.pixel2D = function(x, y, color) { return this.pixel(this.xy2node(x, y), color); } //override with custom logic
    this.render = function() { return null; } //render each segment, not composite model
}
inherits(IcicleSegment2D.all, Rect2D);

IcicleSegment2D.all.prototype.xy2node = IcicleSegment2D.prototype.xy2node;

IcicleSegment2D.all.prototype.vix2render = function()
{
//    for (var x = this.xmap0, xinc = this.opts.w / this.vix2ch[1]; x < this.opts.w; x += xinc) //207 / 14 ~= 15 pixels wide each Vix2 seg
//    for (var seg = 0; seg < this.opts.vix2ch[1]; ++seg)
    this.vix2buf.forEach(function(chval, inx)
    {
        var segcolor = this.color(chval * 0x10101); //{red: chval, green: chval, blue: chval}); //mono to grayscale
//        console.log("set [%d..%d] to %s", this.xmap[inx], this.xmap[inx + 1], segcolor);
        for (var x = this.xmap[inx]; x < this.xmap[inx + 1]; ++x) //turn on range of columns
            this.column(x, segcolor);
    }.bind(this));
//    console.log("vixbuf", this.vix2buf);
//    console.log("icbuf", this.json());
}


//custom icicle layout:
//
// 20  10  0
// 21  11  1
//  :   :  :
// 29  19  9
//
//each icicle = 10 nodes (T2B), mostly R2L
//
//canvas is 2D rectangle (fully populated, but in varying order)


/*
//composite model:
IcicleBank.all = function(opts)
{
    if (!(this instanceof IcicleBank.all)) return makenew(IcicleBank.all, arguments);
    opts = (typeof opts !== 'object')? {param: opts}: opts || {};
    var m_maxch = 0;
    opts.startch = opts.chpool.numch;
    allinst.forEach(function(icbank, inx)
    {
        if (icbank.startch < opts.startch) opts.startch = icbank.startch;
        if (icbank.startch + icbank.numch > m_maxch) m_maxch = icbank.startch + icbank.numch;
    });
    opts.numch = m_maxch - opts.startch;
    var args = Array.from(arguments); args[0] = opts;
    Rect2D.apply(this, args);

    this.xy2node = function(x, y) //overide with custom node order
    {
        return this.nodeofs(this.R2L(x) * opts.h + this.B2T(y));
    }
}
inherits(IcicleBank.all, Rect2D);
*/


//eof
