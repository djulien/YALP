'use strict';

var RenXt = require('my-plugins/hw/RenXt');
var inherits = require('inherits');
var DataView = require('buffer-dataview'); //https://github.com/TooTallNate/node-buffer-dataview
//var Elapsed = require('my-plugins/utils/elapsed');
var clock = require('my-plugins/utils/clock');


/***************
function ChannelGroup(opts)
{
    if (!(this instanceof ChannelGroup)) return new ChannelGroup(opts);
    var m_adrs = opts.adrs;
    var m_startch: opts.startch;
    var m_numch = opts.numch;
    var m_buf =
            get buf() { return ctlr.buf? ctlr.buf: ctlr.buf = this.buf.slice(ctlr.startch, ctlr.numch)}});
    this.fx =
    {
        fill: function(val)
    }
}

function ChannelPool(opts)
{
    if (!(this instanceof ChannelPool)) return new ChannelPool(opts);
    var m_numch = 0;
    var m_adrs = 0x01;
    var m_allinst = [];
    var m_buf = null;
    Object.defineProperty(this, 'buf', {get() { return m_buf? m_buf: m_buf = new Buffer(m_numch); }});
    this.alloc = function(opts)
    {
        if (m_buf) throw "Channel buffer already allocated."; //{ console.log("Enlarging channel buffer"); m_buf = null; }
        var retval = new ChannelGroup(
        {
            adrs: m_adrs++,
            startch: opts.startch || m_numch,
            numch: opts.numch || 16, //(opts.w || 1) * (opts.h || 1),
            get buf() { return ctlr.buf? ctlr.buf: ctlr.buf = this.buf.slice(ctlr.startch, ctlr.numch)}});
        });
        if (opts.startch) m_numch = Math.max(opts.startch, m_numch);
        m_numch += ctlr.numch;
        m_allinst.push(ctlr);
        return ctlr;
    }
    this.all = function(cb) { m_allinst.forEach(function(ctlr, inx) { cb(ctlr, inx); }); }
}

ChannelPool.prototype.Rect2D = function(opts)
{
//    if (!(this instanceof ChannelPool.Rect2D)) return new ChannelPool.Rect2D(opts);
    var m_ctlr = this.alloc(Object.assign(opts || {}, {numch: (opts.w || 16) * (opts.h || 1)});
//    return new fx();
    m_ctlr.fx =
    {
        fill: function(val)
        {
        },
    };
    return m_ctlr;
}

var HW = {}; //namespace
HW.SerialPort = function(opts)
{
    if (!(this instanceof HW.SerialPort)) return new HW.SerialPort(opts);
    ChannelPool.call(this); //pass options to base class
//TODO: port stuff
}
inherits(HW.SerialPort, ChannelPool); //http://stackoverflow.com/questions/8898399/node-js-inheriting-from-eventemitter


/-*
function fx(opts)
{
}
fx.prototype.fill = function(opts)
{
    return this; //allow chain
}
fx.prototype.wait = function(opts)
{
    return this; //allow chain
}
fx.prototype.loop = function(opts)
{
    return this; //allow chain
}
fx.prototype.fade = function(opts)
{
    return this; //allow chain
}
fx.prototype.block = function(opts)
{
    return this; //allow chain
}
fx.prototype.line = function(opts)
{
    return this; //allow chain
}
fx.prototype.setpal = function(opts)
{
    return this; //allow chain
}
*-/


//ports:
var FTDI_yellow = new HW.SerialPort(
{
    device: '/dev/ttyUSB0',
    baud: 242500,
    dataBits: 8, parity: 'none', stopBits: 1,
    fps: 20,
    bufsize: Math.floor(.95 * this.baud / (1 + this.dataBits + this.stopBits) / this.fps),
    io: function(buf, cb) {},
});

//models:
var test_strip = FTDI_yellow.Rect2D({w: 10, h: 1, type: RenXt.WS2811(RenXt.SERIES)});
var Rect16x16 = FTDI_yellow.Rect2D({w: 16, h: 16, type: RenXt.WS2811(RenXt.SERIES)});
var placeholder1 = FTDI_yellow.Rect2D();
var GdoorL = FTDI_yellow.Rect2D({w: 24, h: 16, type: RenXt.WS2811(RenXt.SERIES)});
var GdoorR = FTDI_yellow.Rect2D({w: 24, h: 16, type: RenXt.WS2811(RenXt.SERIES)});
var Gdoor = FTDI_yellow.Rect2D({w: 48, h: 16, stch: GdoorL.stch, type: RenXt.WS2811(RenXt.SERIES)}); //overlay
var Cols = FTDI_yellow.Rect2D({w: 3, h: 50, type: RenXt.WS2811(RenXt.PARALLEL)});
*/

