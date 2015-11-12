
'use strict';

var assert = require('insist');
var inherits = require('inherits');
var Color = require('onecolor').color; //tinycolor');
var makenew = require('my-plugins/utils/makenew');
var models = require('my-projects/models/model'); //generic models
var Rect2D = models.Rect2D;

function isdef(thing) { return (typeof thing !== 'undefined'); }

module.exports = Columns2D; //use function names so model.name can be set from ctor
//TODO: individual columns (sub-models)

//custom column layout:
//
// L  M  R
// L  M  R
// :  :  :
// HHHHH
//
//L = 37 nodes (0..36 first string, T2B)
//M = 50 nodes (0..49 second string, T2B)
//R = 50 nodes (0..49 third string, T2B)
//H = 42 nodes (37..78 first string, L2R)
//
//canvas is 2D rectangle (sparsely populated)
//Vixen2 channels are T2B


function Columns2D(opts)
{
    if (!(this instanceof Columns2D)) return makenew(Columns2D, arguments);
    opts = (typeof opts !== 'object')? {param: opts}: opts || {};
//    if (isdef(opts.w) && (opts.w != 42)) throw "Incorrect col w: " + opts.w;
//    if (isdef(opts.h) && (opts.h != 51)) throw "Incorrect col h: " + opts.h;
    opts.w = 42; opts.h = 50 + 1; opts.numpx = 3 * 80;
    var args = Array.from(arguments); args[0] = opts;
    Rect2D.apply(this, args);
}
inherits(Columns2D, Rect2D);


//custom node ordering:
//maps sparse 42 x 51 rect to 3 x 80 rect
//(0, 0) in lower left corner
Columns2D.xy2node = XY;
function XY(x, y)
{
    if (y < 1) return (x < 0)? -1: (x >= 42)? this.numpx: 37 + x;
    if (x < 10) return (y < 1)? -1: (y > 37)? this.numpx: 37 - y; //this.B2T(y);
    if (x >= 30) return (y < 1)? -1: (y > 50)? this.numpx: 80 + 50 - y;
    return (y < 1)? -1: (y > 50)? this.numpx: 2*80 + 50 - y;
}


//var map =
//[
//    [XY(0, 37), XY(0,
//    {from: [0, 0], to: [0, 6]},
//];
debugger;
xymap = [], debug_map = [];
//map Vixen2 channels to xy rect:
[
    null, null, {start: 37, end: 1, count: 6}, //L col 0..7
    null, {start: 50, end: 1, count: 7}, //M col 8..15
    null, null, {start: 50, end: 1, count: 6}, //R col 16..23
].forEach(function(seg, inx)
{
    if (!seg) { xymap.push(null); debug_map.push('-'); return; }
    for (var y = seg.start, dy = (seg.start - seg.end + 1) / seg.count, yinc = Math.round(dy); y > seg.end; y -= dy)
    {
        var xylist = [];
        for (var node = XY(Math.floor(inx / 8), Math.round(y)); node <
//        xymap.push(this.buf.slice(start, len));
        debug_map.push(start + '..' + start + len - 1);
        xymap.push(xylist);
    }
});


Columns2D.prototype.vix2render = function(vix2buf) //all Vixen2 channels
{
debugger;
    var color = 0;
    xymap.forEach(function(xylist, inx)
    {
        if (!inx || (vix2buf[inx] != vix2buf[inx - 1])) color = parseInt(Color('#C0A040').lightness(vix2buf[inx] / 255, true).hex, 16); //simulate clear incand
        xylist.forEach(function(nodeofs)
        {
            Model.prototype.pixel.call(this, nodeofs, color);
        });
    });
    this.dirty = true; //TODO: model dedup?; vix2 buf was already deduped, so for now just assume it really did change
}


//divide target nodes into segments, one for each Vixen2 channel
//NOTE: this should only be called once due to the buffer manipulation overhead
//var cols_LMRH = yport.alloc(Columns2D, {xw: 42, xh: 51, zinit: false, vix2ch: [181, +23], noop: [181, 182, 189, 197, 198]});
/*
//can't use buf slices due to R/G/B
Columns2D.prototype.allocbuf = function(chbuf) //all Vixen2 channels
{
    debugger;
//    this.colL = buf.slice(0, 37);
//    this.colH = buf.slice(37, 42);
//    this.colM = buf.slice(37 + 42, 50);
//    this.colR = buf.slice(37 + 42 + 50, 50);
//divide target into segments representing Vixen2 channels:
    if (this.mapped_buf) throw "Duplicate buf remap";
    this.mapped_buf = [];
    this.debug_map = [];
    [
        null, null, {start: 0, span: 37, count: 6}, //L col 0..7
        null, {start: 37 + 42, span: 50, count: 7}, //M col 8..15
        null, null, {start: 37 + 42 + 50, span: 50, count: 6}, //R col 16..23
    ].forEach(function(seg, inx, bufmap)
    {
        if (!seg) { this.mapped_buf.push(null); this.debug_map.push('-'); return; }
        for (var inx = 0, ofs = seg.start, inc = seg.span / seg.count, len = Math.round(inc); inx < seg.count; ++inx, ofs += inc)
        {
            var start = Math.round(ofs);
            this.mapped_buf.push(this.buf.slice(start, len));
            this.debug_map.push(start + '..' + start + len - 1);
        }
    });
    assert(this.mapped_buf.length == 3 * 8 + 1);
}
Columns2D.prototype.vix2render = function(vix2buf) //all Vixen2 channels
{
//    for (var chinx = 0; chinx <= this.opts.vix2ch[1]; ++chinx)
    this.mapped_buf.forEach(function(segbuf, inx)
    {
        if (!segbuf) return;
//no: rgb        segbuf.fill(vix2buf[inx]); //set all nodes for this segment
        this.dirty = true; //TODO: model dedup?; vix2 buf was already deduped, so for now just assume it really did change
    });
}
*/


//eof
