//generic model (channel group)
//also defines a few subclasses for common geometry

var inherits = require('inherits');


function isdef(thing) { return (typeof thing !== 'undefined'); }
function setnew(type, args)
{
//    if (this instanceof type) return;
    return new (type.bind.apply(type, [null].concat(Array.from(args))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
}


//var Model = require('my-projects/models/base_model');
var Model = module.exports.Model = function(opts)
{
//    console.log("model args", arguments);
    if (!(this instanceof Model)) return setnew(Model, arguments); //new (Model.bind.apply(Model, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    var add_prop = function(name, value) //expose prop but leave it read-only
    {
//        console.log("this is ", this, this.constructor.name, this.constructor + '');
        Object.defineProperty(this, name, {value: value});
    }.bind(this);

    add_prop('opts', opts); //preserve unknown options for subclasses
    add_prop('pxsize', opts.rgb? 3: opts.rgbw? 4: 1);
//    console.log("model opts %j", opts);
//    var chpool = opts.chpool;
    add_prop('adrs', isdef(opts.adrs)? use_adrs(opts.adrs): opts.chpool.getadrs());
    add_prop('numch', isdef(opts.numch)? opts.numch: this.pxsize * (isdef(opts.numpx)? opts.numpx: 16));
    add_prop('startch', isdef(opts.startch)? use_channels(opts.startch, this.numch): opts.chpool.getch(this.numch));
//    this.getbuf = function opts.getbuf;
    var m_buf = null; //CAUTION: don't alloc until all ch assigned
    add_prop('buf', function()
    {
        if (!m_buf) m_buf = opts.chpool.buf.slice(this.startch, this.numch);
        return m_buf;
    });
    if (!Model.all) Model.all = [];
    Model.all.push(this);

    this.nodeofs = function(i) { return this.opts.pxsize * i; } //overridable with custom node order
    switch (this.opts.pxsize)
    {
        case 1:
            this.fill = function(color)
            {
                this.buf.fill(color);
                this.dirty = true;
                return this; //fluent
            }
            this.pixel = function(i, color) //override with custom logic
            {
                if (arguments.length < 3) return this.buf.readUInt8BE(this.nodeofs(i));
                this.buf.writeUInt8BE(this.nodeofs(i)), color);
                this.dirty = true;
                return this; //fluent
            }
            break;
        case 2:
            this.fill = function(color)
            {
                for (var i = 0; i < this.numch; i += 2) this.buf.writeUInt16BE(i, color);
                this.dirty = true;
                return this; //fluent
            }
            this.pixel = function(i, color) //override with custom logic
            {
                if (arguments.length < 3) return this.buf.readUInt16BE(this.nodeofs(i));
                this.buf.writeUInt16BE(this.nodeofs(i)), color);
                this.dirty = true;
                return this; //fluent
            }
            break;
        case 3:
            this.fill = function(color)
            {
                for (var i = 0; i < this.numch; i += 3) this.buf.writeUInt24BE(i, color);
                this.dirty = true;
                return this; //fluent
            }
            this.pixel = function(i, color) //override with custom logic
            {
                if (arguments.length < 3) return this.buf.readUInt24BE(this.nodeofs(i));
                this.buf.writeUInt24BE(this.nodeofs(i)), color);
                this.dirty = true;
                return this; //fluent
            }
            break;
        case 4:
            this.fill = function(color)
            {
                for (var i = 0; i < this.numch; i += 4) this.buf.writeUInt32BE(i, color);
                this.dirty = true;
                return this; //fluent
            }
            this.pixel = function(i, color) //override with custom logic
            {
                if (arguments.length < 3) return this.buf.readUInt32BE(this.nodeofs(i));
                this.buf.writeUInt32BE(this.nodeofs(i)), color);
                this.dirty = true;
                return this; //fluent
            }
            break;
        default:
            throw "Unhandled node size: " + this.opts.pxsize;
    }

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

//Model.prototype.render = function(force_dirty)
//{
//    if (!this.dirty && !force_dirty) return;
//}

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


var Rect2D = module.exports.Rect2D = function(opts) //w, h, more_args)
{
//    console.log("rect2d args", arguments);
//    console.log("fiixup", [null].concat.apply(arguments));
//    console.log("fix2", [null].concat(Array.from(arguments)));
    if (!(this instanceof Rect2D)) return setnew(Rect2D, arguments); //new (Rect2D.bind.apply(Rect2D, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    opts = (typeof opts !== 'object')? {numpx: opts}: opts || {};
    if (!isdef(opts.h)) opts.h = 16; //16 x 16 is good for simple icons, so use that as default
    if (!isdef(opts.w)) opts.w = 16;
    if (!isdef(opts.numpx)) opts.numpx = opts.w * opts.h;
    var args = Array.from(arguments); args[0] = opts;
    Model.apply(this, args);

    this.xy2node = function(x, y) { return this.nodeofs(y * opts.w + x); } //overide with custom node order
    this.pixel = function(x, y, color) { return Model.prototype.pixel.call(this, this.xy2node(x, y), color); } //override with custom logic
    this.R2L = function(x) { return opts.w - x - 1; }
    this.B2T = function(y) { return opts.h - y - 1; }
}
inherits(Rect2D, Model);



var Strip1D = module.exports.Strip1D = function(opts)
{
    if (!(this instanceof Strip1D)) return setnew(Strip1D, arguments); //new (Strip1D.bind.apply(Strip1D, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    opts = (typeof opts !== 'object')? {numpx: opts}: opts || {};
    if (!isdef(opts.numpx)) opts.numpx = opts.w || 8; //16F688 typically drives 8 channels, so use that as default
    var args = Array.from(arguments); args[0] = opts;
    Model.apply(this, args);
}
inherits(Strip1D, Model);


var Single0D = module.exports.Single0D = function(opts)
{
    if (!(this instanceof Single0D)) return setnew(Single0D, arguments); //new (Single0D.bind.apply(Single0D, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    opts = (typeof opts !== 'object')? {numpx: opts}: opts || {};
    if (!isdef(opts.numpx)) opts.numpx = 1; //default single channel, but let caller specify more
    var args = Array.from(arguments); args[0] = opts;
    Model.apply(this, args);

    this.pixel = function(color) { return Model.prototype.pixel.call(this, 0, color); } //override with custom logic
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
//    var m_buf = get buf() { return ctlr.buf? ctlr.buf: ctlr.buf = this.buf.slice(ctlr.startch, ctlr.numch)}});
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