function Actor(opts) //fluent wrapper for YALP streams
{
    if (!(this instanceof Actor)) return new Actor(opts);
    var m_opts = (typeof opts === 'string')? {filename: opts}: opts || {}; //pre-rendered stream
    m_opts.tslop = (typeof m_opts.tslop !== 'undefined')? m_opts.tslop >>> 0: 4; //default 4 msec timing slop
//    var m_started = clock.Now(), m_selected = -1 >>> 1, m_dirty = false; //run-time state, assume immediate mode
//    var m_pending = null;
    var m_started, m_selected, m_dirty, m_pending = null; //run-time state
    var m_buffer = opts.buffer || new /*Array*/Buffer(m_opts.numch || 16), m_count = Math.floor(m_buffer.byteLength / 4);
    var m_nodes = new DataView(m_buffer); //new Uint32Array(m_buffer); //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays
    var m_evts = []; //storyboard; delayed exec fx functions

    Object.defineProperties(this,
    {
        elapsed: { get() { return clock.Now() - m_started; }, },
        iseof: { get() { return (m_selected >= m_evts.length); }, },
    });
//    function ffwd(msec) { m_started -= msec; }
//    function now() { return Date.Now? Date.Now(): (new Date()).getTime(); }
    var isdue = function(when) { return (when - this.elapsed <= m_opts.tslop); }.bind(this);

    this.fill = function(color)
    {
        return enque(function()
        {
//            m_nodes.fill(color || 0);
            console.log("fill %d nodes with #%s", m_count, color.toString(16));
            for (var n = 0; n < /*m_count*/ m_opts.numch; /*++n*/ n+= 4) m_nodes.setUint32(n, color); //CAUTION: byte offset, not uint32 offset
            m_dirty = true;
        });
    }

    this.wait = function(delay) { return this.at(this.elapsed + delay); }
    this.at = function(when)
    {
        return enque(function(duration)
        {
            this.flush();
            console.log(isdue(when)? "run now": "run later %d", duration);
            if (!isdue(when)) m_pending = setTimeout(next.call(this), duration);
            else next();
        }, when - this.elapsed);
    }

    this.playback = function(opts)
    {
        for (var i in opts) m_opts[i] = opts[i];
        m_dirty = false; //CAUTION: set this before init()
        this.cancel();
        if (!m_opts.immediate || opts.first_init)
        {
            m_started = clock.Now();
            init();
        }
        console.log("playback started @%s, immed? %s", clock.Now.asString(this.elapsed), m_opts.immediate);
        if (m_opts.immediate) return; //{ init(); return } //ignore; already running
        if (!m_evts.length) throw "No display events aka cues aka storyboard";
//        m_selected = 0;
        next(true);
    }

    var init = function() { if (typeof m_opts.color !== 'undefined') this.fill(m_opts.color); }.bind(this);
    this.cancel = function()
    {
        if (m_pending) clearTimeout(m_pending); //prevent next deferred func from executing
        m_pending = null;
        if (!m_opts.persist) init(); //reset to start state
        this.flush();
    }

    this.flush = function()
    {
        if (!m_dirty) return;
        console.log("flush @%s", clock.elapsed.asString(this.elapsed), m_buffer);
        m_dirty = false;
    }

    var enque = function(fx, duration)
    {
        fx = fx.bind(this, Array.prototype.slice.call(arguments, 1)); //pass extra params to callback, make sure "this" is set
        if (duration < 0) console.log("%s is overdue by %s", fx, time_scaled(duration));
        if (m_opts.immediate /*this.isRunning*/) fx(); //execute immediately
        else m_evts.push({fxfunc: fx, time: this.elapsed + (duration || 0)}); //exec later
        return this; //allow chaining
    }.bind(this);

    var next = function(reset) //execute next display event
    {
        if (reset) m_active = 0;
        if (m_opts.immediate) return; //|| this.isRunning) return;
        if (this.iseof()) { this.cancel(); return; }
        var evt = m_evts[m_selected++];
        if (isdue(evt.time)) { m_pending = false; process.nextTick(function() { evt.fxfunc(); }); } //{ eval.call(this, evt.fxfunc); }.bind(this)); //execute "immediately"; avoid recursion
        else m_pending = setTimeout(evt.fxfunc, evt.time - this.elapsed);
        if (this.isRunning || !m_opts.loop) return; //not eof
        if (m_opts.loop !== true) --m_opts.loop;
        m_selected = 0; //rewind
    }.bind(this);

    if (m_opts.immediate) this.playback({first_init: true});
}

var test_strip = new Actor({immediate: true});

//fx:
test_strip
    .fill(0xFF0000)
    .wait(1000)
    .fill(0x0000FF)
    .wait(1000)
    .playback({persist: true, loop: 2});

/*
Rect16x16
    .fill(0)
    .wait(1500)
    .fade({first_color: 0, last_color: 0x00FFFF, interval: 1500})
    .fill(0)
    .wait(1000)
//    .chase({color: 0x00FF00, first_node: 0, last_node: 256,
    .block(function()
    {
        for (var n = 0; n < 256; ++n)
        {
            nodes[n] = 0x00FF00;
            wait(150);
        }
    })
    .fill(0x0F000F)
    .wait(1000)
    .loop();

//blinking eyes:
Gdoor
    .line({fromx: 0, fromy: 12, tox: 20, toy: 4, color: 0xFFFF00})
    .line({fromx: 0, fromy: 12, tox: 23, toy: 4, color: 0xFFFF00})
    .wait(2000)
    .setpal(0)
    .wait(100)
    .setpal(0xFFFF00)
    .wait(100)
    .setpal(0)
    .wait(100)
    .setpal(0xFFFF00)
    .wait(100)
    .loop();
*/

//console.log("handles", process._getActiveHandles());
//console.log("requests", process._getActiveRequests());

//eof
