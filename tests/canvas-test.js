
'use strict';

//TODO var empty = require('my-projects/playlists/empty');
//var Canvas = require('my-projects/models/growable-canvas');
require('sprintf.js');
var buffer = require('buffer');
buffer.INSPECT_MAX_BYTES = 800;
var Canvas = require('canvas'); //https://www.npmjs.com/package/canvas
var inherits = require('inherits');

/*
var mm_canvas = new Canvas(1, 1);
var mm_ctx = mm_canvas.getContext('2d');
var data = mm_ctx.getImageData(0, 0, 10, 10);
console.log("data", data);
process.exit(0);
*/

if (!console.clear) console.clear = function() {};

console.clear();
//        if (canvas.getContext){
//    var ctx = canvas.getContext('2d');


// var Canvas = require('canvas'); //https://www.npmjs.com/package/canvas
//var Image = canvas.Image;


function makenew(type, args)
{
    return new (type.bind.apply(type, [null].concat(Array.prototype.slice.call(args))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
}

function isdef(thing)
{
    return typeof thing !== 'undefined';
}

//function inherits(from, to)
//{
//    for (var m in from.prototype) to.prototype[m] = from.prototype[m]; //NOTE: this is not right for node.js (need to link prototype chain as well)
//}

function isRect(thing)
{
    if (typeof thing != 'object') return false;
    return (typeof (thing.x != 'undefined') || (typeof thing.left != 'undefined')) && ((typeof thing.w != 'undefined') || (typeof thing.width != 'undefined'));
//    ? false: isdef(thing.x)
}

function toRGBA(r, g, b, a)
{
    return ((r & 0xFF) << 24) | ((g & 0xFF) << 16) | ((b & 0xFF) << 8) | (isdef(a)? a & 0xFF: 0xFF);
}

function fromRGBA(color)
{
    return {r: (color >> 24) & 0xFF, g: (color >> 16) & 0xFF, b: (color >> 8) & 0xFF, a: color & 0xFF};
}

function hex8(val)
{
    return ('00000000' + (val >>> 0).toString(16)).slice(-8);
}

//Model is the main "canvas" for writing effects to.
//For now, this is only 2D, but 3D-aware canvas is planned for future.
//Model is a wrapper around HTML5 Canvas, so all the HTML5 graphics functions and libraries can be used.
//Pixels on the canvas are then rendered by the protocol handler into control bytes to send to the hardware.
//Models can be nested or overlapped for composite or whole-house models, etc.
function Model2D(opts)
{
    if (!(this instanceof Model2D)) return makenew(Model2D, arguments);
    this.opts = (typeof opts == 'string')? {id: opts}: opts || {}; //expose to subclasses
    var hasdom = this.opts.id && (typeof document != 'undefined') && !this.parent;
    this.aaa = (Model2D.all || []).length; //make debug easier

    var m_canvas, m_ctx;
    if (hasdom) m_canvas = document.getElementById(this.opts.id); //link to browser DOM if present
    this.width = this.opts.w || this.opts.width || (m_canvas || {}).width || (this.prior_sibling || {}).width || 1; //allow initial size to be set (optional); alloc at least one pixel
    this.height = this.opts.h || this.opts.height || (m_canvas || {}).height || (this.prior_sibling || {}).height || 1;
    this.left = isdef(this.opts.x)? this.opts.x: isdef(this.opts.left)? this.opts.left: (this.prior_sibling || {}).right || 0;
    this.bottom = isdef(this.opts.y)? this.opts.y: isdef(this.opts.bottom)? this.opts.bottom: (this.prior_sibling || {}).bottom || 0;
    this.right = this.width + this.left;
    this.top = this.height + this.bottom; //CAUTION: inverted

    Object.defineProperties(this, //lazy instantiation, don't allow caller to change (property default is read-only)
    {
        canvas: { get: function() { if (this.parent) return this.parent.canvas; if (!m_canvas) { console.log("alloc %s x %s", this.width, this.height); m_canvas = new Canvas(this.width, this.height); } return m_canvas; }, enumerable: true},
        ctx: { get: function() { if (this.parent) return this.parent.ctx; if (!m_ctx) m_ctx = this.canvas.getContext('2d'); return m_ctx; }, enumerable: true},
        has_ctx: { get: function() { return this.parent? this.parent.has_ctx: m_ctx; }, enumerable: true},
    });
    this.drop = function(force) { m_ctx = null; if (!hasdom || force) m_canvas = null; return this; } //force Canvas re-create/resize; fluent
    this.T2B = function(y) { return this.height - y - 1; } //CAUTION: canvas y coordinate is inverted; this puts origin in lower left corner
    this.imgdata = function(x, y, w, h, data) //CAUTION: pixels are top-to-bottom (y coord is reversed)
    {
        switch (arguments.length) //shuffle optional params
        {
            case 1: if (!isRect(x)) { data = x; x = undefined; }; break;
            case 2: data = y; y = undefined; break;
        }
        if (isRect(x)) { h = x.h || x.height; w = x.w || x.width; y = x.y || x.bottom; x = x.x || x.left; } //unpack params
        if (!isdef(x)) x = this.left;
        if (!isdef(y)) y = this.bottom;
        if (!isdef(w)) w = this.width;
        if (!isdef(h)) h = this.height;
        if (this.parent) { x += this.parent.left; y += this.parent.bottom; }
//        x = Math.max(0, Math.min(this.width - 1, x)); //CAUTION: getImageData will throw exception if x, y out of range
//        y = Math.max(0, Math.min(this.height - 1, y));
//        w = Math.max(0, Math.min(this.width - x - 1, w));
//        h = Math.max(0, Math.min(this.height - y - 1, h));
        if (typeof data == 'undefined')
        {
            var retval = this.has_ctx? this.ctx.getImageData(x, y, w, h): null;
//            var uint32view = new Uint32Array(retval.data);
//            console.log("u8 len %s, u32 len %s", retval.data.length, uint32view.length);
            if (retval) retval.inspect = function(depth, opts)
            {
                var buf = '';
                for (var ofs = 0, limit = /*retval*/ this.data.length /*numch*/; ofs < limit; ofs += 4)
                {
                    if (ofs >= buffer.INSPECT_MAX_BYTES) { buf += ' ... ' + (limit - ofs) / 4 + ' '; break; }
                    buf += ' ' + hex8(toRGBA(/*retval*/ this.data[ofs], /*retval*/ this.data[ofs + 1], /*retval*/ this.data[ofs + 2], /*retval*/ this.data[ofs + 3])); //uint32view[ofs]); //retval.data.readUInt32BE(ofs));
                }
                return '<RGBA-buf:' + (limit / 4) + ' ' + buf + '>';
            }
//            console.log("imgdata(%s, %s, %s, %s), parent? %s :", x, y, w, h, !!this.parent, retval);
            return retval;
        }
//        console.log("put img", w || this.width || 1, h || this.height || 1, data);
        if (data) this.ctx.putImageData(data, x, y, x, y, w, h);
        return this; //fluent
    }
//    var m_pixelbuf;
    this.pixel = function(x, y, color)
    {
        if (this.parent) { x += this.parent.left; y += this.parent.bottom; }
        if (!isdef(color))
        {
            var retval = this.has_ctx? this.ctx.getImageData(x, this.T2B(y), 1, 1): null;
            if (retval) retval = toRGBA(retval.data[0], retval.data[1], retval.data[2], retval.data[3]);
            return retval;
        }
        color = fromRGBA(color);
        if (!this.pixelbuf) this.pixelbuf = this.ctx.createImageData(1, 1);
//        var imgdata = {data: new Uint8ClampedArray([color.r, color.g, color.b, color.a])};
        this.pixelbuf.data[0] = color.r; this.pixelbuf.data[1] = color.g; this.pixelbuf.data[2] = color.b; this.pixelbuf.data[3] = color.a;
        this.ctx.putImageData(this.pixelbuf, x, this.T2B(y)); //, x, this.T2B(y), 1, 1);
        return this; //fluent
    }

//    var m_parent = this; //preserve "this" for nested ctor
    this.Model2D = Model2D.prototype.SubModel2D.bind(null, this);
//    {
//        if (this instanceof Model2D) //called without "new"
//    if (!(this instanceof Model2D.prototype.SubModel2D)) return makenew(Model2D.prototype.SubModel2D, arguments);
//    }

    if (!Model2D.all) Model2D.all = [];
    /*else*/ Model2D.all.push(this); //allow iteration thru all instances; /*don't*/ include first (root) instance
//    console.log("model2d has fill?", this.fill? "Y": "N");
}

//sub-model ctor; adds parent/child links
Model2D.prototype.SubModel2D = function(opts)
{
    if (!(this instanceof Model2D.prototype.SubModel2D)) return makenew(Model2D.prototype.SubModel2D, arguments);
//        m_opts.parent = m_parent; arguments[0] = m_opts;
    var args = Array.from(arguments);
    this.parent = args.shift(); //m_parent;
    this.prior_sibling = this.parent.last_child; //|| {};
//        if (!m_parent.children) m_parent.children = [];
    Model2D.apply(this, args);
//        this.drop(true); //disconnect child from dom
//        m_parent.children.push(this);
    this.parent.last_child = this; //makes tiling easier
    this.parent.enlarge(this);
}
inherits(Model2D.prototype.SubModel2D, Model2D);


//NOTE: does not re-flow siblings
Model2D.prototype.enlarge = function(x, y, w, h)
{
//debugger;
    if (isRect(x)) { h = x.h || x.height; w = x.w || x.width; y = x.y || x.bottom; x = x.x || x.left; } //unpack params
    var svdata = this.imgdata(), savew = this.width, saveh = this.height; //0, 0, savew, saveh);
    this.width = Math.max(this.width, (x || 0) + (w || 1));
    this.height = Math.max(this.height, (y || 0) + (h || 1));
    this.right = Math.max(this.right, this.left + this.width);
    this.top = Math.max(this.top, this.bottom + this.height);
    console.log("Canvas: was (%d, %d) is now (%d, %d), realloc? %s", savew, saveh, this.width, this.height, this.has_ctx && (this.width * this.height != savew * saveh));
    if (this.has_ctx) //&& (this.width * this.height != savew * saveh)) //ignore shape-only change
    {
//        var data = this.imgdata(0, 0, savew, saveh);
//        console.log("img data before:", svdata);
        this.drop();
//        this.fill(0); //kludge: force pixels to instantiate
//        console.log("img data during:", data); //this.imgdata());
        this.imgdata(0, 0, savew, saveh, svdata); //preserve previous pixels
//        console.log("img data after:", this.imgdata()); //this.imgdata());
    }
//    else if (this.has_ctx) console.log("img data after:", this.imgdata());
    return this; //fluent
}

Model2D.prototype.save = function()
{
    this.ctx.save();
    return this; //fluent
}

Model2D.prototype.fillStyle = function(color)
{
    color = fromRGBA(color);
    color = this.ctx.fillStyle = sprintf("rgba(%d, %d, %d, %d)", color.r, color.g, color.b, color.a); //'#' + hex8(color);
//    console.log("fill style", this.ctx.fillStyle, color);
    return this; //fluent
}

Model2D.prototype.fill = function(x, y, w, h, color)
{
    switch (arguments.length) //shuffle optional params
    {
        case 1: if (!isRect(x)) { color = x; x = undefined; }; break;
        case 2: color = y; y = undefined; break;
    }
    if (isRect(x)) { h = x.h || x.height; w = x.w || x.width; y = x.y || x.bottom; x = x.x || x.left; } //unpack params
    if (!isdef(x)) x = this.left;
    if (!isdef(y)) y = this.bottom;
    if (!isdef(w)) w = this.width;
    if (!isdef(h)) h = this.height;
    if (isdef(color)) this.save().fillStyle(color);
    if (this.parent) { x += this.parent.left; y += this.parent.bottom; }
    console.log("fill rect(%s, %s) at (%s, %s, %s, %s) with %s", this.width, this.height, x, y, w, h, hex8(color));
    this.ctx.fillRect(x, y, w, h);
    if (isdef(color)) this.restore();
    return this; //fluent
}

Model2D.prototype.restore = function()
{
    this.ctx.restore();
    return this; //fluent
}

//Model2D.prototype.fill = function(color)
//{
//    return this.fillRect(this.x, this.y, this.width, this.height, color)
//        .save()
//        .fillStyle(color)
//        .fillRect(this.x, this.y, this.width, this.height, color)
//        .restore(); //fluent
//}


/*
function GrowableCanvas2D(opts)
{
    if (!(this instanceof GrowableCanvas2D)) return makenew(GrowableCanvas2D, arguments);
//    console.log("growable-1 has fill?", this.fill? "Y": "N", "has enlarge?", this.enlarge? "Y": "N");
//    this.__proto__ = Model2D.prototype; //kludge: bypass Model2D instanceof check
//    console.log("growable-2 has fill?", this.fill? "Y": "N", "has enlarge?", this.enlarge? "Y": "N");
    Model2D.apply(this, arguments);
//    this.__proto__ = GrowableCanvas2D.prototype;
//    console.log("growable-3 has fill?", this.fill? "Y": "N", "has enlarge?", this.enlarge? "Y": "N");
    var m_canvas, m_ctx;
    opts = (typeof opts === 'string')? {id: opts}: opts || {};
    if (opts.id) m_canvas = (typeof document != 'undefined')? document.getElementById(opts.id): null
    this.width = isdef(opts.w)? opts.w: isdef(opts.width)? opts.width: (m_canvas || {}).width || 0;
    this.height = isdef(opts.h)? opts.h: isdef(opts.height)? opts.height: (m_canvas || {}).height || 0;
}
inherits(GrowableCanvas2D, Model2D);

GrowableCanvas2D.prototype.enlarge = function(x, y, w, h)
{
    if (arguments.length < 2) { h = x.h || x.height || 1; w = x.w || x.width || 1; y = x.y || x.bottom || 0; x = x.x || x.left || 0; } //unpack params
    var savew = this.width, saveh = this.height;
    this.width = Math.max(this.width, x + w);
    this.height = Math.max(this.height, y + h);
    if (this.has_ctx && ((this.width != savew) || (this.height != saveh)))
    {
//        console.log("Canvas: enlarged from (%d, %d) to (%d, %d)", savew, saveh, this.width, this.height);
        var data = this.imgdata(0, 0, savew, saveh);
        this.drop();
        this.imgdata(0, 0, savew, saveh, data); //left, top, width, height);
    }
//    else console.log("Canvas: now (%d, %d)", this.width, this.height);
    return this; //fluent
}
*/


/*
//sub-model:
Model2D.prototype.Model2D = function(opts)
{
//no; need "this" to point to parent;    if (!(this instanceof Model2D.Rect)) return makenew(Model2D.Rect, arguments);
    if (!this.prior) this.prior = {};
//    opts = (typeof opts === 'string')? {name: opts}: opts || {};
    var newopts = {};
    newopts.parent = this;
    newopts.w = opts.w || opts.width || this.prior.w || 1;
    newopts.h = opts.h || opts.height || this.prior.h || 1;
    newopts.x = isdef(opts.x)? opts.x: isdef(opts.left)? opts.left: (this.prior.x || 0) + (this.prior.w || 1);
    newopts.y = isdef(opts.y)? opts.y: isdef(opts.bottom)? opts.bottom: (this.prior.y || 0) + (this.prior.h || 1);
//    console.log("rect has fill?", this.fill? "Y": "N");
//    this.__proto__ = Model2D.prototype; //kludge: bypass Model2D instanceof check
//    Model2D.apply(this, arguments);
    var retval = new Model2D(newopts);
//    this.__proto__ = Model2D.Rect.prototype;
//    console.log("rect has fill?", this.fill? "Y": "N");
    this.prior = retval; //make tiling easier
    return retval;
}
//inherits(Model2D.Rect, Model2D);
*/


debugger;
//var canvas = new GrowableCanvas2D('tutorial'); //document.getElementById('tutorial');
//var mod1 = new Model2D.Rect({x: 0, y: 0, w: 3, h: 10, parent: canvas}).fill(0xff0000ff);
//var mod2 = new Model2D.Rect({y: 0, parent: canvas}).fill(0x00ff00ff);
//var mod3 = new Model2D.Rect({w: 4, y: 0, parent: canvas}).fill(0x0000ffff);
//var mod4 = new Model2D.Rect({x: 10, parent: canvas}).fill(0xc86432ff);

var canvas = new Model2D('tutorial').fill(toRGBA(11, 22, 33));
//    console.log("canvas:", canvas.has_ctx? canvas.imgdata(): null);
//    console.log("pixel[0,0]:", JSON.stringify(canvas.pixel(0, 0)));
//    canvas.fill(toRGBA(11, 22, 33));
//    console.log("canvas:", canvas.has_ctx? canvas.imgdata(): null);
//    console.log("pixel[0,0]:", canvas.pixel(0, 0));
//canvas.pixel(0, 0, toRGBA(1, 2, 3));
    console.log("canvas:", canvas.imgdata());
    console.log();
var mod1 = new canvas.Model2D({x: 0, y: 0, w: 3, h: 10}).fill(toRGBA(255, 1, 2));
    console.log("model 1:", canvas.imgdata());
var mod2 = new canvas.Model2D({y: 0}).fill(toRGBA(3, 255, 4));
    console.log("model 2:", canvas.imgdata());
var mod3 = new canvas.Model2D({w: 4, y: 0}).fill(toRGBA(5, 6, 255));
    console.log("model 3:", canvas.imgdata());
var mod4 = new canvas.Model2D({x: 8, y: 2}).fill(toRGBA(0xc8, 0x64, 0x32));
    console.log("model 4:", canvas.imgdata());

//canvas.fill(toRGBA(252, 253, 254, 255));
//console.log("canvas", canvas);
//console.log("model4", mod4);
Model2D.all.forEach(function(model, inx)
{
    console.log("model[%s]: (%s..%s, %s..%s) %s x %s, data", inx, model.left, model.right, model.bottom, model.top, model.width, model.height, model.imgdata());
});


//     ctx.strokeStyle = "rgb(200, 100, 50)";
//    ctx.moveTo(0, 0);
//    ctx.lineTo(0, 100);
//    ctx.stroke();
//    ctx.fillStyle = "rgb(200, 100, 50)";
//    ctx.clearRect(50, 50, 100, 100);

//var myImageData = ctx.createImageData(10, 10); //w, h
//var myImageData = ctx.getImageData(0, 0, 10, 10); //left, top, width, height);
//var buf = myImageData.data; //Uint8ClampedArray of RGBA values
//console.log("w %d, h %d, len %d:", myImageData.width, myImageData.height, buf.length, buf);

//eof
