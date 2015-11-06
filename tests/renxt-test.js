'use strict';

var RenXt = require('my-plugins/hw/RenXt');
var inherits = require('inherits');
var SerialPort = require("serialport"); //.SerialPort;
var DataView = require('buffer-dataview'); //https://github.com/TooTallNate/node-buffer-dataview
//var Elapsed = require('my-plugins/utils/elapsed');
var clock = require('my-plugins/utils/clock');


//hardware mixins:
var HW = {}; //namespace
//HW.SerialPort = function(opts)
//{
//    if (!(this instanceof HW.SerialPort)) return new HW.SerialPort(opts);
//    PortChannels.call(this); //pass options to base class

//add open, io, close methods for serial port:
HW.Serial = {};

HW.Serial.assign = function(that, opts)
{
//abbreviations:
    var CONFIG =
    {
        '8N1': {dataBits: 8, parity: 'none', stopBits: 1},
    };
    if (opts && opts.bits)
        if (!CONFIG[opts.bits]) throw "Unrecognized bit config: '" + opts.bits + "'";
        else opts = Object.assign(opts, CONFIG[opts.bits]);
//config only:
    that.port = new SerialPort.SerialPort(opts.device || '/dev/ttyUSB0',
    {
        fps: opts.fps || 20,
        baudrate: opts.baud || 242500,
        dataBits: opts.dataBits || 8,
        parity: opts.parity || 'none',
        stopBits: opts.stopBits || 1,
        buffersize: opts.bufsize || Math.floor(.95 * this.baudrate / (1 + this.dataBits + this.stopBits) / this.fps) || 2048,
        parser: SerialPort.parsers.raw, xparser: SerialPort.parsers.readline("\n"),
    }); //, function(err)
//    {
//        if (err) console.log("open err on '%s': ".red + err, opts.device);
//        else console.log("'%s' opened after %s".green, clock.elapsed());
//    });
//    var serialPort = new SerialPort.SerialPort("/dev/ttyUSB0", { baudrate: 57600 }, false); // this is the openImmediately flag [default is true]

//handlers:
    that.port.on("open", function() { console.log("'%s' opened", opts.device); });
//.flush(cb(err)) data received but not read
    that.port.on('data', function(data)
    {
        console.log("'%s' data received %d: '%s'".blue, opts.device, data.length, data.toString('utf8').replace(/\n/g, "\\n"));
    });
    that.port.on('error', function(err) { console.log("'%s' ERR: ".red, opts.device, err); });
    that.port.on('close', function() { console.log("'%s' closed".cyan, opts.device); });

//methods:
    that.open = function(cb)
    {
        var started = clock.Now();
        this.port.open(function(err)
        {
            if (err) { console.log("'%s' open err: ".red + err, opts.device); return; }
            console.log("'%s' opened after %d msec".green, opts.device, clock.Now() - start);
            this.io("ls\n");
            this.io("echo hello there;\n");
            var buf = new Buffer(2000);
            buf.fill(0x5a);
            this.io(buf);
        }.bind(this));
    }.bind(that);

    that.io = function(outbuf, cb)
    {
        var started = clock.Now();
        if (!cb) cb = function(err) { return err; };
        if (outbuf.length > m_port.buffersize) throw "Outbuf too long: " + outbuf.length + " (max " + m_port.buffersize + ")";
        return this.port.write(outbuf, function(err)
        {
//        console.log(typeof outbuf);
            var outdesc = outbuf.length + ':"' + ((typeof outbuf === 'string')? outbuf: (outbuf.toString('utf8').substr(0, 20) + '...')).replace(/\n/g, "\\n") + '"';
            if (err) { console.log('write "%s" err '.red + err, outdesc); return cb(err); }
//    else console.log('results %d: "%s"'.green, results.length, results);
            console.log("wr %s ok after %d msec".green, outdesc, clock.Now() - started);
            this.drain(function(err)
            {
                if (err) { console.log('drain %s err '.red + err, outdesc); return cb(err); }
                console.log("drain %s completed after %d msec".green, outdesc, clock.Now() - started);
                return cb();
            }.bind(this));
        }.bind(this));
    }.bind(that);

    this.close = function()
    {
        var start = clock.Now();
        this.port.close(function(err)
        {
            if (err) console.log("close err: ".red + err);
            else console.log("'%s' closed after %d msec".green, opts.device, clock.Now() - start);
        });
    }.bind(that);
}
//inherits(HW.SerialPort, PortChannels); //http://stackoverflow.com/questions/8898399/node-js-inheriting-from-eventemitter
//enum:
HW.Serial.enum = function(cb)
{
    var start = clock.Now();
    SerialPort.list(function (err, ports)
    {
        if (err) console.log("ERR:".red, err);
        console.log("found %d ports after %s:", ports.length, clock.elapsed());
        ports.forEach(function(port)
        {
            console.log("found port:".blue, port.comName, port.manufacturer, port.pnpId);
        });
    });
}


