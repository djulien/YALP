
'use strict';

var fs = require('fs');
var glob = require('glob');
var path = require('path');
//var BISON = require('bison');
//var Concentrate = require('concentrate'); //https://github.com/deoxxa/concentrate
//var empty = require('my-projects/playlists/empty');
//var Canvas = require('my-projects/models/growable-canvas');
//const dim = require('my-projects/models/color-fx').dim;
const hex = require('my-projects/models/color-fx').hex;
//var Canvas = require('canvas'); //https://www.npmjs.com/package/canvas; needs cairo as well; see https://www.npmjs.com/package/canvas
const Canvas = require('my-projects/models/my-canvas'); //cairo and/or canvas seems to be flaky, so just implement a minimal look-alike
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

const OFF_ARGB = 0xFF000000; //TODO: merge these
const OFF_RGBA = 0x000000FF;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// 2D model base class:
//

//Defines basic geometry and access to canvas/pixels
//manages parent/child mapping

//Model is the main "canvas" for writing effects to.
//For now, this is only 2D, but 3D-aware canvas is planned for future.
//Model is a wrapper around HTML5 Canvas, so all the HTML5 graphics functions and libraries can be used.
//Pixels on the canvas are then rendered by the protocol handler into control bytes to send to the hardware.
//Models can be nested or overlapped for composite or whole-house models, etc.
//Any methods that do not require access to private data are put in prototype rather than object to reduce code space usage.
const Model2D = module.exports =
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
//    this.fx = MyFxMixin.prototype; //Object.assign({}, MyFxMixin.prototype); //add fx methods to this model; CAUTION: shared ref, so don't put instance data in there
    MyFxMixin.apply(this, arguments); //initialize fx by calling nested fx namespace ctor; CAUTION: do this after prototype so supporting methods are there

//set up size + position first (no re-flow):
//x, y default to next tiled position; use "true" to use value from previous model; w, h default to previous model
//TODO: z-order? also, allow nested models? (> 1 level)
    var hasdom = !this.parent && this.opts.id && (typeof document != 'undefined'); //only link top-level canvas to DOM
    var m_canvas = hasdom? document.getElementById(this.opts.id): null; //link to browser DOM if present
//NOTE: no need to truncate left/bottom/right/top/width/height; parent will be enlarged to hold child
    this.width = this.opts.w || this.opts.width || (m_canvas || {}).width || (this.prior_sibling || {}).width || 1; //allow initial size to be set (optional); alloc at least one pixel
    this.height = this.opts.h || this.opts.height || (m_canvas || {}).height || (this.prior_sibling || {}).height || 1;
    this.left = (this.opts.x === true)? this.prior_sibling.left: isdef(this.opts.x)? this.opts.x: isdef(this.opts.left)? this.opts.left: (this.prior_sibling || {}).right || 0;
    this.bottom = (this.opts.y === true)?  this.prior_sibling.bottom: isdef(this.opts.y)? this.opts.y: isdef(this.opts.bottom)? this.opts.bottom: (this.prior_sibling || {}).bottom || 0;
    this.right = this.left + this.width; // 1 past edge
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
                        logger(10, "alloc %s x %s canvas for '%s'".cyan, this.width, this.height, this.name);
                        m_canvas = new Canvas(this.width, this.height);
//                        require('callsite')().forEach(function(stack, inx) { console.log("stack[%d]", inx, stack.getFunctionName() || '(anonymous)', require('my-plugins/utils/relpath')(stack.getFileName()) + ':' + stack.getLineNumber()); });
//                        this.clear(); //it's only safe to do this automatically when canvas is first created; caller can restore previous contents (during a resize) if desired
//                        this.canvas_ready(); //tell children to clear pixels
//                        m_oninit.forEach(function(init) { init(); }); //allow children to clear their pixels now
                        Model2D.all.forEach(function clear_all_child_models(child) { child.clear(); }); //do this when canvas is instantiated
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
//                if (newval && this.parent && this.parent.port && !this.parent.port.write) throw "Dirty port: nowhere to write";
            },
            enumerable: true,
        },
    });

//link to port:
    var m_port;
    Object.defineProperty(this, 'port',
    {
        get() { return m_port; },
        set(newval) //tells protocol handler to allocate resources
        {
            if (m_port = newval) m_port.assign(this);
            if (!m_port.write) logger("Output for model '%s' will be discarded (no port write)".yellow, this.name);
        },
        enumerable: true,
    });

//finalize model setup:
    process.nextTick(function() { this.generateNodelist(); }.bind(this)); //NOTE: this must occur before assigning port (in case protocol handle looks at nodes), but after parent has been sized (so layout is correct)
    if (this.opts.port) this.port = this.opts.port;
//    var m_parent = this; //preserve "this" for nested ctor
//TODO?    this.Model2D = Model2D.prototype.SubModel2D.bind(null, this); //pass "this" as first param for parent/child linkage
//defer    if (this.opts.zinit !== false) this.oninit.push(function() { this.clear(); }.bind(this)); //do this when canvas is instantiated
}
//module.exports = Model2D;
//shared class data:
Model2D.all = {}; //[];


//attach fx as namespace:
//Model2D.prototype.fx = MyFxMixin.prototype; //Object.assign({}, MyFxMixin.prototype);
Model2D.prototype.MyFx = MyFxMixin.prototype; //Object.assign({}, MyFxMixin.prototype); //add fx methods to this model; CAUTION: shared ref, so don't put instance data in there


//sub-model ctor; adds parent/child links
//called by child ctor to link with parent
Model2D.prototype.BecomeChild /*SubModel2D*/ =
function BecomeChild(parent)
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
Model2D.prototype.enlarge =
function enlarge(x, y, w, h)
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


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// generic 2D graphics:
//

