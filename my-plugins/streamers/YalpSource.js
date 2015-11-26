
'use strict';

require('colors');
var fs = require('fs');
var glob = require('glob');
var Q = require('q'); //https://github.com/kriskowal/q
var inherits = require('inherits');
var MruArray = require('my-plugins/utils/mru-array');
/*var sprintf =*/ require('sprintf.js'); //.sprintf; //, vsprintf = require('sprintf-js').vprintf;
var clock = require('my-plugins/utils/clock');
var Elapsed = require('my-plugins/utils/elapsed');
var makenew = require('my-plugins/utils/makenew');
var stream = require('stream');
var Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
//var Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html


if (!Array.prototype.last) Object.defineProperty(Array.prototype, 'last',
{
    get() { return this.length? this[this.length - 1]: null; },
    enumerable: true,
});


//read-only collection:
function ReadOnlyArray()
{
    if (!(this instanceof ReadOnlyArray)) return makenew(ReadOnlyArray, arguments);
    Array.apply(this, arguments); //base class
    ['push', 'pop', 'shift', 'unshift', 'splice'].forEach(function(method)
    {
        this[method] = function() { throw "ReadOnlyArray: " + method + " not allowed"; }
    }.bind(this));
}
inherits(ReadOnlyArray, Array)


//time-controlled frame reader stream:
//options (implemented):
// want_strline: (default no) false to convert frame data to string or buffer (needed for readers not using objectMode), true to also add a newline onto stringified frames (easier debug or JSON parsing)
// speed: (default 0) timed playback; <= 0 or false for no timing (non-flowing until consumer pulls data), > 0 for free-flowing: < 1 for slower, 1.0 or true for actual speed, > 1 for faster
// delay: (default 0) how long to wait before starting free-flow (msec)
// tslop: (default 2.5) allowable timing slop +/- (msec)
// want_stats: (default off) emit timing performance stats at end of stream
//options (TODO):
// latency
// loop
// skip
// limit
//CAUTION: defining speed on an unused YalpSource will make it active even if it's not piped
function YalpSource(opts) //{speed, latency, delay, loop, skip, limit, want_strline}
{
    if (!(this instanceof YalpSource)) return makenew(YalpSource, arguments);
//    if (typeof opts == 'object')? opts = {param: opts};
//    opts.objectMode = true;
//    var args = Array.from(arguments);
//    args[0] = opts;
    this.objectMode = true; //one read/write per record on binary data (ignores length)
    Readable.call(this, arguments); //base class ctor
    this.opts = (typeof opts == 'string')? {name: opts}: opts ||{}; //expose unknown options to others
    this.speed = (this.opts.speed === true)? 1.0: (this.opts.speed > 0)? this.opts.speed: 0; //start free-flowing mode (timed)
//    this.tslop = this.opts.tslop || 2.5;
    this.timing_perf = this.opts.want_stats? new MruArray({limit: 200, bucketsize: 5}): {note: "option off", push: function(){}}; //10 sec @20 FPS

    var m_frames;
    var m_dirty = false;
    var m_selected = null;
    var m_header = {frtime: -99, num_frames: 0, max_time: null}; //, get frnext() { get_frnext(this); }};
    init_frames();
    Object.defineProperties(this,
    {
        frames: //allow caller to set or add frames, but with restrictions and fixups
        {
            get() { return m_frames; },
            set(frame)
            {
                init_frames(); //Array.prototype.splice.call(m_frames, 0, m_frames.length); //preserve custom object but replace contents
                if (Array.isArray(frame)) m_frames.push.apply(m_frames, frame);
                else m_frames.push(frame);
            },
            enumerable: true,
        },
        dirty: { get() { return m_dirty; }, enumerable: true}, //read-only
        selected: { get() { return m_selected; }, enumerable: true}, //read-only
    });
    this.rewind = function(sorter)
    {
        console.log("rewind: dirty? %s, #fr to sort %d", m_dirty, m_frames.length);
        if (m_dirty)
        {
            m_frames.sort(sorter || this.sorter); //allow caller to override frame order (optional)
            m_frames.forEach(function(frame, inx) { frame.sort_inx = inx; }); //help frames find themselves within list
//            var buf = '';
//            m_frames.forEach(function(frame, inx) { buf += ', ' + frame.frtime; });
//            console.log("after sort: ", buf.slice(2));
        }
        m_selected = null; //restart iterator
        m_header.num_frames = m_frames.length - 1; //update header before sending; exclude self
//        var last_frame = m_frames.length? m_frames[m_frames.length - 1]: null;
        m_header.max_time = m_frames.last? m_frames.last.frnext || m_frames.last.frtime || 0: null;
        m_header.timestamp = clock.Now.asString();
        m_dirty = false;
        return this; //fluent
    }
    this.next = function(frtime) //get next frame data or null if eof
    {
//        console.log("next: frtime %s, sel %s, m_dirty %s, #fr %d", frtime, m_selected, m_dirty, m_frames.length);
        if (typeof frtime != 'undefined')
        {
            console.log("TODO: bin search for frtime".red);
        }
        if (m_selected === null) //start playback
        {
            if (m_dirty) this.rewind(); //only change order when not iterating
            m_selected = 0; //first (header)
            this.elapsed = new Elapsed(m_frames[0].frtime); //sync elapsed time to first frame
        }
        else ++m_selected; //next
        if (m_selected >= m_frames.length) { this.elapsed.pause(); return null; } //eof; don't auto-rewind
        var retval = m_frames[m_selected];
        if ((m_selected + 1 >= m_frames.length) && (retval.frnext !== null)) retval.frnext = null; //no next frame
//        else if ('frnext_auto' in retval) retval.frnext = m_frames[m_selected + 1].frtime;
//debugger;
//        if (m_selected < 3) console.log("next[%s]: frnext %s %s %s".cyan, m_selected, get_frnext(m_header), get_frnext(m_frames[m_selected]), get_frnext(m_frames[m_selected + 1]));
//        console.log("next ret[%s]: frnext %s %j", m_selected, retval.frnext, retval);
//        console.log("next+1[%s]: frnext %s %j", m_selected + 1, (m_frames[m_selected + 1] || {}).frnext, m_frames[m_selected + 1] || {});
        return retval;
    }
    if (this.speed) //start free-flowing mode (timed)
    {
//        this.elapsed = new Elapsed();
//        console.log("elap %d", this.elapsed.now);
//        var first = this.next(); //start elapsed timer
//        var first = this.next(); //get first frame and start timer
        this.due = (m_frames[0].frtime || 0); //when first frame should be sent; first frame not critical since it's just head, but try to sync anyway
//        this.due = this.elapsed.now + delay; //delay? this.elapsed.now + delay: null; //time of first frame not critical since it's just header info
        var delay = this.opts.delay || 0; //(typeof this.opts.delay == 'number')? this.opts.delay: 0;
        console.log("first delay: %d msec, should occur at %d", delay, this.due); //, m_frames[0].frtime || 0); //, this.due - this.elapsed.now);
        ((delay > 0)? setTimeout: process.nextTick)(function(ignored) { this.send_frame(this.next()); }.bind(this), delay); //don't scale this delay
    }
//    process.nextTick(function() //pre-load first info frame
//    {
//        this.sendout({frtime: -1, num_frames: m_frames.length, max_time: last_frame? last_frame.frnext || last_frame.frtime: null});
//    });

    function init_frames()
    {
        m_frames = new ReadOnlyArray();
        m_frames.push = function(args) { Array.from(arguments).forEach(function(frame) { add_frame(frame); }); return m_frames.length; }
        m_frames.pop = function() { m_dirty = true; return Array.prototype.pop.call(m_frames); }
        m_frames.push(m_header);
    }
    function add_frame(frame)
    {
        if (!frame) return; //continue;
        if (typeof frame != 'object') frame = {data: frame};
    //    Object.defineProperty(frame, 'orig_inx', {value: m_frames.length - 1}); //remember order prior to sort; skip header index
    //    if (!('frtime' in frame)) Object.defineProperty(frame, 'frtime', {value: 0});
        if (!('frnext' in frame)) Object.defineProperty(frame, 'frnext', {get() { return get_frnext(this); }, enumerable: true}); //'frnext_auto', {value: true});
    //    (m_frames[this.sort_inx + 1] || {}).frtime || null;
        Array.prototype.push.call(m_frames, frame);
        m_selected = null; //restart iteration
        m_dirty = true;
    }
    function get_frnext(that)
    {
//        console.log("hdr.frnext: sort %s, ent %j, retval %j", that.sort_inx, m_frames[that.sort_inx + 1], (m_frames[that.sort_inx + 1] || {}).frtime || null);
        var retval = (m_frames[that.sort_inx + 1] || {}).frtime;
        if (typeof retval == 'undefined') retval = null; //CAUTION: preserve 0
        return retval;
    }

/*
    var svlisten = this.once, svemit = this.emit, m_listeners = {};
    this.once = function(evt, cb) //kludge: stream is not emitting end event, so intercept listener and send one manually
    {
        if (!m_listeners[evt]) m_listeners[evt] = [];
        m_listeners[evt].push(cb);
        console.log("hooked in %s listener", evt);
        svlisten.apply(this, arguments);
        return this; //fluent
    }
    this.emit = function(evt, data)
    {
        var args = arguments;
        console.log("calling %s %s listeners", (m_listeners[evt] || []).length, evt);
        (m_listeners[evt] || []).forEach(function(cb) { cb.apply(this, args); }.bind(this));
        svemit.apply(this, arguments);
    }
    process.nextTick(function() { delete this.once; console.log("restored .once"); }.bind(this));
*/
}
inherits(YalpSource, Readable);
module.exports.YalpSource = YalpSource;


