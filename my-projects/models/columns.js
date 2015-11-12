
'use strict';

var inherits = require('inherits');
var makenew = require('my-plugins/utils/makenew');
var models = require('my-projects/models/model'); //generic models
var Rect2D = models.Rect2D;

module.exports = Columns2D; //use function names so model.name can be set from ctor


function Columns2D(opts)
{
    if (!(this instanceof Columns2D)) return makenew(Columns2D, arguments);
    opts = (typeof opts !== 'object')? {param: opts}: opts || {};
    if (isdef(opts.w) && (opts.w != 42)) throw "Incorrect col w: " + opts.w;
    if (isdef(opts.h) && (opts.h != 51)) throw "Incorrect col h: " + opts.h;
    opts.w = 42;
    opts.h = 51;
    var args = Array.from(arguments); args[0] = opts;
    Rect2D.apply(this, args);
}
inherits(Columns2D, Rect2D);


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

var cols_LMRH = yport.alloc(Columns2D, {xw: 42, xh: 51, zinit: false, vix2ch: [181, +23], noop: [181, 182, 189, 197, 198]});
Columns2D.prototype.allocbuf = function(buf)
{
//    this.colL = buf.slice(0, 37);
//    this.colH = buf.slice(37, 42);
//    this.colM = buf.slice(37 + 42, 50);
//    this.colR = buf.slice(37 + 42 + 50, 50);
//divide target into segments representing Vixen2 channels:
    this.mapped_buf = [];
    [
        null, null, {start: 0, span: 37, count: 6}, //L col 0..7
        null, {start: 37 + 42, span: 50, count: 7}, //M col 8..15
        null, null, {start: 37 + 42 + 50, span: 50, count: 6}, //R col 16..23
    ].forEach(function(segment, inx, bufmap)
    {
        if (!segment) { this.mapped_buf.push(null); return; }
        for (var inx = 0, ofs = segment.start; inx < segment.count; ++inx, ofs += segment.span / segment.count)
            this.mapped_buf.push(buf.slice(Math.round(ofs), Math.round()));
    });
    assert(this.mapped_buf.length == 3 * 8);
}

Columns2D.prototype.vix2render = function(vix2buf)
{
//    for (var chinx = 0; chinx <= this.opts.vix2ch[1]; ++chinx)
//left col: 6 ch => 37 pixels
    this.buf[0] = thi
        
}


//eof