//these functions interact with the graphics context
//pixels are represented by 32-bit values on the canvas: r, g, b, a bytes
//since the graphics canvas is mapped to nodes (in following sections), any external graphics tools or code can be used to manipulate nodes or generate sequencing patterns
//NOTE: external code or tools typically have origin in top left corner of canvas.  This is okay as long as it's consistent, but node rendering flips the Y coordinate so math functions can be implemented more naturally.

const PIXEL_WIDTH = 4; //#bytes per pixel in canvas memory (typically RGBA)


//graphics:
//NOTE: image data is RGBA byte array


Model2D.prototype.pixel_cache =
function pixel_cache(want_data)
{
//TODO: improve this
    var that = this.parent || this;
    if (want_data) //get all pixels, RGBA
        if (!that.pix_cache)
        {
            that.pix_cache = that.imgdata().data;
debugger;
            var buf = '', prior;
            for (var i = 0; i <= that.pix_cache.length; i += PIXEL_WIDTH)
            {
                var nxtval = (i < that.pix_cache.length)? that.pix_cache.readUInt32BE(i) >>> 0: -1;
                var n = hex(nxtval, 8), p = i? hex(prior.val, 8): '-';
                if (i && (nxtval == prior.val)) continue; //no change
                if (i && (prior.ofs < i - PIXEL_WIDTH)) buf += ' *' + ((i - prior.ofs) / PIXEL_WIDTH);
                if (i == that.pix_cache.length) break;
                buf += ', #' + hex(nxtval, 8);
                prior = {val: nxtval, ofs: i};
            }
//            if (prior.ofs < that.pix_cache.length - 1) buf += ' *' +
            logger(50, "reload pixel cache %d ents: %s".blue, that.pix_cache.length / PIXEL_WIDTH, buf.substr(2));
        }
    if (!want_data) //flush cached pixel data before it becomes stale
        if (that.pix_cache) that.pix_cache = null;
}


//get/put raw pixel data from/to canvas:
Model2D.prototype.imgdata =
function imgdata(x, y, w, h, data) //CAUTION: pixels are top-to-bottom (y coord is reversed)
{
//TODO: track or lock sections of canvas; prevent updates via ctx if a writable copy of canvas is still in memory
    switch (arguments.length) //shuffle optional params
    {
        case 1: if (!isRect(x)) { data = x; x = undefined; }; break;
        case 2: data = y; y = undefined; break;
    }
    if (isRect(x)) { h = x.h || x.height; w = x.w || x.width; y = x.y || x.bottom; x = x.x || x.left; } //unpack params
    if (!isdef(x)) x = 0; //this.left;
    if (!isdef(y)) y = 0; //this.bottom;
    if (!isdef(w)) w = this.width; //no- x;
    if (!isdef(h)) h = this.height; //no- y;
    if (w > this.width - x) { var oldw = w; w = this.width - x; console.log("img get/put w clipped to %d from %d", w, oldw); }
    if (h > this.height - y) { var oldh = h; h = this.height - y; console.log("img get/put h clipped to %d from %d", h, oldh); }
//    x += this.left; y += this.bottom; //relative -> absolute
//    if (this.parent) { x += this.parent.left; y += this.parent.bottom; } //sharing parent's canvas, so must xlate to parent's coords; TODO: check if this is in the right place
//TODO: clip?
//        x = Math.max(0, Math.min(this.width - 1, x)); //CAUTION: getImageData will throw exception if x, y out of range
//        y = Math.max(0, Math.min(this.height - 1, y));
//        w = Math.max(0, Math.min(this.width - x - 1, w));
//        h = Math.max(0, Math.min(this.height - y - 1, h));
    logger(120, "%s imgdata x %d + left %d, t2b y %d + bottom %d => %d, w %d, h %d", isdef(data)? "put": "get", x, this.left, y, this.bottom, (this.parent || this).T2B(y + this.bottom + h), w, h);
    if (!isdef(data)) //get
    {
//ask for y, h:   get:
// 0, 110         0..+110   y + b + h
// 10, 100        0..+100
// 0, 100         10..+100
// 10, 90         10..+90
// 10, 20         110-10-20, 20
// 80, 30         110-80-30, 30
//        console.log("parent t2b(109) = %d, parent? %s", (this.parent || this).T2B(109), !!this.parent);
        var retval = /*this.has_ctx?*/ this.ctx.getImageData(x + this.left, (this.parent || this).T2B(y + this.bottom + h), w, h); //: null; //always get in; models might need initial values for first render
        if (retval && (retval.data.length != PIXEL_WIDTH * w * h)) throw "didn't get all image data: expected " + (PIXEL_WIDTH * w * h) + ", got " + retval.data.length;
//            var uint32view = new Uint32Array(retval.data);
        logger(130, "imgdata get: x %s, y %s w %s h %s, parent (%s, %s), ctx? %s".blue, x, y, w, h, (this.parent || {}).left, (this.parent || {}).bottom, !!this.has_ctx); //u8 len %s, u32 len %s", retval.data.length, uint32view.length);
        if (retval) retval.data.inspect = function my_inspect(depth, opts) //make debug easier
        {
            var buf = '';
            for (var ofs = 0, limit = /*retval*/ this.data.length /*numch*/; ofs < limit; ofs += PIXEL_WIDTH)
            {
                if (ofs >= buffer.INSPECT_MAX_BYTES) { buf += ' ... ' + (limit - ofs) / PIXEL_WIDTH + ' '; break; }
                buf += ' ' + hex(this.data.readUInt32BE(ofs), 8); //toRGBA(/*retval*/ this.data[ofs], /*retval*/ this.data[ofs + 1], /*retval*/ this.data[ofs + 2], /*retval*/ this.data[ofs + 3])); //uint32view[ofs]); //retval.data.readUInt32BE(ofs));
            }
            return '<RGBA-buf:' + (limit / PIXEL_WIDTH) + ' ' + buf + '>';
        }.bind(retval);
//            console.log("imgdata(%s, %s, %s, %s), parent? %s :", x, y, w, h, !!this.parent, retval);
        return retval;
    }
    if (data && (data.length != PIXEL_WIDTH * w * h)) throw "not putting enough image data: got " + data.length + ", expected " + (PIXEL_WIDTH * w * h);
//        console.log("put img", w || this.width || 1, h || this.height || 1, data);
    if (data) { this.ctx.putImageData(data, x + this.left, (this.parent || this).T2B(y + this.bottom + h), x + this.left, (this.parent || this).T2B(y + this.bottom + h), w, h); this.dirty = true; }
    return this; //fluent
}