YalpSource.prototype.sorter = function(lhs, rhs)
{
    return ((lhs.frtime || 0) - (rhs.frtime || 0)) || ((rhs.data || []).length - (lhs.data || []).length); //primary: frtime asc, secondary: data.length desc (apply "bigger" changes first)
}


YalpSource.prototype._read = function(ignored_size)
{
//    return this.push(asJSON(this.next())); //null => eof
//debugger;
    if (!this.speed) this.send_frame(this.next()); //, true);
}


YalpSource.prototype.warn = function(msg)
{
    if (arguments.length > 1) msg = sprintf.apply(null, arguments);
    var listeners = this.listeners('warn'); //example from https://github.com/stream-utils/unpipe/blob/master/index.js
    if (listeners.length) this.emit('warn', msg.replace(/\x1b\[\d+m/g, "")); //strip color codes
    else console.log(msg);
}


YalpSource.prototype.send_frame = function(data) //, check_type)
{
//    if ((data !== null) && check_type)
//    {
//        this.reader_types();
//        if (this.want_str && (typeof data != 'string')) data = 'STR:' + JSON.stringify(data) + '\n'; //to string; new Buffer(retval); //convert to buffer each time instead of preallocating so it can be released each time
//    }
    var debug = {log: this.warn}; //kludge: force line-stamp extension to tag warnings as well
    if (this.speed) //.due !== null)
    {
        var late = this.elapsed.now - this.due;
        this.timing_perf.push(late);
        if (late < -(this.tslop || 2)) //premature
        {
//            if (!first) data.premature = delay; //for debug and iostats
            /*if (!first)*/ debug.log("frame[%s] premature by %d msec; rescheduling".red, data.frtime, -late);
            debug.log("re-try delay: %d msec", -late);
            setTimeout(function() { this.send_frame(data); }.bind(this), -late); //(re)try later
            return;
        }
        else if (late > (this.tslop || 3)) debug.log("frame[%s] late by %d msec!".red, data.frtime, late);
        else if (late) debug.log("frame[%s] timing is a little off but not too bad: %d msec".yellow, data.frtime, -late);
        else debug.log("frame[%s] timing perfect!".green, data.frtime);
//        var outstatus = (delay < -this.opts.tslop)? "overdue": delay? "not-bad": "good";
        this.due = null; //reset in case eof
    }
    var is_last_frame = (data !== null) && (data.frnext === null); //has data, but nothing follows
    if (this.speed && (data !== null) && (data.frnext !== null)) //schedule next frame; free-flowing mode (timed)
    {
        this.due = data.frnext / this.speed; //+ (this.opts.delay || 0);
        var delay = this.due - this.elapsed.now;
        console.log("next delay: %s - %s = %s msec", this.due, this.elapsed.now, delay);
        ((delay > 0)? setTimeout: process.nextTick)(function(ignored) { this.send_frame(this.next()); }.bind(this), delay);
    }
debugger;
    if (data !== null) //special formatting; CAUTION: do this last, after any other processing that uses props on data
    {
        if (('want_strline' in this.opts) && (typeof data != 'string') && !Buffer.isBuffer(data))
        {
            data = JSON.stringify(data) + (this.opts.want_strline? '\n': ''); //to string; new Buffer(retval); //convert to buffer each time instead of preallocating so it can be released each time
//            data = 'STR[@' + this.elapsed.now + ']:' + data.slice(0, -1) + ", eof? " + is_last_frame + "\n";
        }
    }
    var retval = this.push(data);
    if (this.speed && is_last_frame) this.emit('my-end', this.timing_perf); //this.push(null); //send eof and close pipe
    return retval;
}
//    if (data === null) ; //TODO: kludge: event not occurring so fake it


//function asbuf(data) { return (data !== null)? new Buffer(data): null; }
//function asJSON(data) { return (data !== null)? JSON.stringify(data) + '\n': null; }

YalpSource.prototype.reader_types = function()
{
    var debug = {log: this.warn}; //kludge: force line-stamp extension to tag warnings as well
    if ('want_bin' in this) return;
    this.want_bin = this.want_str = false;
    var listeners = this.listeners('data'); //example from https://github.com/stream-utils/unpipe/blob/master/index.js
    listeners.every(function(listener, inx, all)
    {
        debug.log("listener[%d/%d] %s, obj? %s".blue, inx, all.length, listener.name, listener.objectMode, typeof listener, listener);
        if (listener.name !== 'ondata') return true; //continue;
        if (listener.objectMode) this.want_bin = true;
        else this.want_str = true;
        return !this.want_bin || !this.want_str; //don't need to keep looking once we've found both types
    }.bind(this));
}


//eof
//====================================================================================================

/*
//examples from http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html

var readStream_prefab = fs.createReadStream('myfile.txt');
var readStream_custom = new MyReadableStream({});
var processor = new ExternalProcessor({});

//how to consume:

readStream.pipe(process.stdout);
//or
readStream
    .on('end', function ()
    {
        processor.finish();
    })
//old style:
    .on('data', function (chunk) //use .pause() and .resume() for flow-control
    {
        processor.update(chunk);
    })
//new style:
    .on('readable', function() //data is available to read
    {
        for (;;)
        {
            var chunk = readStream.read();
            if (chunk == null) break;
            processor.update(chunk);
        }
    })
*/


//eof
