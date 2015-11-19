//generic model (channel group)
//also defines a few subclasses for common geometry

'use strict';

//var Color = require('onecolor');
var inherits = require('inherits');
//var buffer = require('buffer');
var caller = require('my-plugins/utils/caller').caller;
var shortname = require('my-plugins/utils/shortname');
var makenew = require('my-plugins/utils/makenew');
var pixelwidths = require('my-projects/models/pixel-widths');

var DataView = require('buffer-dataview'); //https://github.com/TooTallNate/node-buffer-dataview
require('my-plugins/my-extensions/object-enum'); //allow object.forEach()

function isdef(thing) { return (typeof thing !== 'undefined'); }


//use function names so model.name can be set from ctor:
module.exports.Model = Model;
module.exports.Single0D = Single0D;
module.exports.Strip1D = Strip1D;
module.exports.Rect2D = Rect2D;


//var Model = require('my-projects/models/base_model');
function Model(opts)
{
//    console.log("model args", arguments);
    if (!(this instanceof Model)) return makenew(Model, arguments); //new (Model.bind.apply(Model, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    var add_prop = function(name, value, vis) { if (!this[name]) Object.defineProperty(this, name, {value: value, enumerable: vis !== false}); }.bind(this); //expose prop but leave it read-only

    add_prop('opts', opts); //preserve unknown options for subclasses
    this.name = opts.name || this.constructor.name; //shortname(caller(1, __filename)));
    add_prop('nodelen', opts.rgb? 3: opts.rgbw? 4: opts.rg? 2: 1); //#bytes/node in hardware (rgb/w, no alpha)
    if (isdef(opts.numch) && isdef(opts.numpx) && (opts.numch != this.nodelen * opts.numpx)) throw "Numch " + opts.numch + " doesn't match numpx " + opts.numpx;
    var m_dirty = false; //true/false or when becomes dirty (msec)
    Object.defineProperty(this, 'dirty',
    {
        get: function() { return m_dirty; }, //opts.chpool.dirty;
        set: function(newval)
        {
            if (newval && !m_dirty) opts.chpool.dirty = m_dirty = true; //only set chpool, not reset
            else if (!newval && m_dirty) m_dirty = false;
        }, //.bind(this),
        enumerable: true,
    });
    if (opts.zinit !== false) this.dirty = true; //force initial render in case nothing else does; NOTE: buffer can't be allocated yet, so just set flag here
//    debugger;
//    console.log("model name %s, opts %j", this.constructor.name, opts);

//    var chpool = opts.chpool;
    add_prop('adrs', isdef(opts.adrs)? use_adrs(opts.adrs): opts.chpool.getadrs());
    add_prop('numch', isdef(opts.numch)? opts.numch: this.nodelen * (isdef(opts.numpx)? opts.numpx: 16));
//    Object.defineProperty(this, 'numch', { enumerable: true, get: function() { return m_buf.length; }});
    add_prop('numpx', Math.floor(this.numch / this.nodelen)); //TODO: allow last partial node to be used?
//    Object.defineProperty(this, 'numpx', { enumerable: true, get: function() { return Math.floor(m_buf.length / this.nodelen); }});
    add_prop('startch', isdef(opts.startch)? use_channels(opts.startch, this.numch): opts.chpool.getch(this.numch));
    var m_buf = null; //, m_nodes; //CAUTION: don't alloc until all ch assigned on this port
    Object.defineProperty(this, 'nodes', { enumerable: true, get: function() { if (!m_buf) alloc(); return m_buf; }});
//    Object.defineProperty(this, 'nodes', { enumerable: true, get: function() { if (!m_buf) alloc(); return m_nodes; }});
//    this.getbuf = function opts.getbuf;
    var alloc = function()
    {
//        opts.chpool.dirty = true; //kludge: assume that caller will update buf
        if (m_buf) return;
        m_buf = opts.chpool.buf.slice(this.startch, this.startch + this.numch); //slice from parent allows models to overlap
//        m_nodes = new DataView(m_buf); //new Uint32Array(m_buffer); //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays
        m_buf.inspect = this.inspect_nodes;
        if (opts.zinit !== false) this.fill(this.color(opts.zinit)); //can be a color; //m_buf.fill(0);
        if (this.allocbuf) this.allocbuf(m_buf); //allow custom slicing/mapping
    }.bind(this);

    var subclass = [null, pixelwidths.Mono, pixelwidths.Bicolor, pixelwidths.RGB, pixelwidths.RGBW][this.nodelen];
    if (!subclass) throw "Unhandled node size: " + this.nodelen;
    subclass.prototype.forEach(function(func, name) { if (func) this[name] = func; }.bind(this)); //console.log("copy %s.%s", subclass.constructor.name, name);
    this.nodeofs = function(inx) { return this.nodelen * inx; } //overridable with custom node order; nodejs seems to quietly ignore out-of-bounds errors, so explicit checking is not needed

//no    if (!Model.all) Model.all = []; //parent Chpool has a list of models
//    Model.all.push(this);

    function use_adrs(adrs)
    {
        var gap = adrs - opts.chpool.last_adrs;
        if (gap > 0) opts.chpool.getadrs(gap); //make sure adrs is allocated
        return adrs;
    }
    function use_channels(startch, numch)
    {
        var gap = startch + numch - opts.chpool.numch;
        if (gap > 0) opts.chpool.getch(gap); //make sure all channels are allocated
        return startch;
    }
}