Model2D.prototype.save =
function save_ctx()
{
    this.ctx.save();
    return this; //fluent
}

const Color = require('tinycolor2'); //'onecolor');
// Possible string inputs:
//     "red"
//     "#f00" or "f00"
//     "#ff0000" or "ff0000"
//     "#ff000000" or "ff000000"
//     "rgb 255 0 0" or "rgb (255, 0, 0)"
//     "rgb 1.0 0 0" or "rgb (1, 0, 0)"
//     "rgba (255, 0, 0, 1)" or "rgba 255, 0, 0, 1"
//     "rgba (1.0, 0, 0, 1)" or "rgba 1.0, 0, 0, 1"
//     "hsl(0, 100%, 50%)" or "hsl 0 100% 50%"
//     "hsla(0, 100%, 50%, 1)" or "hsla 0 100% 50%, 1"
//     "hsv(0, 100%, 100%)" or "hsv 0 100% 100%"
const color_cache = require('my-projects/models/color-cache').cache;
const hexcolor = /^#[0-9A-F]{6,8}$/i;

Model2D.prototype.fillStyle =
function fillStyle(color) //context2d fillstyle wants RGB but Color wants ARGB
{
//    color = fromRGBA(color);
//    color = Color({r: rgba_split[0], g: rgba_split[1], b: rgba_split[2], a: rgba_split[3]}); //color >> 24, g: color >> 16));
    color = css_fixup(color);
    var argb = color_cache(color + '=', function parse_color() //allows CSS color formats
    {
        var c = Color(color); //wants #aarrggbb
        return [c.toRgbString(), c.toHexString()]; //CSS only accepts alpha via "rgba(...)" format, but we might need to adjust so also return hex; //toHex8String();
    });
//debugger;
    this.ctx.fillStyle = argb[0]; //sprintf("rgba(%d, %d, %d, %d)", rgba.r, rgba.g, rgba.b, rgba.a); //'#' + hex8(color);
    if (this.ctx.fillStyle != argb[1]) throw "didn't set fillStyle: " + argb[1] + " vs. " + this.ctx.fillStyle;
//    if (color.match(hexcolor) && this.ctx.fillStyle.match(hexcolor) && (this.ctx.fillStyle.substr(-6) != color.toLowerCase().substr(-6))) //kludge: fix up color drift
//    if (this.ctx.fillStyle.slice(-6) != rgba[1].slice(-6)) //report color drift
//        console.log("fill style for '%s': ARGB %s => RGBA %s %s => fillStyle %s", this.name, color, rgba[0], rgba[1], this.ctx.fillStyle);
    return this; //fluent
}