//fluent wrapper for YALP streams

function Fluent(opts)
{
    if (!(this instanceof Fluent)) return new Fluent(opts);
    var m_opts = (typeof opts === 'string')? {filename: opts}: opts || {}; //pre-rendered stream
    m_opts.tslop = (typeof m_opts.tslop !== 'undefined')? m_opts.tslop >>> 0: 4; //default 4 msec timing slop
//    var m_started = clock.Now(), m_selected = -1 >>> 1, m_dirty = false; //run-time state, assume immediate mode
//    var m_pending = null;
    var m_started, m_loopstart, m_selected, m_dirty, m_pending = null; //run-time state
    var m_buffer = m_opts.buffer || new /*Array*/Buffer(m_opts.numch || 16); //CAUTION: assumed to be a multiple of 4 bytes; //, m_count = Math.floor(m_buffer.byteLength / 4);
    var m_nodes = new DataView(m_buffer); //new Uint32Array(m_buffer); //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays
    var m_evts = []; //storyboard; delayed exec fx functions
    if (m_opts.immediate) throw "Immediate mode not supported yet.";
    m_opts.immediate = false; //broken; disabled for now

    this.elapsed_queue = 0;
    Object.defineProperties(this,
    {
        elapsed_total: { get() { return m_started? clock.Now() - m_started: 0; }, },
        elapsed_loop: { get() { return m_loopstart? clock.Now() - m_loopstart: 0; }, },
        iseof: { get() { return (m_selected >= m_evts.length); }, },
    });
//    function ffwd(msec) { m_started -= msec; }
//    function now() { return Date.Now? Date.Now(): (new Date()).getTime(); }
    var isdue = function(when) { return (when - this.elapsed_loop <= m_opts.tslop); }.bind(this);

//generic fx:
    this.fill = function(color)
    {
        return enque(function()
        {
//            m_nodes.fill(color || 0);
            console.log("fill @%s: %d nodes with #%s", clock.asString(this.elapsed_total), m_buffer.byteLength / 4, color.toString(16));
            for (var n = 0; n < /*m_count m_opts.numch*/ m_buffer.byteLength; /*++n*/ n+= 4) m_nodes.setUint32(n, color); //CAUTION: byte offset, not uint32 offset
            m_dirty = true;
            next();
        });
    }

    this.pixel = function(n, color)
    {
        return enque(function()
        {
            console.log("pixel @%s: node# %d, color #%s", clock.asString(this.elapsed_total), n, color.toString(16));
            m_nodes.setUint32(4 * n, color); //CAUTION: byte offset, not uint32 offset
            m_dirty = true;
            next();
        });
    }

//TODO: fade, block, setpal generic fx

//timing:
    this.wait = function(delay) { return this.at(this.elapsed_loop + delay); }
    this.at = function(when)
    {
        return enque(function(duration)
        {
            this.flush();
//            console.log(isdue(when)? "run now": "run later %d", duration);
            if (!isdue(when)) m_pending = setTimeout(next, duration);
            else next();
        }, when - this.elapsed_loop);
    }

    this.flush = function()
    {
        if (!m_dirty) return;
        console.log("flush @%s", clock.asString(this.elapsed_total), m_buffer);
        this.io(m_buffer);
        m_dirty = false;
    }

//serialization:
    this.load = function(opts)
    {
        var stream = new YalpStream(opts.filename);
        for (;;)
        {
            var evt = stream.read();
            if (!evt) break;
            m_evts.push({fxfunc: evt.fxfunc, time: evt.time});
        }
    }

    this.save = function(opts)
    {
        var stream = new YalpStream(opts.filename);
        m_evts.forEach(function(evt, inx)
        {
            stream.write(evt.fxfunc, evt.time);
        });
        stream.write();
    }

//playback control:
    this.playback = function(opts)
    {
        for (var i in opts) m_opts[i] = opts[i];
        m_dirty = false; //CAUTION: set this before init()
        this.cancel();
        if (!m_opts.immediate || opts.first_init)
        {
            console.log("playback started @%s, immed? %s", clock.Now.asString(), m_opts.immediate);
            m_started = m_loopstart = clock.Now();
            init();
        }
        if (m_opts.immediate) return; //{ init(); return } //ignore; already running
        if (!m_evts.length) throw "No display events aka cues aka storyboard";
//        m_selected = 0;
        next(true);
    }

    var init = function() { if (typeof m_opts.color !== 'undefined') this.fill(m_opts.color); }.bind(this);
    this.cancel = function()
    {
        console.log("cancel @%s: pending? %s, persist? %s, dirty? %s", clock.asString(this.elapsed_total), m_pending, m_opts.persist, m_dirty);
        if (m_pending) clearTimeout(m_pending); //prevent next deferred func from executing
        m_pending = null;
        if (!m_opts.persist) init(); //reset to start state
        this.flush();
    }

    var enque = function(fx, duration)
    {
        fx = fx.bind(this, Array.from/*prototype.slice.call*/(arguments).slice(1)); //pass extra params to callback, make sure "this" is set
        if (duration < 0) console.log("%s is overdue by %s", fx, clock.asString(-duration));
        if (m_opts.immediate /*this.isRunning*/) fx(); //execute immediately
        else { m_evts.push({fxfunc: fx, time: this.elapsed_queue + (duration || 0)}); this.elapsed_queue += duration || 0; } //exec later
        return this; //allow chaining
    }.bind(this);

    var next = function(reset) //execute next display event
    {
        if (reset) m_selected = 0;
//        console.log("next[%d] @%s, immed? %s, eof? %s, time %d, isdue? %s", m_selected, clock.asString(this.elapsed_total), m_opts.immediate, this.iseof, !this.iseof? m_evts[m_selected].time: -1, !this.iseof? isdue(m_evts[m_selected].time): -1);
        if (m_opts.immediate) return; //|| this.isRunning) return;
        if (this.iseof) { this.cancel(); return; }
        if (!m_selected) m_loopstart = clock.Now(); //reset elapsed time
        var evt = m_evts[m_selected++];
//        console.log("next[%d] @%s @%s: isdue? %s, delay %d", m_selected, this.elapsed_total, this.elapsed_loop, isdue(evt.time), evt.time - this.elapsed_loop);
        if (isdue(evt.time)) { m_pending = false; process.nextTick(evt.fxfunc); } //{ eval.call(this, evt.fxfunc); }.bind(this)); //execute "immediately"; avoid recursion
        else m_pending = setTimeout(evt.fxfunc, evt.time - this.elapsed_loop);
        if (this.iseof && (m_opts.loop !== true)) --m_opts.loop;
//        if (this.iseof) console.log("next@eof: loop %d", m_opts.loop);
        if (!this.iseof || !m_opts.loop) return; //not eof
        m_selected = 0; //rewind
//        init(); ??
    }.bind(this);

    if (m_opts.immediate) this.playback({first_init: true});
}


