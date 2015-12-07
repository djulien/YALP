
'use strict';

var fs = require('fs');
var glob = require('glob');
var path = require('path');
//var BISON = require('bison');
//var Concentrate = require('concentrate'); //https://github.com/deoxxa/concentrate
//var empty = require('my-projects/playlists/empty');
//var Canvas = require('my-projects/models/growable-canvas');
var Canvas = require('canvas'); //https://www.npmjs.com/package/canvas; needs cairo as well; see https://www.npmjs.com/package/canvas
var logger = require('my-plugins/utils/logger')();
var makenew = require('my-plugins/utils/makenew');
var MyFxMixin = require('my-projects/effects/myfx'); //not CAUTION: circular ref
require('my-plugins/my-extensions/object-enum');
var inherits = require('inherits');
//var Q = require('q'); //https://github.com/kriskowal/q
require('sprintf.js');
var int24 = require('int24');
var buffer = require('buffer');
extensions(); //hoist them up here

module.exports = Model2D;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// 2D model base class:
//

//Defines basic geometry and access to canvas/pixels

//Model is the main "canvas" for writing effects to.
//For now, this is only 2D, but 3D-aware canvas is planned for future.
//Model is a wrapper around HTML5 Canvas, so all the HTML5 graphics functions and libraries can be used.
//Pixels on the canvas are then rendered by the protocol handler into control bytes to send to the hardware.
//Models can be nested or overlapped for composite or whole-house models, etc.
//Any methods that do not require access to private data are put in prototype rather than object to reduce code space usage.
function Model2D(opts)
{
    if (!(this instanceof Model2D)) return makenew(Model2D, arguments);
    this.opts = (typeof opts == 'string')? {id: opts}: opts || {}; //give subclasses access to unknown params
//    this.aaa = 'inst#' + Model2D.all.length; //make debug easier
    this.name = this.opts.id || this.opts.name || '(inst#' + Model2D.all.length + ')';
//    if (!Model2D.all) Model2D.all = {};
    this.BecomeChild(this.opts.parent || Model2D.entire); //NOTE: need to do this before bounds checking below
    /*else*/ Model2D.all[this.name] = this; //.push(this); //allow iteration thru all instances; /*don't*/ include first (root) instance
//attach fx as namespace, call ctor to init mixin data:
    this.fx = MyFxMixin.prototype; //Object.assign({}, MyFxMixin.prototype); //add fx methods to this model; CAUTION: shared ref, so don't put instance data in there
    MyFxMixin.apply(this, arguments); //initialize fx by calling nested fx namespace ctor; CAUTION: do this after prototype so supporting methods are there

//set up size + position first (no re-flow):
//TODO: z-order? also, allow nested models? (> 1 level)
    var hasdom = !this.parent && this.opts.id && (typeof document != 'undefined'); //only link top-level canvas to DOM
    var m_canvas = hasdom? document.getElementById(this.opts.id): null; //link to browser DOM if present
//NOTE: no need to truncate left/bottom/right/top/width/height; parent will be enlarged to hold child
    this.width = this.opts.w || this.opts.width || (m_canvas || {}).width || (this.prior_sibling || {}).width || 1; //allow initial size to be set (optional); alloc at least one pixel
    this.height = this.opts.h || this.opts.height || (m_canvas || {}).height || (this.prior_sibling || {}).height || 1;
    this.left = isdef(this.opts.x)? this.opts.x: isdef(this.opts.left)? this.opts.left: (this.prior_sibling || {}).right || 0;
    this.bottom = isdef(this.opts.y)? this.opts.y: isdef(this.opts.bottom)? this.opts.bottom: (this.prior_sibling || {}).bottom || 0;
    this.right = this.left + this.width;
    this.top = this.bottom + this.height; //CAUTION: y coordinate is inverted; try to turn it right side here (origin is lower left corner)
    if (this.parent) this.parent.enlarge(this); //NOTE: need to do this after bounds checking above

//canvas access:
//canvas is shared, access is delegated thru parent
//lazy instantiation, don't allow caller to change (property default is read-only)
//    this.dirty = true; //mark dirty to trigger first render
    var m_ctx, m_dirty = true; //mark dirty to trigger first render
//    var m_promise = this.parent? null: Q.Promise(function(resolve, reject, notify)
//    {
//        this.canvas_ready = function(val) { resolve(val); }
////        this.error = function(val) { reject(val); }
//    }.bind(this));
//    var m_oninit = !this.parent? []: null;
    Object.defineProperties(this,
    {
        canvas: this.parent? //delegate to top-level model to minimize contexts; unwind parent nesting at ctor time instead of run-time
//broken            this.parent.canvas: //Object.getOwnPropertyDescriptor(this.parent, 'canvas'):
            { get() { return this.parent.canvas; }, set(newval) { this.parent.canvas = newval; }, enumerable: true, }:
            {
                get()
                {
//                    if (this.parent) return this.parent.canvas;
                    if (!m_canvas)
                    {
                        console.log("alloc '%s' %s x %s", this.name, this.width, this.height);
                        m_canvas = new Canvas(this.width, this.height);
//                        require('callsite')().forEach(function(stack, inx) { console.log("stack[%d]", inx, stack.getFunctionName() || '(anonymous)', require('my-plugins/utils/relpath')(stack.getFileName()) + ':' + stack.getLineNumber()); });
//                        this.clear(); //it's only safe to do this automatically when canvas is first created; caller can restore previous contents (during a resize) if desired
//                        this.canvas_ready(); //tell children to clear pixels
//                        m_oninit.forEach(function(init) { init(); }); //allow children to clear their pixels now
                        Model2D.all.forEach(function(child) { child.clear(); }); //do this when canvas is instantiated
                    }
                    return m_canvas;
                },
                set(newval)
                {
                    if (newval) throw "Don't set canvas manually.  Let Model do it."; //only let caller set it to null
//    this.drop = this.parent? this.parent.drop: function(force) { m_ctx = null; if (!hasdom || force) m_canvas = null; return this; } //force Canvas re-create/resize; fluent
                    if (!hasdom /*|| force*/) m_canvas = newval; //null; //force Canvas re-create/resize next time
//                    m_pixelbuf = null;
                    m_ctx = null;
                },
                enumerable: true,
            },
        ctx: this.parent?
//broken            this.parent.ctx: //Object.getOwnPropertyDescriptor(this.parent, 'ctx'):
            { get() { return this.parent.ctx; }, set(newval) { this.parent.ctx = newval; }, enumerable: true, }:
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
//                    m_pixelbuf = null;
                },
                enumerable: true,
            },
        has_ctx: this.parent?
//broken            this.parent.has_ctx: //Object.getOwnPropertyDescriptor(this.parent, 'has_ctx'):
            { get() { return this.parent.has_ctx; }, enumerable: true, }:
            {
                get() { return /*this.parent? this.parent.has_ctx:*/ !!m_ctx; },
                enumerable: true,
            },
//        oninit: this.parent?
//            { get() { return this.parent.oninit; }, enumerable: true, }:
//            { get() { return /*this.parent? this.parent.oninit:*/ m_oninit; }, enumerable: true, },
/*
        pixelbuf: this.parent? //holds one canvas pixel
//broken            this.parent.pixelbuf: //Object.getOwnPropertyDescriptor(this.parent, 'pixelbuf'):
            { get() { return this.parent.pixelbuf; }, set(newval) { this.parent.pixelbuf = newval; }, enumerable: true, }:
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
*/
        dirty:
        {
//TODO: hit/overlap test to reduce unnecessary re-rendering
            get() { return m_dirty; }, // || (this.parent && this.parent.dirty); }, //child dirty if parent is dirty
            set(newval)
            {
                m_dirty = newval;
//                if (newval && this.port) this.port.dirty = true;
                if (newval && this.parent) this.parent.dirty = true; //child makes parent dirty but not un-dirty
            },
            enumerable: true,
        },
    });