Model.prototype.clear = function(color)
{
//    console.log("fill @%s: %d nodes with #%s", clock.asString(this.elapsed_total), m_buffer.length / 4, color.toString(16));
//    for (var n = 0; n < this.numpx; n+= 4) m_nodes.setUint32(n, color); //CAUTION: byte offset, not uint32 offset
//    m_dirty = true;
    this.fill(color || 0);
    return this; //fluent
}


Model.prototype.render = function(frtime, force_dirty)
{
//    throw "Model.render(): override this function in subclass";
    this.frtime = frtime; //latest render time
//    if (!this.dirty && !force_dirty) return null;
//already done unless animation is running  this.fill(frtime); //TODO
    var frnext = false; //when next render is needed; false for never, true for asap
    this.dirty = false;
//TODO    if (!dedup) parent_chpool.dirty = true;
    return frnext; //frtime + 999999; //TODO: tell caller when to update me again
}
/*
    model.render = function(frtime, buf)
    {
        if (!this.buffers)
        {
            this.ff = 0;
            this.buffers = [];
            for (var i = 0; i < 2; ++i) this.buffers.push(new Buffer(this.channels.length)); //425
        }

        var vix2buf = this.buffers[m_ff ^= 1]; //alternating buffers for diff
        this.getFrame(Math.floor(frtime / this.FixedFrameInterval), vix2buf); //first get Vixen2 frame
        var dirty = !frtime || bufdiff(m_buffers[0], m_buffers[1]); //this.prevbuf.compare(buf);
        if (!dirty) //render mapped data
        {
            Model.all.forEach(function(model, inx, all)
            {
                model.vix2set(frtime, vix2buf); //set this.frtime, this.buf, this.dirty
                model.render_renxt();
            });
            vix2.Sequence.prototype.render.call(this, frtime, buf);
        }
        return {frnext: Math.min(frtime + this.FixedFrameInterval, this.duration), dirty: dirty, buf: dirty? frbuf: undefined};
    }.bind(model);
*/


/*use ChannelPool.alloc factory instead
ChannelPool.prototype.Rect2D = function(args)
{
    console.log("chpool.p.rect2d args %j", arguments);
//no    if (!(this instanceof ChannelPool.prototype.Rect2D)) return new (ChannelPool.prototype.Rect2D.bind.apply(ChannelPool.prototype.Rect2D, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
Rect2D;
    if (this instanceof ChannelPool.prototype.Rect2D) throw "Don't call this with \"new\"";
    var args = Array.from(arguments);
    args[0] = (typeof args[0] !== 'object')? {first_param: args[0]}: args[0] || {};
    args[0].chpool = this; //NOTE: "this" needs to refer to parent ChannelPool here
//    args.unshift(null);
//    return new (Rect2D.bind.apply(Rect2D, args))();
    Rect2D.apply(this, args);
}
//no inherits(ChannelPool.prototype.Rect2D, Rect2D);
*/


//add geometry:

