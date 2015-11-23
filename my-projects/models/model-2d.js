
'use strict';

//var empty = require('my-projects/playlists/empty');
//var Canvas = require('my-projects/models/growable-canvas');
var Canvas = require('canvas'); //https://www.npmjs.com/package/canvas
var makenew = require('my-plugins/utils/makenew');
var inherits = require('inherits');
require('sprintf.js');
var buffer = require('buffer');
buffer.INSPECT_MAX_BYTES = 800;

/*
var mm_canvas = new Canvas(1, 1);
var mm_ctx = mm_canvas.getContext('2d');
var data = mm_ctx.getImageData(0, 0, 10, 10);
console.log("data", data);
process.exit(0);
*/

//if (!console.clear) console.clear = function() {};
//console.clear();
//        if (canvas.getContext){
//    var ctx = canvas.getContext('2d');


// var Canvas = require('canvas'); //https://www.npmjs.com/package/canvas
//var Image = canvas.Image;


//function makenew(type, args)
//{
//    return new (type.bind.apply(type, [null].concat(Array.prototype.slice.call(args))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
//}

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

var rgba_split = new Buffer([255, 255, 255, 255]);


module.exports = Model2D;


//Model is the main "canvas" for writing effects to.
//For now, this is only 2D, but 3D-aware canvas is planned for future.
//Model is a wrapper around HTML5 Canvas, so all the HTML5 graphics functions and libraries can be used.
//Pixels on the canvas are then rendered by the protocol handler into control bytes to send to the hardware.
//Models can be nested or overlapped for composite or whole-house models, etc.
function Model2D(opts)
{
    if (!(this instanceof Model2D)) return makenew(Model2D, arguments);
    this.opts = (typeof opts == 'string')? {id: opts}: opts || {}; //give subclasses access to unknown params
    if (!Model2D.all) Model2D.all = [];
    /*else*/ Model2D.all.push(this); //allow iteration thru all instances; /*don't*/ include first (root) instance
//    this.aaa = 'inst#' + Model2D.all.length; //make debug easier
    this.name = this.opts.id || this.opts.name || '(inst#' + Model2D.all.length + ')';

//set up size + position first (no re-flow):
    var hasdom = !this.parent && this.opts.id && (typeof document != 'undefined'); //only link top-level canvas to DOM
    var m_canvas = hasdom? document.getElementById(this.opts.id): null; //link to browser DOM if present
//NOTE: no need to truncate left/bottom/right/top/width/height; parent will be enlarged to hold child
    this.width = this.opts.w || this.opts.width || (m_canvas || {}).width || (this.prior_sibling || {}).width || 1; //allow initial size to be set (optional); alloc at least one pixel
    this.height = this.opts.h || this.opts.height || (m_canvas || {}).height || (this.prior_sibling || {}).height || 1;
    this.left = isdef(this.opts.x)? this.opts.x: isdef(this.opts.left)? this.opts.left: (this.prior_sibling || {}).right || 0;
    this.bottom = isdef(this.opts.y)? this.opts.y: isdef(this.opts.bottom)? this.opts.bottom: (this.prior_sibling || {}).bottom || 0;
    this.right = this.left + this.width;
    this.top = this.bottom + this.height; //CAUTION: y coordinate is inverted; try to turn it right side here (origin is lower left corner)

//canvas access:
//lazy instantiation, don't allow caller to change (property default is read-only)
    var m_ctx, m_pixelbuf, m_dirty = true; //mark dirty to trigger first render
    Object.defineProperties(this,
    {
        canvas: this.parent? //delegate to top-level model to minimize contexts; unwind parent nesting at ctor time instead of run-time
            Object.getOwnPropertyDescriptor(this.parent, 'canvas'):
            {
                get()
                {
//                    if (this.parent) return this.parent.canvas;
                    if (!m_canvas) { console.log("alloc '%s' %s x %s", this.name, this.width, this.height); m_canvas = new Canvas(this.width, this.height); }
                    return m_canvas;
                },
                set(newval)
                {
                    if (newval) throw "Don't set canvas manually.  Let Model do it.";
                    if (!hasdom /*|| force*/) m_canvas = newval; //null; //force Canvas re-create/resize next time
                    m_pixelbuf = null;
                    m_ctx = null;
                },
                enumerable: true,
            },
        ctx: this.parent?
            Object.getOwnPropertyDescriptor(this.parent, 'ctx'):
            {
                get()
                {
//                    if (this.parent) return this.parent.ctx;
                    if (!m_ctx) m_ctx = this.canvas.getContext('2d');
                    return m_ctx;
                },
                set(newval)
                {
                    if (newval) throw "Don't set context manually.  Let Model do it.";
                    m_ctx = newval; //null; //leave canvas intact
                    m_pixelbuf = null;
                },
                enumerable: true,
            },
        has_ctx: this.parent?
            Object.getOwnPropertyDescriptor(this.parent, 'has_ctx'):
            {
                get() { return /*this.parent? this.parent.has_ctx:*/ m_ctx; },
                enumerable: true,
            },
        pixelbuf: this.parent?
            Object.getOwnPropertyDescriptor(this.parent, 'pixelbuf'):
            {
                get()
                {
//                    if (this.parent) return this.parent.pixelbuf;
                    if (!m_pixelbuf) m_pixelbuf = this.ctx.createImageData(1, 1);
                    return m_pixelbuf;
                },
                set(newval)
                {
//                    if (newval) throw "Don't set context manually.  Let Model do it.";
                    m_pixelbuf = newval; //null;
                },
                enumerable: true,
            },
        dirty:
        {
            get() { return m_dirty || (this.parent && this.parent.dirty); }, //child dirty if parent is dirty
            set(newval) { m_dirty = newval; if (newval && this.parent) this.parent.dirty = true; }, //child makes parent dirty but not un-dirty
            enumerable: true,
        },
    });
//    this.drop = this.parent? this.parent.drop: function(force) { m_ctx = null; if (!hasdom || force) m_canvas = null; return this; } //force Canvas re-create/resize; fluent
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
        if (!isdef(w)) w = this.width - x;
        if (!isdef(h)) h = this.height - y;
        if (this.parent) { x += this.parent.left; y += this.parent.bottom; } //TODO: check if this is in the right place
//TODO: clip?
//        x = Math.max(0, Math.min(this.width - 1, x)); //CAUTION: getImageData will throw exception if x, y out of range
//        y = Math.max(0, Math.min(this.height - 1, y));
//        w = Math.max(0, Math.min(this.width - x - 1, w));
//        h = Math.max(0, Math.min(this.height - y - 1, h));
        if (typeof data == 'undefined') //get
        {
            var retval = this.has_ctx? this.ctx.getImageData(x, y, w, h): null;
//            var uint32view = new Uint32Array(retval.data);
//            console.log("u8 len %s, u32 len %s", retval.data.length, uint32view.length);
            if (retval) retval.inspect = function(depth, opts) //make debug easier
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
        if (data) { this.ctx.putImageData(data, x, y, x, y, w, h); this.dirty = true; }
        return this; //fluent
    }

//node/pixel access:
    if (this.opts.order) (this.opts.order.bind(this))(); //call(this); //generate ordered node list
    if (this.opts.order && !(this.nodelist || []).length) throw "Model '" + this.name + "' no nodelist generated";
//    console.log("model '%s': node order? %s, #nodes %s", this.name, !!this.opts.order, this.nodelist? this.nodelist.length: '-');
//    var m_pixelbuf;
    this.pixel = function(x, y, color)
    {
        if (this.parent) { x += this.parent.left; y += this.parent.bottom; } //TODO: should this be here?
        if (!isdef(color)) //get
        {
            var retval = this.has_ctx? this.ctx.getImageData(x, this.T2B(y), 1, 1): null;
            if (retval) retval = toRGBA(retval.data[0], retval.data[1], retval.data[2], retval.data[3]);
            return retval;
        }
        color = fromRGBA(color);
//        if (!this.pixelbuf) this.pixelbuf = this.ctx.createImageData(1, 1);
//        var imgdata = {data: new Uint8ClampedArray([color.r, color.g, color.b, color.a])};
        this.pixelbuf.data[0] = color.r; this.pixelbuf.data[1] = color.g; this.pixelbuf.data[2] = color.b; this.pixelbuf.data[3] = color.a;
        this.ctx.putImageData(this.pixelbuf, x, this.T2B(y)); //, x, this.T2B(y), 1, 1);
        return this; //fluent
    }
//    if (this.opts.output)
    if (!(this.renderNode = Model2D.prototype['renderNode_' + (this.opts.output || 'RGB')])) //set once based on node output type
        throw "Unhandled node output type: '" + (this.opts.output || 'RGB') + "'";

//link to port:
//tells protocol handler to allocate resources
    var m_port;
    Object.defineProperty(this, 'port',
    {
        get() { return m_port; },
        set(newval) { if (m_port = newval) m_port.assign(this); },
        enumerable: true,
    });
    if (this.opts.port) this.port = this.opts.port;

//    var m_parent = this; //preserve "this" for nested ctor
    this.Model2D = Model2D.prototype.SubModel2D.bind(null, this); //pass "this" as first param for parent/child linkage

    this.clear();
}
//Model2D.all = [];

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
    if (this.parent) throw "Don't resize non-top model '" + this.name + "'";
    if (isRect(x)) { h = x.h || x.height; w = x.w || x.width; y = x.y || x.bottom; x = x.x || x.left; } //unpack params
    var svdata = this.imgdata(), savew = this.width, saveh = this.height; //0, 0, savew, saveh);
    this.width = Math.max(this.width, (x || 0) + (w || 1));
    this.height = Math.max(this.height, (y || 0) + (h || 1));
    this.right = Math.max(this.right, this.left + this.width);
    this.top = Math.max(this.top, this.bottom + this.height);
    console.log("Canvas '%s': was (%d, %d) is now (%d, %d), realloc? %s", this.name, savew, saveh, this.width, this.height, this.has_ctx && (this.width * this.height != savew * saveh));