//link to port:
    var m_port;
    Object.defineProperty(this, 'port',
    {
        get() { return m_port; },
        set(newval) { if (m_port = newval) m_port.assign(this); }, //tells protocol handler to allocate resources
        enumerable: true,
    });

//finalize model setup:
    if (this.opts.port) this.port = this.opts.port;
//    var m_parent = this; //preserve "this" for nested ctor
//TODO?    this.Model2D = Model2D.prototype.SubModel2D.bind(null, this); //pass "this" as first param for parent/child linkage
    this.generateNodelist();
//defer    if (this.opts.zinit !== false) this.oninit.push(function() { this.clear(); }.bind(this)); //do this when canvas is instantiated
}

//shared class data:
Model2D.all = {}; //[];


//attach fx as namespace:
//Model2D.prototype.fx = MyFxMixin.prototype; //Object.assign({}, MyFxMixin.prototype);


//sub-model ctor; adds parent/child links
//called by child ctor to link with parent
Model2D.prototype.BecomeChild /*SubModel2D*/ = function(parent)
{
    if (!parent) return;
//    if (!(this instanceof Model2D.prototype.SubModel2D)) return makenew(Model2D.prototype.SubModel2D, arguments);
//        m_opts.parent = m_parent; arguments[0] = m_opts;
//    var args = Array.from(arguments);
    this.parent = parent; //args.shift(); //m_parent;
    this.prior_sibling = this.parent.last_child; //|| {};
//        if (!m_parent.children) m_parent.children = [];
//    Model2D.apply(this, args);
//        this.drop(true); //disconnect child from dom
//        m_parent.children.push(this);
    this.parent.last_child = this; //makes tiling easier
//    this.parent.enlarge(this);
}
//inherits(Model2D.prototype.SubModel2D, Model2D);