function Rect2D(opts) //w, h, more_args)
{
//    console.log("rect2d args", arguments);
//    console.log("fiixup", [null].concat.apply(arguments));
//    console.log("fix2", [null].concat(Array.from(arguments)));
    if (!(this instanceof Rect2D)) return makenew(Rect2D, arguments); //new (Rect2D.bind.apply(Rect2D, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    var add_prop = function(name, value, vis) { if (!this[name]) Object.defineProperty(this, name, {value: value, enumerable: vis !== false}); }.bind(this); //expose prop but leave it read-only
    opts = (typeof opts === 'string')? {name: opts}: (typeof opts === 'number')? {numpx: opts}: opts || {};
    if (!isdef(opts.w)) opts.w = 16; //16 x 16 is good for simple icons, so use that as default
    if (!isdef(opts.h)) opts.h = 16;
    if (!isdef(opts.numpx)) opts.numpx = opts.w * opts.h;
    var args = Array.from(arguments); args[0] = opts;
    Model.apply(this, args);

    add_prop('w', opts.w);
    add_prop('h', opts.h);
//additional methods for 2D node access:
    this.xy2node = function(x, y) { return (x < 0)? -1: (x >= opts.w)? opts.numpx: y * opts.w + x; } //if x out of range force result to be as well; override with custom node order
//    var m_oldpixel = this.pixel.bind(this);
    this.pixel2D = function(x, y, color) { return this.pixel(this.xy2node(x, y), color); } //override with custom logic
    this.R2L = function(x) { return opts.w - x - 1; }
    this.B2T = function(y) { return opts.h - y - 1; }
}
inherits(Rect2D, Model);

//additional methods for 2D node access:

/*
//override with custom node order
Rect2D.prototype.xy2node = function(x, y)
{
    return (x < 0)? -1: (x >= opts.w)? opts.numpx: y * opts.w + x; //if x out of range force result to be as well
}

//override with custom logic
Rect2D.prototype.pixel2D = function(x, y, color)
{
    return this.pixel(this.xy2node(x, y), color);
}
*/


Rect2D.prototype.row = function(y, color)
{
    for (var x = 0; x < this.w; ++x)
        this.pixel2D(x, y, color);
    return this; //fluent
}


Rect2D.prototype.column = function(x, color)
{
    for (var y = 0; y < this.h; ++y)
        this.pixel2D(x, y, color);
    return this; //fluent
}


function Strip1D(opts)
{
    if (!(this instanceof Strip1D)) return makenew(Strip1D, arguments); //new (Strip1D.bind.apply(Strip1D, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    opts = (typeof opts === 'string')? {name: opts}: (typeof opts === 'number')? {numpx: opts}: opts || {};
    if (!isdef(opts.w)) opts.w = 8; //16F688 typically drives 8 channels, so use that as default
    if (!isdef(opts.numpx)) opts.numpx = opts.w;
    var args = Array.from(arguments); args[0] = opts;
    Model.apply(this, args);
}
inherits(Strip1D, Model);


function Single0D(opts)
{
    if (!(this instanceof Single0D)) return makenew(Single0D, arguments); //new (Single0D.bind.apply(Single0D, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    opts = (typeof opts === 'string')? {name: opts}: (typeof opts === 'number')? {numpx: opts}: opts || {};
    if (!isdef(opts.numpx)) opts.numpx = 1; //default single channel, but let caller specify more
    var args = Array.from(arguments); args[0] = opts;
    Model.apply(this, args);

//set all nodes:
    this.pixel = function(color) //override with custom logic
    {
        if (isdef(color)) this.fill(color);
        return Model.prototype.pixel.call(this, 0); //, color);
    }
}
inherits(Single0D, Model);


/////////////////////////////////////////


/*
function ChannelGroup(opts)
{
    if (!(this instanceof ChannelGroup)) return new ChannelGroup(opts || {});
    Fluent.call(this, opts);

    var m_info = opts.port? opts.port.alloc(opts): {numch: opts.numch || 16, buf: new Buffer(this.numch)}; //{adrs, startch, numch, buf}
//    var m_adrs = opts.adrs;
//    var m_startch: opts.startch;
//    var m_numch = opts.numch;
//    var m_buf = get buf() { return ctlr.buf? ctlr.buf: ctlr.buf = this.buf.slice(ctlr.startch, ctlr.startch + ctlr.numch)}});
}
inherits(ChannelGroup, Fluent);

//custom geometry (models + fx, fluent):

function Rect2D(opts)
{
    if (!(this instanceof Rect2D)) return new Rect2D(opts || {});
    if (!opts.nodesize) opts.nodesize = RENXt.IsDumb(opts.type || 0)? 1: 3;
    if (!opts.numch) opts.numch = (opts.w || 1) * (opts.h || 1) * (opts.nodesize || 1);
    ChannelGroup.call(this, opts); //{startc, numch, nodesize}

//geometry-specific fx:
    this.line = function(fromx, fromy, tox, toy, color)
    {
    }
}
inherits(Rect2D, ChannelGroup);
*/


//eof