function css_fixup(color)
{
    if (typeof color == 'number')
    {
        var a = color >>> 24; //& 0xFF000000)
        if (a && (a != 255)) throw "Alpha not implemented here";
        color = '#FF' + hex(color, 6);
    }
//TODO: handle rgb(..) and rgba(...)
    else if ((typeof color == 'string') && color.match(/^#[0-9A-F]{6}$/)) color = '#FF' + color.substr(1); //force alpha to prevent color degradation
    return color;
}


//set to initial color:
Model2D.prototype.clear =
function clear()
{
    if (this.opts.zinit !== false) //this.promise.then(function()
//    {
        this.fill((isdef(this.opts.zinit) && (this.opts.zinit !== true))? this.opts.zinit: OFF_ARGB); //init xparent black if caller didn't pass a color
//    }.bind(this));
//    console.log("model2d has fill?", this.fill? "Y": "N");
    return this; //fluent
}

Model2D.prototype.fill =
function fill(x, y, w, h, color)
{
    switch (arguments.length) //shuffle optional params
    {
        case 1: if (!isRect(x)) { color = x; x = undefined; }; break;
        case 2: color = y; y = undefined; break;
    }
    if (isRect(x)) { h = x.h || x.height; w = x.w || x.width; y = x.y || x.bottom; x = x.x || x.left; } //unpack params
    if (!isdef(x)) x = 0; //this.left;
    if (!isdef(y)) y = 0; //this.bottom;
    if (!isdef(w)) w = this.width;
    if (!isdef(h)) h = this.height;
//    x += this.left; y += this.bottom; //relative - absolute
//    if (this.parent) { x += this.parent.left; y += this.parent.bottom; } //sharing parent's canvas, so must xlate to parent's coords; TODO: check if this is in the right place
//        x = Math.max(0, Math.min(this.width - 1, x)); //CAUTION: getImageData will throw exception if x, y out of range
//        y = Math.max(0, Math.min(this.height - 1, y));
//        w = Math.max(0, Math.min(this.width - x - 1, w));
//        h = Math.max(0, Math.min(this.height - y - 1, h));
    if (isdef(color)) this.save().fillStyle(color);
    logger(150, "fill '%s' rect %s x %s at (%s..%s, %s..%s) with %s", this.name, this.width, this.height, x, x + w - 1, y, y + h - 1, this.ctx.fillStyle); //hex8(color));
    if (w > this.width - x) { var oldw = w; w = this.width - x; console.log("fill w clipped to %d from %d", w, oldw); }
    if (h > this.height - y) { var oldh = h; h = this.height - y; console.log("fill h clipped to %d from %d", h, oldh); }
    this.pixel_cache(false); //in-memory copy of pixels is stale
//ctx address space requires parent offsets:
    this.ctx.fillRect(x + this.left, (this.parent || this).T2B(y + this.bottom + h), w, h); //CAUTION: graphics context is top-to-bottom; trying to turn it right side up here
    var readback = (this.imgdata(x, y, w, h) || {data: []}).data; //, color = this.ctx.fillStyle; //(color >>> 24) | (color << 8); //ARGB => RGBA
    if (readback.length != PIXEL_WIDTH * w * h) throw "bad readback length for '" + this.name + "': got " + readback.length + ", expected " + (PIXEL_WIDTH * w * h);
//    color = css_fixup(color); //this.ctx.fillStyle + 'ff'; //css_fixup(color);
//console.log("trying to set this to ", typeof this.ctx.fillStyle, this.ctx.fillStyle, color); //(typeof color == 'string')? color: '#' + hex(color, 8), hex(this.ctx.fillStyle, 8));
    for (var i = 0; i < readback.length; i += PIXEL_WIDTH)
        if ('#' + hex(readback.readUInt32BE(i) >>> 8, 6) != this.ctx.fillStyle) throw "fill failed '" + i + ": #" + hex(readback.readUInt32BE(i), 8) + " should be #" + this.ctx.fillStyle;
    logger(100, "%d nodes set to %s", readback.length / PIXEL_WIDTH, this.ctx.fillStyle);
    if (isdef(color)) this.restore();
    this.dirty = true;
    return this; //fluent
}

Model2D.prototype.restore =
function restore_ctx()
{
    this.ctx.restore();
    return this; //fluent
}

//Model2D.prototype.fill =
//function(color)
//{
//    return this.fillRect(this.x, this.y, this.width, this.height, color)
//        .save()
//        .fillStyle(color)
//        .fillRect(this.x, this.y, this.width, this.height, color)
//        .restore(); //fluent
//}


//set/get individual canvas pixels:
//NOTE: each pixel can affect 0 or more nodes: some areas of the canvas might not be mapped to nodes, other parts might be mapped to multiple nodes
//NOTE: when accessing lots of pixels, it's probably more efficient to grab the entire canvas with imgdata() and manipulate that directly, then update the canvas from that
//var m_pixelbuf = new ImageData(1, 1); //no worky
Model2D.prototype.pixel =
function pixel(x, y, color)
{
//    var m_pixelbuf;
//    if (this.parent) { x += this.parent.left; y += this.parent.bottom; } //sharing parent's canvas, so must xlate to parent's coords; TODO: check if this is in the right place
    if (!isdef(color)) //get
    {
//        if (this.parent) { x += this.parent.left; y += this.parent.bottom; } //sharing parent's canvas, so must xlate to parent's coords; TODO: check if this is in the right place
//        x += this.left; y += this.bottom; //relative -> absolute
//TODO: cache pixel values
        var retval = this.has_ctx? this.ctx.getImageData(x + this.left, (this.parent || this).T2B(y + this.bottom + 1), 1, 1): null; //avoid creating canvas when getting data
        if (retval.data.length != PIXEL_WIDTH) throw "incorrect pixel data size: " + retval.data.length;
//        if (retval) retval = toRGBA(retval.data[0], retval.data[1], retval.data[2], retval.data[3]);
        if (retval) retval = retval.data.readUInt32BE(0) >>> 0; //want RGBA
        return retval; //RGBA array
    }
    return this.fill(x, y, 1, 1, color);
/*
//    color = fromRGBA(color);
//        if (!this.pixelbuf) this.pixelbuf = this.ctx.createImageData(1, 1);
//        var imgdata = {data: new Uint8ClampedArray([color.r, color.g, color.b, color.a])};
//    this.pixelbuf.data[0] = color.r; this.pixelbuf.data[1] = color.g; this.pixelbuf.data[2] = color.b; this.pixelbuf.data[3] = color.a;
//    if (!Model2D.prototype.pixel.pixelbuf) Model2D.prototype.pixel.pixelbuf = this.ctx.getImageData(0, 0, 1, 1); //kludge: can't create buffer so get one from context
//    Model2D.prototype.pixel.pixelbuf.data.writeUInt32BE(rgba, 0);
//    this.ctx.putImageData(Model2D.prototype.pixel.pixelbuf, x, this.T2B(y)); //, x, this.T2B(y), 1, 1);
    if (this.pixelXY(x, y, false) < 0) return this; //not a real pixel; fluent
//    if (typeof color == 'number')
//    {
//        var a = color >>> 24;
//        color = '#' + hex(color | (!a? 0xFF000000: 0), 8); //allow string compare for paranoid check below
//    }
    /-*if (isdef(color))*-/ this.save().fillStyle(color);
//    console.log("set '%s' pixel (%s, %s) to color %s %s = %s ??", this.name, x, y, typeof color, color, /-*hex(color, 8),*-/ this.ctx.fillStyle); //hex8(color));
    if (this.parent) { x += this.parent.left; y += this.parent.bottom; } //sharing parent's canvas, so must xlate to parent's coords; TODO: check if this is in the right place
    x += this.left; y += this.bottom; //relative -> absolute
    this.ctx.fillRect(x, (this.parent || this).T2B(y), 1, 1);
    var readback = this.ctx.getImageData(x, (this.parent || this).T2B(y), 1, 1); //RGBA array
    var check = '#' + hex(readback.data.readUInt32BE(0), 8); // >>> 8, 6); //want RGBA
    if (check.toLowerCase() != color.toLowerCase()) throw "is '" + this.name + "' pixel (" + x + ", " + y + ") set correctly? wanted " + color + ", got " + check;
//    console.log("set '%s' pixel (%s, %s) to color %s %s = %s ??", this.name, x, y, typeof color, color, /-*hex(color, 8),*-/ this.ctx.fillStyle); //hex8(color));
    /-*if (isdef(color))*-/ this.restore();
    return this; //fluent
*/
}


//http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
Model2D.prototype.rdframe =
function rdframe(filename)
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

Model2D.prototype.wrframe =
function wrframe(filename)
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


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Node-to-canvas mapping:
//

//node lists:
//generic node list ordering is defined below.  caller can supply custom ordering.
//node list is just a cached list of offsets to pixels in the parent canvas.  This is done once at start to avoid the need to recalculate coordinates during each access.
//NOTE: node list contains pixel offsets, not byte offsets.  This allows the canvas implementation to change in future, but requires * 4 during rendering.  It also makes debugging of coordinates easier.

//const MAP_ADJUST = PIXEL_WIDTH, RENDER_ADJUST = 1; //reduces render-time overhead
const MAP_ADJUST = 1, RENDER_ADJUST = PIXEL_WIDTH; //makes coordinate debugging easier


Model2D.prototype.R2L =
//function R2L(x) { return this.right /*width*/ - x - 1; }
function R2L(x) { return this.width - x - 1; }

//benign definitions to use without parent canvas:
//const no_parent =
//{
//    T2B: function no_parent_T2B(y) { return this.height - y - 1; },
//    R2L: function no_parent_R2L(x) { return this.width - x - 1; },
//};

//CAUTION: canvas y coordinate is inverted; this puts origin in lower left corner
Model2D.prototype.T2B =
//function T2B(y) { return this.top /*height*/ - y - 1; } //CAUTION: canvas y coordinate is inverted; this puts origin in lower left corner
//function T2B(y) { return this.height - y - 1; } //CAUTION: canvas y coordinate is inverted; this puts origin in lower left corner
function T2B(y) { return this.height - y; } //CAUTION: canvas y coordinate is inverted; this puts origin in lower left corner


//NOTE: pixelXY must be defined on prototype, not within ctor (because L/R, T/B node list generators are passed into ctor)
//NOTE: accept relative coords so model can be cloned onto different (X, Y) positions and work without changing drawing logic, but generate ABSOLUTE coords
Model2D.prototype.pixelXY =
function pixelXY(x, y, want_throw) //map relative (X, Y) to my local imgData offset
{
//    var retval = ((x >= this.left) && (x < this.right) && (y >= this.bottom) && (y < this.top))? NODE_ADJUST * (this.width * this.T2B(y /*- this.bottom*/) + x - this.left): -1;
//    if (retval >= this.width * this.height * NODE_ADJUST) throw "BUG: bad pxofs: " + retval + ", len " + (this.width * this.height * NODE_ADJUST) + "nodes: " + this.nodelist;
    if ((x < 0) || (x >= this.width) || (y < 0) || (y >= this.height)) //not a pixel on my canvas
    {
        if (want_throw !== false) throw sprintf("bad xy (%s, %s) on model '%s', L %s, B %s, R %s, T %s", x, y, this.name, this.left, this.bottom, this.right, this.top);
        return null; //caller needs a placeholder to preserve node list positioning
    }
//NOTE: generate pixel absolute offset (relative to parent), since canvas is shared
     return MAP_ADJUST * ((this.parent || this).width * (this.parent || this).T2B(y + this.bottom + 1) + x + this.left); //parent byte array offset
}


//provide generic variations here
Model2D.prototype.L2R_T2B =
function L2R_T2B() //rectx, recty, rectw, recth)
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
    for (var x = 0 /*this.left*/; x < this.width /*this.right*/; ++x) //L->R
        for (var y = this.height /*this.top*/ - 1; y >= 0 /*this.bottom*/; --y) //T->B
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.R2L_T2B =
function R2L_T2B()
{
    this.nodelist = []; //new Array(w * h);
    for (var x = this.width - 1; x >= 0; --x) //R->L
        for (var y = this.height - 1; y >= 0; --y) //T->B
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.L2R_B2T =
function L2R_B2T()
{
    this.nodelist = []; //new Array(w * h);
    for (var x = 0; x < this.width; ++x) //L->R
        for (var y = 0; y < this.height; ++y) //B->T
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.R2L_B2T =
function R2L_B2T()
{
    this.nodelist = []; //new Array(w * h);
    for (var x = this.width - 1; x >= 0; --x) //R->L
        for (var y = 0; y < this.height; ++y) //B->T
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.T2B_L2R =
function T2B_L2R()
{
    this.nodelist = []; //new Array(w * h);
    for (var y = this.height - 1; y >= 0; --y) //T->B
        for (var x = 0; x < this.width; ++x) //L->R
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.T2B_R2L =
function T2B_R2L()
{
    this.nodelist = []; //new Array(w * h);
    for (var y = this.height - 1; y >= 0; --y) //T->B
        for (var x = this.width - 1; x >= 0; --x) //R->L
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.B2T_L2R =
function B2T_L2R()
{
    this.nodelist = []; //new Array(w * h);
    for (var y = 0; y < this.height; ++y) //B->T
        for (var x = 0; x < this.width; ++x) //L->R
            this.nodelist.push(this.pixelXY(x, y));
}

Model2D.prototype.B2T_R2L =
function B2T_R2L()
{
    this.nodelist = []; //new Array(w * h);
    for (var y = 0; y < this.height; ++y) //B->T
        for (var x = this.width - 1; x >= 0; --x) //R->L
            this.nodelist.push(this.pixelXY(x, y));
}

/*
//TODO: generalize?
Model2D.prototype.XYList =
function XYList(x_ranges, y_ranges)
{
    this.nodelist = []; //new Array(w * h);
//    (x_ranges || [[this.left, this.right]]).forEach(function(xrange)
    (x_ranges || [[0, this.width]]).forEach(function(xrange)
    {
//        switch (Math.sign(range[0] - range[1]))
        for (var x = xrange[0]; x < xrange[1]; ++x)
//            (y_ranges || [[this.bottom, this.top]]).forEach(function(yrange)
            (y_ranges || [[0, this.height]]).forEach(function(yrange)
            {
                for (var y = yrange[0]; y < yrange[1]; ++y)
                    this.nodelist.push(this.pixelXY(x, y));
                for (var y = yrange[0]; y > yrange[1]; --y)
                    this.nodelist.push(this.pixelXY(x, y - 1));
            });
        for (var x = range[0]; x > range[1]; --x)
//            for (var y = this.bottom; y < this.top; ++y) //B->T
            for (var y = 0; y < this.height; ++y) //B->T
                this.nodelist.push(this.pixelXY(x - 1, y));
        }
    }.bind(this));
}
*/


//node/pixel access:
/*
Model2D.prototype.buf_resize =
function buf_resize(bufname, needlen, grouping)
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
                case 3: buf += ' ' + hex(this.readUInt24BE(ofs), 6); break;
                case 4: buf += ' ' + hex(this.readUInt32BE(ofs), 8); break;
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
Model2D.prototype.generateNodelist =
function generateNodelist()
{
    if (!this.opts.order && (this.width * this.height != 1)) return;
//    console.log("parent width, height for model '%s': %s, %s", this.name, (this.parent || {}).width, (this.parent || {}).height);
    this.nodelist = [];
    ((this.opts.order || Model2D.prototype.T2B_L2R).bind(this))(); //call(this); //generate ordered node list
    if (!this.nodelist.length) throw "Model '" + this.name + "' no nodelist generated";
    this.setRenderType(this.opts.output);
    logger(30, "model '%s' generated %s nodes on %s x %s canvas, %s byte/node %s, left %s, bottom %s, width %s, height %s, right %s, top %s".blue, this.name, this.nodelist.length, this.width, this.height, this.bytesPerNode, this.opts.output || 'RGB', this.left, this.bottom, this.width, this.height, this.right, this.top); //, this.outbuf.length);
    logger(50, "node list: %s".blue, this.nodelist.toString());
}

Model2D.prototype.setRenderType =
function setRenderType(nodetype)
{
//debugger;
    ['renderNodes', 'bytesPerNode'].forEach(function setRenderType_each(propname) //set up rendering info
    {
        if (!(this[propname] = Model2D.prototype[propname + '_' + (nodetype || 'RGB')])) //set once based on node output type
            throw "Unhandled node render type: '" + (nodetype || 'RGB') + "'";
    }.bind(this));
//    this.buf_resize('outbuf', this.bytesPerNode * this.nodelist.length, this.bytesPerNode); //CAUTION: same buffer is reused every time; use double-buffering if previous frame needs to remain available
//    logger(30, "model '%s' set outbuf size to %s w x %s h x bytes/node = %s (".blue, this.name, this.width, this.height, this.bytesPerNode, this.outbuf.length);
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Rendering (canvas-to-node extraction):
//

//NOTE: canvas pixels are always 4 bytes (RGBA), but size of each rendered node varies according to the node type
//for example, dumb SSR channels are one byte each (brightness only), WS281X smart pixels are 3 bytes each (typically GRB or RGB), DIYC floods are 4 bytes each (RGBW), etc


Model2D.prototype.bytesPerNode_raw = 4;
//Model2D.prototype.renderNode_raw =
//function renderNode_raw(outofs, pxbuf, pxofs)
//{
//    this.port.outbuf.writeUInt32BE((pxofs !== null)? pxbuf.readUInt32BE(pxofs): 0, outofs); //RGBA; endianness doesn't matter here as long as it's preserved
//}
Model2D.prototype.renderNodes_raw =
function renderNodes_raw(pxbuf)
{
//    var outofs = 0;
    (this.nodelist || []).forEach(function nodelist_each(pxofs, inx)
    {
        if (pxofs === null) return;
//NOTE: null is used as a placeholder node and should be set to off even if node is absent (to reduce encoding entropy)
//        require('my-plugins/utils/showthis').call(this.port.outbuf, "port.outbuf");
//    try{
        this.port.outbuf.writeUInt32BE(pxbuf.readUInt32BE(RENDER_ADJUST * pxofs) >>> 0); //RGBA; endianness doesn't matter here as long as it's preserved
//        }catch(exc){ throw "ERROR:" + exc + ", pxofs " + pxofs + ", pxlen " + pxbuf.length + ", inx " + inx + ", buflen " + this.port.outbuf.size() + ", val " + (pxbuf.readUInt32BE(pxofs) >>> 0); }
    }.bind(this));
}


Model2D.prototype.bytesPerNode_mono = 1
//var rgba_split = new Buffer([255, 255, 255, 255]);
//Model2D.prototype.renderNode_mono =
//function renderNode_mono(outofs, pxbuf, pxofs)
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
Model2D.prototype.renderNodes_mono =
function renderNodes_mono(pxbuf)
{
    (this.nodelist || []).forEach(function renderNodes_each(pxofs, inx)
    {
        if (pxofs === null) return;
//NOTE: null is used as a placeholder node and should be set to off to reduce entropy
        var brightness = Math.max(pxbuf[RENDER_ADJUST * pxofs + 0], pxbuf[RENDER_ADJUST * pxofs + 1], pxbuf[RENDER_ADJUST * pxofs + 2]); //TODO: weighted?
        this.port.outbuf.writeUInt8(brightness >>> 0);
    }.bind(this));
}

Model2D.prototype.bytesPerNode_RGBA = 4;
//Model2D.prototype.renderNode_RGBA =
//function renderNode_RGBA(outofs, pxbuf, pxofs)
//{
//    this.port.outbuf.writeUInt32BE((pxofs !== null)? pxbuf.readUInt32BE(pxofs): 0, outofs); //RGBA
////    rgba_split[0] = pxbuf[pxofs + 0]; //R
////    rgba_split[1] = pxbuf[pxofs + 1]; //G
////    rgba_split[2] = pxbuf[pxofs + 2]; //B
////    rgba_split[3] = pxbuf[pxofs + 3]; //A
////    this.port.outbuf.write(rgba_split.readUInt32BE(0), 4); //RGBA
//}
Model2D.prototype.renderNodes_RGBA =
function renderNodes_RGBA(pxbuf)
{
    (this.nodelist || []).forEach(function renderNodes_each(pxofs, inx)
    {
        if (pxofs === null) return;
//NOTE: null is used as a placeholder node and should be set to off to reduce entropy
        this.port.outbuf.writeUInt32BE(pxbuf.readUInt32BE(RENDER_ADJUST * pxofs) >>> 0); //RGBA
    }.bind(this));
}

Model2D.prototype.bytesPerNode_ARGB = 4;
Model2D.prototype.renderNodes_ARGB =
function renderNodes_ARGB(pxbuf)
{
    (this.nodelist || []).forEach(function renderNodes_each(pxofs, inx)
    {
        if (pxofs === null) return;
//NOTE: null is used as a placeholder node and should be set to off to reduce entropy
//        if ((pxofs < 0) || (pxofs + PIXEL_WIDTH > pxbuf.length)) console.log("bad pxofs: %s, len %s", pxofs, pxbuf.length, this.nodelist);
//        console.log("render '%s' ARGB: node[%d/%d], pxofs %s, limit %d", this.name, inx, this.nodelist.length, RENDER_ADJUST * pxofs, pxbuf.length);
        var rgba = pxbuf.readUInt32BE(RENDER_ADJUST * pxofs); //RGBA
//if (inx < 20) console.log("render rgb get[%s]: %s", pxofs, hex(rgba, 8));
        var argb = ((rgba >>> 8) | (rgba << 24)) >>> 0;
        if ((argb < 0) || (argb > 0xFFFFFFFF)) throw "out of range: #" + hex(argb, 8);
        this.port.outbuf.writeUInt32BE((rgba >>> 8) | ((rgba & 0xff) << 24)); //ARGB
    }.bind(this));
}

Model2D.prototype.bytesPerNode_ABGR = 4;
Model2D.prototype.renderNodes_ABGR =
function renderNodes_ABGR(pxbuf)
{
    (this.nodelist || []).forEach(function renderNodes_each(pxofs, inx)
    {
        if (pxofs === null) return;
//NOTE: null is used as a placeholder node and should be set to off to reduce entropy
        this.port.outbuf.writeUInt32BE(pxbuf.readUInt32LE(RENDER_ADJUST * pxofs) >>> 0); //RGBA -> ABGR
    }.bind(this));
}

Model2D.prototype.bytesPerNode_RGB = 3;
//Model2D.prototype.renderNode_RGB =
//function renderNode_RGB(outofs, pxbuf, pxofs)
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
Model2D.prototype.renderNodes_RGB =
function renderNodes_RGB(pxbuf)
{
    (this.nodelist || []).forEach(function renderNodes_each(pxofs, inx)
    {
        if (pxofs === null) return;
//NOTE: null is used as a placeholder node and should be set to off to reduce entropy
        this.port.outbuf.writeUInt24BE(pxbuf.readUInt32BE(RENDER_ADJUST * pxofs) >>> 8); //RGB, drop A
    }.bind(this));
}

Model2D.prototype.bytesPerNode_GRB = 3;
//Model2D.prototype.renderNode_GRB =
//function renderNode_GRB(outofs, pxbuf, pxofs)
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
Model2D.prototype.renderNodes_GRB =
function renderNodes_GRB(pxbuf)
{
    (this.nodelist || []).forEach(function renderNodes_each(pxofs, inx)
    {
        if (pxofs === null) return;
//NOTE: null is used as a placeholder node and should be set to off to reduce entropy
        var abgr = pxbuf.readUInt32LE(RENDER_ADJUST * pxofs); //ABGR
        var grb = ((abgr & 0xFFFF) << 8) | ((abgr & 0xFF0000) >>> 16); // ABGR -> GRB
debugger;
        this.port.outbuf.writeUInt24BE(grb);
    }.bind(this));
}


//convenience function to flush port:
//can be used for hard-coded model scripting (ie, custom testing without a sequence)
Model2D.prototype.flush =
function flush(args)
{
//    this.pixel_cache(false); //flush cached pixel data before it becomes stale; TODO: improve this
    if (this.port) this.port.flush.apply(this.port, arguments);
//no    return this; //no need for fluent since caller needs a delay after a flush anyway; non-fluent ret here will force it and avoid mistakes
}


//render node values from canvas pixels:
//copies/transforms pixel values from parent canvas to output buffer
Model2D.prototype.render =
function render() //frnext)
{
    logger(120, "render model '%s': me? %s, parent? %s, port %s, send nodes? %s".blue, this.name, this.dirty, (this.parent || {}).dirty, (this.port || {name: 'none'}).name, !!this.renderNodes);
    if (!this.dirty || !this.port) return this; //fluent; if not dirty or no output port, no need to render
    if (!this.renderNodes) { this.dirty = false; return this; } //okay for dummy models to have no output; //throw "Unhandled node output type: '" + (this.opts.output || '(none)') + "'";
//        this.buf_resize('outbuf', 4 * this.nodelist.length);
//    var imgdata = this.imgdata(); //get all my pixels, RGBA
//    var pxbuf = imgdata.data; //? new DataView(imgdata.data.buffer): null; //Uint32Array(imgdata.data.buffer/*, 0, Uint32Array.BYTES_PER_ELEMENT*/): null;
    this.pixel_cache(true); //get all pixels, RGBA; TODO: improve this
//    console.log("start render '%s': imgdata? %s, pxbuf %s len %s, port outbuf len %s, used %s", this.name, !!imgdata, pxbuf? pxbuf.constructor.name: '(none)', pxbuf? pxbuf.length: 'none', this.port.outbuf.maxSize(), this.port.outbuf.size());
//    if (!pxbuf) { this.dirty = false; return this; } //no data to send
    var svlen = this.port.outbuf.size();
//    (this.nodelist || []).forEach(function render_each(pxofs, inx)
//    {
////            pxofs *= RENDER_ADJUST; inx *= 4; //RGBA 4 bytes/node
////            this.outbuf[inx + 0] = pixels[pxofs + 0]; //R
////            this.outbuf[inx + 1] = pixels[pxofs + 1]; //G
////            this.outbuf[inx + 2] = pixels[pxofs + 2]; //B
////            this.outbuf[inx + 3] = pixels[pxofs + 3]; //A
////            this.outbuf.writeUInt32BE(pxbuf.readUInt32(pxofs)); //RGBA
//        this.renderNode(inx * this.bytesPerNode, pxbuf, pxofs); //NOTE: null is used as a placeholder node and should be set off to reduce entropy
//    }.bind(this));
    this.renderNodes((this.parent || this).pix_cache);
//    console.log("finish render '%s': outbuf len %s, added %s bytes", this.name, this.port.outbuf.size(), this.port.outbuf.size() - svlen); //, this.outbuf);
    if (this.port.outbuf.size() != svlen) this.port.dirty = true;
    this.dirty = false;
//    return this.fx? frnext + 50: false; //TODO: generate frnext based on running fx; no next frame scheduled
    return this; //fluent
}


/*
Model2D.prototype.rgbRender =
function rgbRender(force)
{
    if (!this.dirty && !force) return this;
    if (!(this.nodelist || []).length) return this;
    var pixels = this.imgdata().data;
    this.buf_resize('outbuf', 3 * this.nodelist.length);
    this.nodelist.forEach(function rgbRender_each(pxofs, inx)
    {
        pxofs *= RENDER_ADJUST; inx *= 3; //raw RGB 3 bytes/node; drops alpha
        this.outbuf[inx + 0] = pixels[pxofs + 0]; //R
        this.outbuf[inx + 1] = pixels[pxofs + 1]; //G
        this.outbuf[inx + 2] = pixels[pxofs + 2]; //B
    }.bind(this));
    this.dirty = false;
    return this; //fluent
}
Model2D.prototype.rawRender =
function rawRender(force)
{
    if (!this.dirty && !force) return null;
    if (!(this.nodelist || []).length) return this;
    var pixels = this.imgdata().data;
    this.buf_resize('outbuf', 4 * this.nodelist.length);
    this.nodelist.forEach(function rawRender_each(pxofs, inx)
    {
        pxofs *= RENDER_ADJUST; inx *= 4; //RGBA 4 bytes/node
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

GrowableCanvas2D.prototype.enlarge =
function enlarge(x, y, w, h)
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
Model2D.prototype.Model2D =
function Model2D(opts)
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
    fs.readFile(filename, function load_frame_file(err, squid)
    {
        if (err) throw err;
        var img = new Image;
        img.src = squid;
        ctx.drawImage(img, 0, 0, img.width / PIXEL_WIDTH, img.height / PIXEL_WIDTH);
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
Model2D.all.forEach(function all_each(model, inx)
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


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// helper functions:
//

function extensions()
{
    buffer.INSPECT_MAX_BYTES = 800;
    Buffer.prototype.readUInt24BE = function readUInt24BE(ofs) { return int24.readUInt24BE(this, ofs) >>> 0; };
    Buffer.prototype.writeUInt24BE = function writeUInt24BE(val, ofs) { return int24.writeUInt24BE(this, val >>> 0, ofs); }; //NOTE: falafel/acorn needs ";" here to prevent the following array lit from being undefined; TODO: fix falafel/acorn

    ['readUInt32BE', 'readUInt32LE'].forEach(function extensions_each(ignored, inx, both)
    {
        if (require('is-little-endian')) inx = 1 - inx; //https://github.com/mikolalysenko/is-little-endian
        Uint8ClampedArray.prototype[both[inx]] = function readUInt24_native(ofs) { return (this[ofs + 0] << 24) | (this[ofs + 1] << 16) | (this[ofs + 2] << 8) | this[ofs + 3]; }
        Uint8ClampedArray.prototype[both[1 - inx]] = function writeUInt24_foreign(ofs) { return (this[ofs + 3] << 24) | (this[ofs + 2] << 16) | (this[ofs + 1] << 8) | this[ofs + 0]; }
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

//if (!console.clear) console.clear = function clear() {};
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

//Model2D.hex =
//function hex(val, len)
//{
//    if (!len) len = 8;
//    return ('00000000' + (val >>> 0).toString(16)).slice(-len);
//}


//debugger;
Model2D.entire = new Model2D('entire'); //define super-model (first) to contain all other models

//eof