//generic objects:

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
        var ctlr = new ChannelGroup(
        {
            adrs: m_adrs++,
            startch: opts.startch || m_numch,
            numch: opts.numch || 16, //(opts.w || 1) * (opts.h || 1),
            get buf() { return ctlr.buf? ctlr.buf: ctlr.buf = this.buf.slice(ctlr.startch, ctlr.numch)}});
        });
        if (opts.startch > m_numch) m_numch = opts.startch;
        m_numch += ctlr.numch;
        m_allinst.push(ctlr);
        return ctlr;
    }
    this.all = function(cb) { m_allinst.forEach(function(ctlr, inx) { cb(ctlr, inx); }); }
}


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


//ports, hw assignments:

var FTDI_y = new ChannelPool();
var FTDI_g = new ChannelPool();
var FTDI_b = new ChannelPool();
var FTDI_w = new ChannelPool();

HW.Serial.enum();
HW.Serial.assign(FTDI_y, { device: '/dev/ttyUSB0', baud: 242500, bits: '8N1', fps: 20 });
HW.Serial.assign(FTDI_g, { device: '/dev/ttyUSB1', baud: 242500, bits: '8N1', fps: 20 });
HW.Serial.assign(FTDI_b, { device: '/dev/ttyUSB2', baud: 242500, bits: '8N1', fps: 20 });
HW.Serial.assign(FTDI_w, { device: '/dev/ttyUSB3', baud: 242500, bits: '8N1', fps: 20 });

//props aka models, channel assignments:

//var test_strip = new Actor(); //{immediate: true});
var test_strip = new Rect2D({w: 10, h: 1, type: RenXt.WS2811(RenXt.SERIES), port: FTDI_y});
var Rect16x16 = new Rect2D({w: 16, h: 16, type: RenXt.WS2811(RenXt.SERIES), port: FTDI_y});
var placeholder1 = new Rect2D({port: FTDI_y});
var GdoorL = new Rect2D({w: 24, h: 16, type: RenXt.WS2811(RenXt.SERIES), port: FTDI_y});
var GdoorR = new Rect2D({w: 24, h: 16, type: RenXt.WS2811(RenXt.SERIES), port: FTDI_y});
var Gdoor = new Rect2D({w: 48, h: 16, stch: GdoorL.stch, type: RenXt.WS2811(RenXt.SERIES), port: FTDI_y}); //overlay
var Cols = new Rect2D({w: 3, h: 50, type: RenXt.WS2811(RenXt.PARALLEL), port: FTDI_y});


//fx test:

test_strip
    .fill(0xFF0000)
    .wait(1000)
    .fill(0x0000FF)
    .wait(1000)
    .pixel(0, 0x111111)
    .pixel(1, 0x222222)
    .pixel(2, 0x333333)
    .pixel(3, 0x444444)
    .wait(500)
    .save('../tmp/stream2.yalp')
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
