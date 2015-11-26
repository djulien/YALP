//YALP object stream

'use strict'; //helps catch errors

var fs = require('fs');
var path = require('path');
//var objectstream = require('objectstream'); //https://www.npmjs.com/package/objectstream
var Concentrate = require('concentrate'); //https://github.com/deoxxa/concentrate
var Dissolve = require('dissolve'); //https://github.com/deoxxa/dissolve
var UInt32BEBuffer = require('my-plugins/streamers/uint32bebuf');

function abspath(relpath) { return relpath; } //fs.realpathSync(relpath); } //only works for existing files; //path.join(process.cwd(), relpath); } //TODO: is this needed?


module.exports = YalpStream;

function YalpStream(opts)
{
    if (!(this instanceof YalpStream)) return new YalpStream(opts)
    if (typeof opts !== 'object') opts = {filename: opts};

    var m_info = {latest: 0, frames: 0, totlen: 0};
//    var m_objstream = objectstream.createSerializeStream(fs.createWriteStream(abspath(opts.filename), {flags: 'w'}));
    var m_stream = null; //fs.createWriteStream(abspath(opts.filename), {flags: 'w'});

    this.write = function(bytes, timestamp)
    {
        if (!arguments.length) //eof
        {
            if (!m_stream) return 0;
//            bytes = new /*Array*/Buffer(m_info); //Uint8Array(m_info);
            bytes = new UInt32BEBuffer(3);
            bytes.val(0, m_info.latest);
            bytes.val(1, m_info.frames);
            bytes.val(2, m_info.totlen);
//            console.log("bytes type ", typeof bytes);
            bytes = bytes.buf; //temp kludge for Buffer not inheritable
            return m_stream.end(fmt(-1 >>> 0, bytes));
        }
        if (!m_stream) m_stream = fs.createWriteStream(abspath(opts.filename), {flags: 'w'});
//var log = fs.createWriteStream('nodelogger.txt', {flags: 'a', encoding: 'utf-8',mode: 0666});
        if (typeof timestamp === 'undefined') timestamp = m_info.frames? m_info.latest + (opts.interval || 50): opts.start || 0;
        if (bytes instanceof UInt32BEBuffer) bytes = bytes.buf; //temp kludge for Buffer not inheritable
//        console.log("bytes type ", bytes);
//        if (!bytes.copy) console.log("no copy");
//        if (!bytes.length) console.log("no length");
        ++m_info.frames;
        m_info.totlen += bytes.length + 2 * 4;
        m_info.latest = timestamp;
//        return m_stream.write({ time: timestamp, data: bytes, len: bytes.length });
        return m_stream.write(fmt(timestamp, bytes));
    }

    this.playback = function()
    {
        m_stream = fs.createReadStream(abspath(opts.filename), {flags: 'r'});
        m_stream.read(
    }

    function fmt(timestamp, bytes)
    {
        var retval = Concentrate()./*uint32be(0x57414C50).*/string("YALP", "utf8").uint32be(timestamp).uint32be(bytes.length).buffer(bytes).result();
//        console.log("fmt[%d]: %d", timestamp, retval.length, retval);
        return retval;
    }
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
    var m_buffer = m_opts.buffer || new /*Array*/Buffer(m_opts.numch || 16); //CAUTION: assumed to be a multiple of 4 bytes; //, m_count = Math.floor(m_buffer.length / 4);
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
            console.log("fill @%s: %d nodes with #%s", clock.asString(this.elapsed_total), m_buffer.length / 4, color.toString(16));
            for (var n = 0; n < /*m_count m_opts.numch*/ m_buffer.length; /*++n*/ n+= 4) m_nodes.setUint32(n, color); //CAUTION: byte offset, not uint32 offset
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


//eof