//NOTE: does not re-flow siblings
Model2D.prototype.enlarge = function(x, y, w, h)
{
//debugger;
    if (this.parent) throw "Don't resize non-top model '" + this.name + "'";
    if (isRect(x)) { h = x.h || x.height; w = x.w || x.width; y = x.y || x.bottom; x = x.x || x.left; } //unpack params
    var savew = this.width, saveh = this.height; //svdata = this.imgdata(), 0, 0, savew, saveh);
    this.width = Math.max(this.width, (x || 0) + (w || 1));
    this.height = Math.max(this.height, (y || 0) + (h || 1));
    this.right = Math.max(this.right, this.left + this.width);
    this.top = Math.max(this.top, this.bottom + this.height);
//    console.log("Canvas '%s': was (%d, %d) is now (%d, %d), realloc? %s", this.name, savew, saveh, this.width, this.height, this.has_ctx && (this.width * this.height != savew * saveh));
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


//graphics:
Model2D.prototype.imgdata = function(x, y, w, h, data) //CAUTION: pixels are top-to-bottom (y coord is reversed)
{
    switch (arguments.length) //shuffle optional params
    {
        case 1: if (!isRect(x)) { data = x; x = undefined; }; break;
        case 2: data = y; y = undefined; break;
    }
    if (isRect(x)) { h = x.h || x.height; w = x.w || x.width; y = x.y || x.bottom; x = x.x || x.left; } //unpack params
    if (!isdef(x)) x = this.left;
    if (!isdef(y)) y = this.bottom;
    if (!isdef(w)) w = this.width; //no- x;
    if (!isdef(h)) h = this.height; //no- y;
    if (this.parent) { x += this.parent.left; y += this.parent.bottom; } //TODO: check if this is in the right place
//TODO: clip?
//        x = Math.max(0, Math.min(this.width - 1, x)); //CAUTION: getImageData will throw exception if x, y out of range
//        y = Math.max(0, Math.min(this.height - 1, y));
//        w = Math.max(0, Math.min(this.width - x - 1, w));
//        h = Math.max(0, Math.min(this.height - y - 1, h));
    if (!isdef(data)) //get
    {
        var retval = /*this.has_ctx?*/ this.ctx.getImageData(x, y, w, h); //: null; //always get in; models might need initial values for first render
//            var uint32view = new Uint32Array(retval.data);
        console.log("imgdata get: x %s, y %s w %s h %s, parent (%s, %s), ctx? %s", x, y, w, h, (this.parent || {}).left, (this.parent || {}).bottom, !!this.has_ctx); //u8 len %s, u32 len %s", retval.data.length, uint32view.length);
        if (retval) retval.data.inspect = function(depth, opts) //make debug easier
        {
            var buf = '';
            for (var ofs = 0, limit = /*retval*/ this.data.length /*numch*/; ofs < limit; ofs += 4)
            {
                if (ofs >= buffer.INSPECT_MAX_BYTES) { buf += ' ... ' + (limit - ofs) / 4 + ' '; break; }
                buf += ' ' + hex8(this.data.readUInt32BE(ofs)); //toRGBA(/*retval*/ this.data[ofs], /*retval*/ this.data[ofs + 1], /*retval*/ this.data[ofs + 2], /*retval*/ this.data[ofs + 3])); //uint32view[ofs]); //retval.data.readUInt32BE(ofs));
            }
            return '<RGBA-buf:' + (limit / 4) + ' ' + buf + '>';
        }.bind(retval);
//            console.log("imgdata(%s, %s, %s, %s), parent? %s :", x, y, w, h, !!this.parent, retval);
        return retval;
    }
//        console.log("put img", w || this.width || 1, h || this.height || 1, data);
    if (data) { this.ctx.putImageData(data, x, y, x, y, w, h); this.dirty = true; }
    return this; //fluent
}

Model2D.prototype.save = function()
{
    this.ctx.save();
    return this; //fluent
}

var Color = require('tinycolor2'); //'onecolor');
var color_cache = require('my-projects/models/color-cache').cache;

Model2D.prototype.fillStyle = function(color)
{
//    color = fromRGBA(color);
//    color = Color({r: rgba_split[0], g: rgba_split[1], b: rgba_split[2], a: rgba_split[3]}); //color >> 24, g: color >> 16));
    var rgba = color_cache('=' + color, function() { return Color(color).toRgbString(); }); //allows CSS color formats
    this.ctx.fillStyle = rgba; //sprintf("rgba(%d, %d, %d, %d)", rgba.r, rgba.g, rgba.b, rgba.a); //'#' + hex8(color);
    console.log("fill style '%s'", this.name, this.ctx.fillStyle, color);
    return this; //fluent
}


//set to initial color:
Model2D.prototype.clear = function()
{
    if (this.opts.zinit !== false) //this.promise.then(function()
//    {
        this.fill((isdef(this.opts.zinit) && (this.opts.zinit !== true))? this.opts.zinit: 0); //init xparent black if caller didn't pass a color
//    }.bind(this));
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
    if (isdef(color)) this.save().fillStyle(color);
    console.log("fill '%s' rect %s x %s at (%s..%s, %s..%s) with %s", this.name, this.width, this.height, x, x + w, y, y + h, this.ctx.fillStyle); //hex8(color));
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
//generic ordering defined below.  caller can supply custom ordering.

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


//node/pixel access:

/*
Model2D.prototype.buf_resize = function(bufname, needlen, grouping)
{
    switch (Math.sign((this[bufname] || []).length - needlen))
    {
        case -1: this[bufname] = new Buffer(needlen); break;
        case +1: this[bufname] = this[bufname].slice(0, needlen); break;
    }
    if (isdef(grouping)) this[bufname].inspect = function(depth, opts) //make debug easier
    {
        var buf = '';
        for (var ofs = 0, limit = this.length, items = 0; ofs < limit; ofs += grouping, ++items)
        {
            if (ofs >= buffer.INSPECT_MAX_BYTES) { buf += ' ... ' + (limit - ofs) / grouping + ' '; break; }
            if (!(items % 16)) buf += " 'x" + ofs.toString(16) + " "; //show byte offset periodically
            switch (grouping)
            {
                case 3: buf += ' ' + hex6(this.readUInt24BE(ofs)); break;
                case 4: buf += ' ' + hex8(this.readUInt32BE(ofs)); break;
                default: throw "Unhandled chunk size: " + grouping;
            }
        }
        return '<Buffer ' + (limit / grouping) + 'x' + grouping + ': ' + buf + '>';
    }
    return this[bufname];
}
*/

//generate node list; controls mapping of canvas pixels to hardware nodes
//everything is a custom model
Model2D.prototype.generateNodelist = function()
{
    if (!this.opts.order) return;
    this.nodelist = [];
    (this.opts.order.bind(this))(); //call(this); //generate ordered node list
    if (!this.nodelist.length) throw "Model '" + this.name + "' no nodelist generated";
    this.setRenderType(this.opts.output);
    logger(30, "model '%s' generated %s nodes on %s x %s canvas, %s byte/node %s".blue, this.name, this.nodelist.length, this.width, this.height, this.bytesPerNode, this.opts.output || 'RGB'); //, this.outbuf.length);
}

Model2D.prototype.setRenderType = function(nodetype)
{
    ['renderNodes', 'bytesPerNode'].forEach(function(propname) //set up rendering info
    {
        if (!(this[propname] = Model2D.prototype[propname + '_' + (nodetype || 'RGB')])) //set once based on node output type
            throw "Unhandled node render type: '" + (nodetype || 'RGB') + "'";
    }.bind(this));
//    this.buf_resize('outbuf', this.bytesPerNode * this.nodelist.length, this.bytesPerNode); //CAUTION: same buffer is reused every time; use double-buffering if previous frame needs to remain available
//    logger(30, "model '%s' set outbuf size to %s w x %s h x bytes/node = %s (".blue, this.name, this.width, this.height, this.bytesPerNode, this.outbuf.length);
}

//var m_pixelbuf = new ImageData(1, 1); //no worky
Model2D.prototype.pixel = function(x, y, color)
{
//    var m_pixelbuf;
    if (this.parent) { x += this.parent.left; y += this.parent.bottom; } //TODO: should this be here?
    if (!isdef(color)) //get
    {
//TODO: cache pixel values
        var retval = this.has_ctx? this.ctx.getImageData(x, this.T2B(y), 1, 1): null; //avoid creating canvas when getting data
//        if (retval) retval = toRGBA(retval.data[0], retval.data[1], retval.data[2], retval.data[3]);
        if (retval) retval = retval.data.readUInt32BE(0); //want RGBA
        return retval;
    }
//    color = fromRGBA(color);
//        if (!this.pixelbuf) this.pixelbuf = this.ctx.createImageData(1, 1);
//        var imgdata = {data: new Uint8ClampedArray([color.r, color.g, color.b, color.a])};
//    this.pixelbuf.data[0] = color.r; this.pixelbuf.data[1] = color.g; this.pixelbuf.data[2] = color.b; this.pixelbuf.data[3] = color.a;
//    if (!Model2D.prototype.pixel.pixelbuf) Model2D.prototype.pixel.pixelbuf = this.ctx.getImageData(0, 0, 1, 1); //kludge: can't create buffer so get one from context
//    Model2D.prototype.pixel.pixelbuf.data.writeUInt32BE(rgba, 0);
//    this.ctx.putImageData(Model2D.prototype.pixel.pixelbuf, x, this.T2B(y)); //, x, this.T2B(y), 1, 1);
    if (isdef(color)) this.save().fillStyle(color);
    console.log("set '%s' pixel (%s, %s) to color %s", this.name, x, y, this.ctx.fillStyle); //hex8(color));
    this.ctx.fillRect(x, this.T2B(y), 1, 1);
    if (isdef(color)) this.restore();
    return this; //fluent
}


//rendering:

Model2D.prototype.bytesPerNode_raw = 4;
//Model2D.prototype.renderNode_raw = function(outofs, pxbuf, pxofs)
//{
//    this.port.outbuf.writeUInt32BE((pxofs !== null)? pxbuf.readUInt32BE(pxofs): 0, outofs); //RGBA; endianness doesn't matter here as long as it's preserved
//}
Model2D.prototype.renderNodes_raw = function(pxbuf)
{
//    var outofs = 0;
    (this.nodelist || []).forEach(function(pxofs, inx)
    {
//NOTE: null is used as a placeholder node and should be set to off to reduce entropy
        this.port.outbuf.writeUInt32BE((pxofs !== null)? pxbuf.readUInt32BE(pxofs): 0); //RGBA; endianness doesn't matter here as long as it's preserved
    }.bind(this));
}


Model2D.prototype.bytesPerNode_mono = 1
//var rgba_split = new Buffer([255, 255, 255, 255]);
//Model2D.prototype.renderNode_mono = function(outofs, pxbuf, pxofs)
//{
////    this.outbuf.writeUInt32BE((pxofs !== null)? pxbuf.readUInt32BE(pxofs): 0, outofs); //RGBA; endianness doesn't matter here as long as it's preserved
////    var rgba = (pxofs !== null)? pxbuf.readUInt32BE(pxofs): 0;
////    var c = Color({r: rgba_split[0], g: rgba_split[1], b: rgba_split[2], a: rgba_split[3]}); //color >> 24, g: color >> 16));
////TODO?   c = Color(hex8(rgba)).hsv(); c.v *= brightness/255; c = c.rgba(); c.a *= 255;
////    c = c.darken(100 * (255 - brightness) / 255).toRgb(); //100 => completely dark
////    rgba_split[0] = c.r; rgba_split[1] = c.g; rgba_split[2] = c.b; rgba_split[3] = c.a * 255; //1.0 => 255
////    this.outbuf.writeUInt32BE(rgba, outofs); //RGBA; endianness doesn't matter here as long as it's preserved
//    var brightness = 0;
//    if (pxofs !== null)
//    {
////        var c = Color({r: pxbuf[pxofs + 0], g: pxbuf[pxofs + 1], b: pxbuf[pxofs + 2], a: pxbuf[pxofs + 3]}); //color >> 24, g: color >> 16));
////        brightness = c.brightness();
//        brightness = Math.max(pxbuf[pxofs + 0], pxbuf[pxofs + 1], pxbuf[pxofs + 2]); //TODO: weighted?
//    }
//    this.port.outbuf[outofs] = brightness;
//}
Model2D.prototype.renderNodes_mono = function(pxbuf)
{
    (this.nodelist || []).forEach(function(pxofs, inx)
    {
//NOTE: null is used as a placeholder node and should be set to off to reduce entropy
        var brightness = (pxofs !== null)? Math.max(pxbuf[pxofs + 0], pxbuf[pxofs + 1], pxbuf[pxofs + 2]): 0; //TODO: weighted?
        this.port.outbuf.writeUInt8(brightness);
    }.bind(this));
}

Model2D.prototype.bytesPerNode_RGBA = 4;
//Model2D.prototype.renderNode_RGBA = function(outofs, pxbuf, pxofs)
//{
//    this.port.outbuf.writeUInt32BE((pxofs !== null)? pxbuf.readUInt32BE(pxofs): 0, outofs); //RGBA
////    rgba_split[0] = pxbuf[pxofs + 0]; //R
////    rgba_split[1] = pxbuf[pxofs + 1]; //G
////    rgba_split[2] = pxbuf[pxofs + 2]; //B
////    rgba_split[3] = pxbuf[pxofs + 3]; //A
////    this.port.outbuf.write(rgba_split.readUInt32BE(0), 4); //RGBA
//}
Model2D.prototype.renderNodes_RGBA = function(pxbuf)
{
    (this.nodelist || []).forEach(function(pxofs, inx)
    {
//NOTE: null is used as a placeholder node and should be set to off to reduce entropy
        this.port.outbuf.writeUInt32BE((pxofs !== null)? pxbuf.readUInt32BE(pxofs): 0); //RGBA
    }.bind(this));
}

Model2D.prototype.bytesPerNode_RGB = 3;
//Model2D.prototype.renderNode_RGB = function(outofs, pxbuf, pxofs)
//{
//    this.port.outbuf.writeUInt24BE((pxofs !== null)? pxbuf.readUInt32BE(pxofs) >>> 8: 0, outofs); //RGB, drop A
////    rgba_split[0] = (pxofs !== null)? pxbuf[pxofs + 0]: 0; //R
////    rgba_split[1] = (pxofs !== null)? pxbuf[pxofs + 1]: 0; //G
////    rgba_split[2] = (pxofs !== null)? pxbuf[pxofs + 2]: 0; //B
////    rgba_split[3] = 0xEE; //make it easier to see if this is working
////    this.outbuf.write(rgba_split.readUInt32BE(0), 3); //RGB
////    this.outbuf[inx + 0] = pixels[pxofs + 0]; //R
////    this.outbuf[inx + 1] = pixels[pxofs + 1]; //G
////    this.outbuf[inx + 2] = pixels[pxofs + 2]; //B
//}
Model2D.prototype.renderNodes_RGB = function(pxbuf)
{
    (this.nodelist || []).forEach(function(pxofs, inx)
    {
//NOTE: null is used as a placeholder node and should be set to off to reduce entropy
        this.port.outbuf.writeUInt24BE((pxofs !== null)? pxbuf.readUInt32BE(pxofs) >>> 8: 0); //RGB, drop A
    }.bind(this));
}

Model2D.prototype.bytesPerNode_GRB = 3;
//Model2D.prototype.renderNode_GRB = function(outofs, pxbuf, pxofs)
//{
//    var abgr = (pxofs !== null)? pxbuf.readUInt32LE(pxofs): 0; //ABGR
//    var grb = ((abgr & 0xFFFF) << 8) | ((abgr & 0xFF0000) >>> 16); // ABGR -> GRB
//    this.port.outbuf.writeUInt24BE(grb, outofs);
////    rgba_split.writeUInt24BE( = new Buffer([255, 255, 255, 255]);
////    this.outbuf.writeUInt24BE((pxofs !== null)? pxbuf.readUInt32BE(pxofs) >>> 8: 0); //RGB, drop A
////    rgba_split[1-0] = (pxofs !== null)? pxbuf[pxofs + 0]: 0; //R; R<->G on some WS281X strips
////    rgba_split[1-1] = (pxofs !== null)? pxbuf[pxofs + 1]: 0; //G
////    rgba_split[2] = (pxofs !== null)? pxbuf[pxofs + 2]: 0; //B
////    rgba_split[3] = 0xEE; //make it easier to see if this is working
////    this.outbuf.write(rgba_split.readUInt32BE(0), 3); //GRB
//}
Model2D.prototype.renderNodes_GRB = function(pxbuf)
{
    (this.nodelist || []).forEach(function(pxofs, inx)
    {
//NOTE: null is used as a placeholder node and should be set to off to reduce entropy
        var abgr = (pxofs !== null)? pxbuf.readUInt32LE(pxofs): 0; //ABGR
        var grb = ((abgr & 0xFFFF) << 8) | ((abgr & 0xFF0000) >>> 16); // ABGR -> GRB
        this.port.outbuf.writeUInt24BE(grb);
    }.bind(this));
}


//render node values canvas pixels:
Model2D.prototype.render = function(frnext)
{
    console.log("model '%s' render: me dirty? %s, parent dirty? %s, port %s", this.name, this.dirty, (this.parent || {}).dirty, (this.port || {name: 'none'}).name); //, this.renderNode);
    if (!this.dirty || !this.port) return; //if not dirty or no output port, no need to render
    if (!this.renderNode) { this.dirty = false; return; } //okay for dummy models to have no output; //throw "Unhandled node output type: '" + (this.opts.output || '(none)') + "'";
//        this.buf_resize('outbuf', 4 * this.nodelist.length);
    var imgdata = this.imgdata(); //get all my pixels
    var pxbuf = imgdata.data; //? new DataView(imgdata.data.buffer): null; //Uint32Array(imgdata.data.buffer/*, 0, Uint32Array.BYTES_PER_ELEMENT*/): null;
    console.log("start '%s' render: imgdata? %s, pxbuf %s len %s, port outbuf len %s, used %s", this.name, !!imgdata, pxbuf? pxbuf.constructor.name: '(none)', pxbuf? pxbuf.length: 'none', this.port.outbuf.maxSize(), this.port.outbuf.size());
//    if (!pxbuf) { this.dirty = false; return; } //no data to send
    var svlen = this.port.outbuf.size();
//    (this.nodelist || []).forEach(function(pxofs, inx)
//    {
////            pxofs *= 4; inx *= 4; //RGBA 4 bytes/node
////            this.outbuf[inx + 0] = pixels[pxofs + 0]; //R
////            this.outbuf[inx + 1] = pixels[pxofs + 1]; //G
////            this.outbuf[inx + 2] = pixels[pxofs + 2]; //B
////            this.outbuf[inx + 3] = pixels[pxofs + 3]; //A
////            this.outbuf.writeUInt32BE(pxbuf.readUInt32(pxofs)); //RGBA
//        this.renderNode(inx * this.bytesPerNode, pxbuf, pxofs); //NOTE: null is used as a placeholder node and should be set off to reduce entropy
//    }.bind(this));
    this.renderNodes(pxbuf);
    console.log("finish '%s' render: outbuf len %s, added %s bytes", this.name, this.port.outbuf.size(), this.port.outbuf.size() - svlen); //, this.outbuf);
    if (this.port.outbuf.size() != svlen) this.port.dirty = true;
    this.dirty = false;
//    return this.fx? frnext + 50: false; //TODO: generate frnext based on running fx; no next frame scheduled
}


//http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
Model2D.prototype.rdframe = function(filename)
{
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
    this.dirty = true;
    return this; //fluent
}

Model2D.prototype.wrframe = function(filename)
{
//var imgdata = entire.imgdata();
//if (imgdata) imgdata = imgdata.data;
//console.log("imgdata len %s", imgdata.length); //data.length);
//console.log("imgdata ", imgdata); //data.length);
    var buf = new Buffer(this.imgdata().data);
    if (!filename) filename = process.cwd() + '/frame.data'; //__dirname
    var stream = fs.createWriteStream(filename, {flags: 'w', objectMode: true});
    stream.write(buf);
    stream.end();
    console.log("wrote '%s' len %s to file '%s'", this.name, buf.length, filename); //data.length);
    return this; //fluent
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


//debugger;
Model2D.entire = new Model2D('entire'); //define super-model (first) to include all other models


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// helper functions:
//

function extensions()
{
    buffer.INSPECT_MAX_BYTES = 800;
    Buffer.prototype.readUInt24BE = function(ofs) { return int24.readUInt24BE(this, ofs); };
    Buffer.prototype.writeUInt24BE = function(val, ofs) { return int24.writeUInt24BE(this, val, ofs); }; //NOTE: falafel/acorn needs ";" here to prevent the following array lit from being undefined; TODO: fix falafel/acorn

    ['readUInt32BE', 'readUInt32LE'].forEach(function(ignored, inx, both)
    {
        if (require('is-little-endian')) inx = 1 - inx; //https://github.com/mikolalysenko/is-little-endian
        Uint8ClampedArray.prototype[both[inx]] = function(ofs) { return (this[ofs + 0] << 24) | (this[ofs + 1] << 16) | (this[ofs + 2] << 8) | this[ofs + 3]; }
        Uint8ClampedArray.prototype[both[1 - inx]] = function(ofs) { return (this[ofs + 3] << 24) | (this[ofs + 2] << 16) | (this[ofs + 1] << 8) | this[ofs + 0]; }
//    if (!this.uint32view) this.uint32view = new Uint32Array(this);
//    rgba_split.writeUInt32BE(this.
    });
//Uint8ClampedArray.prototype.readUInt32Native = require('is-little-endian')? Uint8ClampedArray.prototype.readUInt32LE: Uint8ClampedArray.prototype.readUInt32BE;
}


//var rgba_split = new Buffer([255, 255, 255, 255]);

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

//just use UInt32 readers
//function toRGBA(r, g, b, a)
//{
//    return ((r & 0xFF) << 24) | ((g & 0xFF) << 16) | ((b & 0xFF) << 8) | (isdef(a)? a & 0xFF: 0xFF);
//}
//function fromRGBA(color)
//{
//    return {r: (color >> 24) & 0xFF, g: (color >> 16) & 0xFF, b: (color >> 8) & 0xFF, a: color & 0xFF};
//}

function hex8(val)
{
    return ('00000000' + (val >>> 0).toString(16)).slice(-8);
}


//eof