/*NO; resize only occurs during initial construction, and there's no image to preserve at that time so skip this
    if (this.has_ctx) //&& (this.width * this.height != savew * saveh)) //ignore shape-only change
    {
//        var data = this.imgdata(0, 0, savew, saveh);
//        console.log("img data before:", svdata);
        this.drop();
//        this.fill(0); //kludge: force pixels to instantiate
//        console.log("img data during:", data); //this.imgdata());
        this.imgdata(0, 0, savew, saveh, svdata); //preserve previous pixels; must pass rect size here
//        console.log("img data after:", this.imgdata()); //this.imgdata());
    }
//    else if (this.has_ctx) console.log("img data after:", this.imgdata());
*/
    this.canvas = null; //force canvas re-create in case it was already created
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
//    console.log("fill style '%s'", this.name, this.ctx.fillStyle, color);
    return this; //fluent
}


//set to initial color:
Model2D.prototype.clear = function()
{
    if (this.opts.zinit !== false)
        this.fill((this.opts.zinit !== true)? this.opts.zinit: 0); //init xparent black if caller didn't pass a color
//    console.log("model2d has fill?", this.fill? "Y": "N");
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
    if (this.parent) { x += this.parent.left; y += this.parent.bottom; }
//        x = Math.max(0, Math.min(this.width - 1, x)); //CAUTION: getImageData will throw exception if x, y out of range
//        y = Math.max(0, Math.min(this.height - 1, y));
//        w = Math.max(0, Math.min(this.width - x - 1, w));
//        h = Math.max(0, Math.min(this.height - y - 1, h));
    console.log("fill '%s' rect %s x %s at (%s..%s, %s..%s) with %s", this.name, this.width, this.height, x, x + w, y, y + h, hex8(color));
    if (isdef(color)) this.save().fillStyle(color);
    this.ctx.fillRect(x, y, w, h);
    if (isdef(color)) this.restore();
    this.dirty = true;
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


//node ordering:

Model2D.prototype.R2L = function(x) { return this.width - x - 1; }

Model2D.prototype.T2B = function(y) { return this.height - y - 1; } //CAUTION: canvas y coordinate is inverted; this puts origin in lower left corner

//NOTE: pixelXY must be defined on prototype, not within ctor (because L/R, T/B node list generators are passed into ctor)
Model2D.prototype.pixelXY = function(x, y) //map relative (X, Y) to my local imgData offset
{
    return ((x >= this.left) && (x < this.right) && (y >= this.bottom) && (y < this.top))? 4 * (this.width * this.T2B(y - this.bottom) + x - this.left): -1;
}

//provide generic variations here
Model2D.prototype.L2R_T2B = function() //rectx, recty, rectw, recth)
{
//    if (isRect(rectx)) { recth = x.h || x.height; rectw = x.w || x.width; recty = x.y || x.bottom; rectx = x.x || x.left; } //unpack params
//    if (!isdef(rectx)) rectx = this.left;
//    if (!isdef(recty)) recty = this.bottom;
//    if (!isdef(rectw)) rectw = this.width;
//    if (!isdef(recth)) recth = this.height;
//    if (this.parent) { rectx += this.parent.left; recty += this.parent.bottom; }
//        x = Math.max(0, Math.min(this.width - 1, x)); //CAUTION: getImageData will throw exception if x, y out of range
//        y = Math.max(0, Math.min(this.height - 1, y));
//        w = Math.max(0, Math.min(this.width - x - 1, w));
//        h = Math.max(0, Math.min(this.height - y - 1, h));
//    switch (Math.sign((this.nodelist || []).length - w * h))
//    {
//        case -1: this.nodelist = new Array(w * h); break;
//        case +1: this.outbuf = this.outbuf.slice(0, w * h); break;
//    }
//    for (var x = rectx; x < rectx + rectw; ++x) //L->R
//        for (var y = recty + recth - 1; y >= recty; --y) //T->B
    this.nodelist = []; //new Array(w * h);
    for (var x = this.left; x < this.right; ++x) //L->R
        for (var y = this.top - 1; y >= this.bottom; --y) //T->B
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.R2L_T2B = function()
{
    this.nodelist = []; //new Array(w * h);
    for (var x = this.right - 1; x >= this.left; --x) //R->L
        for (var y = this.top - 1; y >= this.bottom; --y) //T->B
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.L2R_B2T = function()
{
    this.nodelist = []; //new Array(w * h);
    for (var x = this.left; x < this.right; ++x) //L->R
        for (var y = this.bottom; y < this.top; ++y) //B->T
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.R2L_B2T = function()
{
    this.nodelist = []; //new Array(w * h);
    for (var x = this.right - 1; x >= this.left; --x) //R->L
        for (var y = this.bottom; y < this.top; ++y) //B->T
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.T2B_L2R = function()
{
    this.nodelist = []; //new Array(w * h);
    for (var y = this.top - 1; y >= this.bottom; --y) //T->B
        for (var x = this.left; x < this.right; ++x) //L->R
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.T2B_R2L = function()
{
    this.nodelist = []; //new Array(w * h);
    for (var y = this.top - 1; y >= this.bottom; --y) //T->B
        for (var x = this.right - 1; x >= this.left; --x) //R->L
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.B2T_L2R = function()
{
    this.nodelist = []; //new Array(w * h);
    for (var y = this.bottom; y < this.top; ++y) //B->T
        for (var x = this.left; x < this.right; ++x) //L->R
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.B2T_R2L = function()
{
    this.nodelist = []; //new Array(w * h);
    for (var y = this.bottom; y < this.top; ++y) //B->T
        for (var x = this.right - 1; x >= this.left; --x) //R->L
            this.nodelist.push(this.pixelXY(x, y));
}

/*
//TODO: generalize?
Model2D.prototype.XYList = function(x_ranges, y_ranges)
{
    this.nodelist = []; //new Array(w * h);
    (x_ranges || [[this.left, this.right]]).forEach(function(xrange)
    {
//        switch (Math.sign(range[0] - range[1]))
        for (var x = xrange[0]; x < xrange[1]; ++x)
            (y_ranges || [[this.bottom, this.top]]).forEach(function(yrange)
            {
                for (var y = yrange[0]; y < yrange[1]; ++y)
                    this.nodelist.push(this.pixelXY(x, y));
                for (var y = yrange[0]; y > yrange[1]; --y)
                    this.nodelist.push(this.pixelXY(x, y - 1));
            });
        for (var x = range[0]; x > range[1]; --x)
            for (var y = this.bottom; y < this.top; ++y) //B->T
                this.nodelist.push(this.pixelXY(x - 1, y));
        }
    }.bind(this));
}
*/


//rendering:
Model2D.prototype.buf_resize = function(bufname, needlen)
{
    switch (Math.sign((this[bufname] || []).length - needlen))
    {
        case -1: this[bufname] = new Buffer(needlen); break;
        case +1: this[bufname] = this[bufname].slice(0, needlen); break;
    }
    return this[bufname];
}


Model2D.prototype.renderNode_RGBA = function(pxbuf, pxofs)
{
    this.outbuf.writeUInt32BE(pxbuf.readUInt32BE(pxofs)); //RGBA
//    rgba_split[0] = pxbuf[pxofs + 0]; //R
//    rgba_split[1] = pxbuf[pxofs + 1]; //G
//    rgba_split[2] = pxbuf[pxofs + 2]; //B
//    rgba_split[3] = pxbuf[pxofs + 3]; //A
//    this.outbuf.write(rgba_split.readUInt32BE(0), 4); //RGBA
}

Model2D.prototype.renderNode_RGB = function(pxbuf, pxofs)
{
    rgba_split[0] = pxbuf[pxofs + 0]; //R
    rgba_split[1] = pxbuf[pxofs + 1]; //G
    rgba_split[2] = pxbuf[pxofs + 2]; //B
    this.outbuf.write(rgba_split.readUInt32BE(0), 3); //RGB
//    this.outbuf[inx + 0] = pixels[pxofs + 0]; //R
//    this.outbuf[inx + 1] = pixels[pxofs + 1]; //G
//    this.outbuf[inx + 2] = pixels[pxofs + 2]; //B
}

Model2D.prototype.renderNode_GRB = function(pxbuf, pxofs)
{
    rgba_split[1] = pxbuf[pxofs + 0]; //R; R<->G on some WS281X strips
    rgba_split[0] = pxbuf[pxofs + 1]; //G
    rgba_split[2] = pxbuf[pxofs + 2]; //B
    this.outbuf.write(rgba_split.readUInt32BE(0), 3); //GRB
}

Model2D.prototype.render = function(frnext)
{
    console.log("model render: dirty? %s, port? %s, renderNode %s", this.dirty, !!this.port); //, this.renderNode);
    if (this.dirty && this.port) //if not dirty or no port, there's no need to render
    {
        if (!this.renderNode) throw "Unhandled node output type: '" + (this.opts.output || '(none)') + "'";
        var imgdata = this.imgdata();
        var pxbuf = imgdata? new Uint32Array(imgdata.data.buffer, 0, UInt32Array.BYTES_PER_ELEMENT): null;
        if (pxbuf)
            (this.nodelist || []).forEach(function(pxofs, inx)
            {
//            pxofs *= 4; inx *= 4; //RGBA 4 bytes/node
//            this.outbuf[inx + 0] = pixels[pxofs + 0]; //R
//            this.outbuf[inx + 1] = pixels[pxofs + 1]; //G
//            this.outbuf[inx + 2] = pixels[pxofs + 2]; //B
//            this.outbuf[inx + 3] = pixels[pxofs + 3]; //A
//            this.outbuf.writeUInt32BE(pxbuf.readUInt32(pxofs)); //RGBA
                this.renderNode(pxbuf, pxofs);
            }.bind(this));
    }
    this.dirty = false;
    return this.fx? frnext + 50: false; //TODO: generate frnext based on running fx; no next frame scheduled
}


/*
Model2D.prototype.rgbRender = function(force)
{
    if (!this.dirty && !force) return this;
    if (!(this.nodelist || []).length) return this;
    var pixels = this.imgdata().data;
    this.buf_resize('outbuf', 3 * this.nodelist.length);
    this.nodelist.forEach(function(pxofs, inx)
    {
        pxofs *= 4; inx *= 3; //raw RGB 3 bytes/node; drops alpha
        this.outbuf[inx + 0] = pixels[pxofs + 0]; //R
        this.outbuf[inx + 1] = pixels[pxofs + 1]; //G
        this.outbuf[inx + 2] = pixels[pxofs + 2]; //B
    }.bind(this));
    this.dirty = false;
    return this; //fluent
}
Model2D.prototype.rawRender = function(force)
{
    if (!this.dirty && !force) return null;
    if (!(this.nodelist || []).length) return this;
    var pixels = this.imgdata().data;
    this.buf_resize('outbuf', 4 * this.nodelist.length);
    this.nodelist.forEach(function(pxofs, inx)
    {
        pxofs *= 4; inx *= 4; //RGBA 4 bytes/node
        this.outbuf[inx + 0] = pixels[pxofs + 0]; //R
        this.outbuf[inx + 1] = pixels[pxofs + 1]; //G
        this.outbuf[inx + 2] = pixels[pxofs + 2]; //B
        this.outbuf[inx + 3] = pixels[pxofs + 3]; //A
    }.bind(this));
    this.dirty = false;
    return this; //fluent
}
*/


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


/*
function load_frame(filename)
{
    if (!filename) filename = path.join(__dirname, '/images/squid.png'); //demo image
    fs.readFile(filename, function(err, squid)
    {
        if (err) throw err;
        var img = new Image;
        img.src = squid;
        ctx.drawImage(img, 0, 0, img.width / 4, img.height / 4);
    });
}

function frame_data()
{
    return canvas.toBuffer();
}
*/


/*
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
*/

//eof
