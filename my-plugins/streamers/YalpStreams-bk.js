//YALP object streams:
//YalpSource is a time-controlled frame reader (playback) stream
//YalpSink is a writable stream for use as a final destination
//YalpXform is a reader-writer stream to apply a transformation

//TODO: use stream-json?
//TODO: merge Source + Sink into Xform so one base class can handle either direction? (this would allow common base logic)

'use strict'; //helps catch errors

require('colors');
var fs = require('fs');
var path = require('path');
var glob = require('glob');
var Q = require('q'); //https://github.com/kriskowal/q
var inherits = require('inherits');
var inherits_etc = require('my-plugins/utils/class-stuff').inherits_etc;
var allow_opts = require('my-plugins/utils/class-stuff').allow_opts;
var caller_exports = require('my-plugins/utils/class-stuff').caller_exports;
var bufdiff = require('my-plugins/utils/buf-diff');
var MruArray = require('my-plugins/utils/mru-array');
/*var sprintf =*/ require('sprintf.js'); //.sprintf; //, vsprintf = require('sprintf-js').vprintf;
var clock = require('my-plugins/utils/clock');
var Elapsed = require('my-plugins/utils/elapsed');
var makenew = require('my-plugins/utils/makenew');
require('my-plugins/my-extensions/object-enum');
var stream = require('stream');
var Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
var Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html
var Transform = stream.Transform || require('readable-stream').Transform;

function abspath(relpath) { return relpath; } //doesn't seem to be needed; //fs.realpathSync(relpath); } //only works for existing files; //path.join(process.cwd(), relpath); } //TODO: is this needed?


//easier access to last element in array:
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



///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//object "cache":
//Streams only transport string or buffer data types.
//For data already in process memory, serialize/deserialize is extra needless overhead.
//This object is used to pin a reference to binary data that is to be sent back and forth.
//Passing a reference thru the stream interfaces is much lower overhead (especially for larger binary structures).
//However copy-on-write semantics are needed if the data is used elsewhere.
//var obj_cache = {key: 0xF00D0000};
//module.exports.YalpCache = obj_cache; //TODO: allow outside to see it?

//light-weight object wrapper to make it more easily recognizable in serialized format
//use ctor to create ref, func call to deref
//NOTE: not exposed to outside
function YalpRef(opts, keep)
{
    if (!YalpRef.all) { YalpRef.all = {}; YalpRef.next_key = 0xF00D0000; } //NOTE: needs to be static to be excluded from serialization
    if (!(this instanceof YalpRef)) //return makenew(YalpRef, arguments);
    {
//        console.log("deserialize-1 ", typeof opts, "isbuf? " + Buffer.isBuffer(opts), opts);
        if (Buffer.isBuffer(opts)) opts = new Buffer(opts);
//        console.log("deserialize-2 ", typeof opts, "isstr? " + (typeof opts == 'string'), opts);
        opts = JSON.parse(opts);
//        console.log("deserialize-3 ", typeof opts, opts);
////        var matches = (typeof opts == 'string')? opts.match(/^{"key":([0-9]+)}$/): [];
////        console.log("deserialize-3 key ", matches);
        var retval = YalpRef.all[opts.objref || 'nothing'];
        /*if (!keep)*/ if (typeof retval != 'undefined') delete YalpRef.all[opts.objref]; //tidy up shared data
        return retval; //return caller's data if found
    }
    this.objref = YalpRef.next_key++; //assign unique key
    YalpRef.all[this.objref] = opts; //arguments; //hang on to caller's data, but not directly within this object
}


//TODO: make yalp2yalp automatic (source needs to send callback info downstream so destination can tell it to do this)
//NOTE: feedback loop can be done this way as well
//TODO: actually, if next stage is a Yalp stream anyway, just call onFrame directly
function serialize(data, want_strline, yalp2yalp)
{
    if ((typeof data == 'string') || Buffer.isBuffer(data)) return data; //okay to send as-is
//stream will only accept string or buffer
//        if (('want_strline' in this.opts) && (typeof data != 'string') && !Buffer.isBuffer(data))
//        {
//            data = JSON.stringify(data) + (this.opts.want_strline? '\n': ''); //to string; new Buffer(retval); //convert to buffer each time instead of preallocating so it can be released each time
////            data = 'STR[@' + this.elapsed.now + ']:' + data.slice(0, -1) + ", eof? " + is_last_frame + "\n";
//        }
    if (yalp2yalp) data = new YalpRef(data); //replace data with wrapper + key
    data = JSON.stringify(data) + (want_strline? '\n': ''); //to string; //new Buffer(retval); //convert to buffer each time instead of preallocating so it can be released each time
//    console.log("serialize yalpref", typeof data, data); //.prototype.constructor.name);
    return data;
}


function deserialize(chunk, encoding)
{
//    if (chunk instanceof YalpRef) return chunk.deref();
    var retval = YalpRef(chunk);
//    console.log("deserialized yalp ref", typeof chunk, retval); //.prototype.constructor.name);
    if (typeof retval != 'undefined') return retval;
//fall back to manual reconstruction if YalpRef not found:
//    console.log("deserialize non-yalp ref", typeof chunk, chunk); //.prototype.constructor.name);
//    var buffer = Buffer.isBuffer(chunk) ? chunk : new Buffer(chunk, encoding); //convert string to buffer if needed
//NOTE: assumes objectMode, so object is not broken up
    var frdata = JSON.parse(chunk); //NOTE: incoming data had to be serialized, so it must be deserialized here
    var had_newline = (chunk.slice(-1) === '\n')? '\n': '';
    if (frdata.data) //try to reconstruct data/buffer; format varies
    {
//TODO: replace this with JSON reviver?
        switch (frdata.data.type || '(none)')
        {
            case 'Buffer':
//                console.log("try rebuild buf", JSON.stringify(frdata.data).slice(0, 100));
                var rebuilt = new Buffer(frdata.data, encoding);
//                console.log("rebuilt buf", rebuilt);
                frdata.data = rebuilt;
                break;
            case '(none)':
//                console.log("no type, leave as-is", JSON.stringify(frdata.data).slice(0, 100));
                break;
            default:
//                console.log("unhandled data type: %s", frdata.data.type);
//                console.log("try rebuild ", frdata.data.type, JSON.stringify(frdata.data).slice(0, 100));
                var rebuilt = JSON.parse(frdata.data);
//                console.log("rebuilt %s", frdata.data.type, rebuilt);
                frdata.data = rebuilt;
                break;
        }
    }
//    var buffer = !Buffer.isBuffer(chunk)? new Buffer(chunk, encoding): chunk;
//    console.log("buffer#" + this.processed, buffer);
//    chunk.toString();
//    var buf = '';
//    for (var i in frdata.data) buf += ', ' + typeof frdata.data[i] + ' ' + i;
//        if (buf && !isdef(buf.length)) buf.length = buf.data.length; //kludge: repair buffer (type changed somewhere along the way, maybe during socketio)
//    console.error("processed rec# %s, enc %s, frtime %s, frnext %s, data ", this.processed, encoding, !isNaN(frdata.frtime)? frdata.frtime: 'huh?', !isNaN(frdata.frnext)? frdata.frnext: 'huh?', Buffer.isBuffer(frdata.data)? 'buffer len ' + frdata.data.length: frdata.data? (typeof frdata.data) + ' ' + frdata.data: '(no data per se)'); //buf.data? buf.data.length: 'none'); //typeof chunk, chunk.slice(0, 180), "frtime ", chunk.frtime || 'huh?');
//    console.error(typeof buf, buf, buf.frtime || 'huh?');
//    if (Buffer.isBuffer(frdata.data)) { frdata.data = frdata.data.slice(0, 10); frdata.trunc = true; chunk = JSON.stringify(frdata); }
    return frdata;
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//time-controlled frame reader stream:
//options (implemented):
// yalp2yalp: (default off) bypass expensive serialization/deserialization; can only be used if next stage in pipeline is an in-process YalpStream (xform or sink)
// dedup: (default off) don't send frames with duplicated data; NOTE: can't be used if destination requires consistent repeating updates
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
    Readable.apply(this, arguments); //base class ctor
    this.opts = Object.assign({}, YalpSource.DefaultOptions, (typeof opts == 'string')? {name: opts}: opts || {}); //expose unknown options to others
    this.speed = (this.opts.speed === true)? 1.0: (this.opts.speed > 0)? this.opts.speed: 0; //start free-flowing mode (timed)
//    if (this.opts.auto_export && this.opts.name) caller_exports(+1)[this.opts.name] = this;
//    this.tslop = this.opts.tslop || 2.5;
    this.timing_perf = this.opts.want_stats? new MruArray({limit: 200, bucketsize: 5}): {note: "option off", push: function(){}}; //10 sec @20 FPS
    if (this.opts.name) YalpSource.all.push(this);

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
//            m_frames.forEach(function(frame, inx) { frame.sort_inx = inx; }); //help frames find themselves within list
            var previous = m_frames[0];
            m_frames.forEach(function(frame, inx) //dedup, set up links for auto frnext
            {
                if (!inx) return; //continue; //skip first entry; loop runs one behind
                if (this.opts.dedup && Buffer.isBuffer(frame.data) && !bufdiff(previous.data, frame.data)) { frame.next_inx = -1; return; } //continue; //skip duplicate
                previous.next_inx = inx; //this entry is "next" for previous entry
                previous = frame;
            }.bind(this));
            previous.next_inx = null; //no next on last entry
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
        else m_selected = m_frames[m_selected].next_inx; //++m_selected; //next; skip dups
//TODO: is it better to skip dups or just flag them?
        if (m_selected === null /*>= m_frames.length*/) { this.elapsed.pause(); return null; } //eof; don't auto-rewind
//        if (m_selected === null) console.log("eof: ", typeof m_frames[m_selected]);
//TODO: insert stats at end?
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
//        if (this.opts.want_stats) m_frames.push(this.timing_perf);
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
        var retval = (m_frames[that.next_inx] || {}).frtime;
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
//module.exports.test = console;
//console.log("exps-1 ", Object.keys(module.exports));
inherits_etc(YalpSource, Readable); //, module.exports);
//console.log("exps-2 ", Object.keys(module.exports));
//module.exports.YalpSource = YalpSource;
//console.log("exps-3 ", Object.keys(module.exports));


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
        data = serialize(data, this.opts.want_strline, this.opts.yalp2yalp);
//        if ((typeof data != 'string') && !Buffer.isBuffer(data))
//        if (('want_strline' in this.opts) && (typeof data != 'string') && !Buffer.isBuffer(data))
//        {
//            data = JSON.stringify(data) + (this.opts.want_strline? '\n': ''); //to string; new Buffer(retval); //convert to buffer each time instead of preallocating so it can be released each time
////            data = 'STR[@' + this.elapsed.now + ']:' + data.slice(0, -1) + ", eof? " + is_last_frame + "\n";
//        }
    }
    var retval = this.push(data); //NOTE: only string or buffer can be sent
    if (this.speed && is_last_frame) this.emit('my-end', this.timing_perf); //this.push(null); //send eof and close pipe
//TODO: if (is_last_frame) send stats?
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


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//stream transform:
//source controls timing; as long as transform doesn't take too long to process then it will preserve that timing
function YalpXform(opts) //{}
{
    if (!(this instanceof YalpXform)) return makenew(YalpXform, arguments);
//    if (typeof opts == 'object')? opts = {param: opts};
//    opts.objectMode = true;
//    var args = Array.from(arguments);
//    args[0] = opts;
    this.objectMode = true; //one read/write per record on binary data (ignores length)
    Transform.apply(this, arguments); //base class ctor

    this.opts = Object.assign({}, YalpXform.DefaultOptions, (typeof opts == 'string')? {name: opts}: opts || {}); //expose unknown options to others
//    if (this.opts.auto_export && this.opts.name) caller_exports(+1)[this.opts.name] = this;
    if (this.opts.name) YalpXform.all.push(this);
}
inherits_etc(YalpXform, Transform); //, module.exports);


YalpXform.prototype._transform = function(chunk, encoding, done)
{
//    throw "YalpXform._transform TODO: process chunk, push result, call done";
//    this.push(chunk);
//    done();
    var frdata = deserialize(chunk, encoding);
    this.emit('frame', frdata); //TODO: keep this?
    frdata = this.onFrame(frdata);
    if (frdata === null) { done(); return; } //nothing to send back this time
    this.push(serialize(frdata, this.opts.want_strline, this.opts.yalp2yalp)); //"chunk#" + this.processed + "\n");
    done();
}
YalpXform.prototype.onFrame = function(data)
{
    throw "YalpXform.onFrame TODO: override this";
    return data;
}
/*
xform.on('frame-in', function(frdata)
{
    if (Buffer.isBuffer(frdata.data))
    {
        frdata.data = frdata.data.slice(0, 10); //extract first 10 channel bytes
        frdata.trunc = true;
    }
    this.emit('frame-out', frdata);
});
*/


YalpXform.prototype._flush = function(done)
{
    var frdata = this.onFrame(null);
    if (frdata !== null) this.push(serialize(frdata, this.opts.want_strline, this.opts.yalp2yalp)); //"chunk#" + this.processed + "\n");
    done(); //need to call this even if no data
//    throw "YalpXform._flush TODO: finish processing last chunk, push result, call done"; //assume 1:1 for now
//     if (this._lastLineData) this.push(this._lastLineData)
//     this._lastLineData = null
//    console.error("processed %d recs", this.processed || 'none');
//    this.push("last_piece");
//    done();
}

/*
var xform = new YalpXform();
xform._transform = function(frdata, encoding, done)
{
    if (frdata.frtime >= 0)
    {
        ++this.processed;
        frdata.inbuflen = frdata.data.length;
        frdata.outbuflen = 3;
        frdata.data = frdata.data.slice(0, 3);
    }
    else ++this.passthru;
    this.push(frdata);
    done();
}
xform._flush = function(done)
{
    console.error("xform: %s records processed, %s skipped", this.processed || 'NO', this.passthru || 'NO');
    done();
}
xform.on('readable', function()
{
     var line
     while (null !== (line = xform.read())) {
          // do something with line
     }
});
*/


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//stream splitter:
//source controls timing; as long as transform doesn't take too long to process then it will preserve that timing
function YalpSplitter(opts) //{firstch, numch, altch, dedup}
{
    if (!(this instanceof YalpSplitter)) return makenew(YalpSplitter, arguments);
    YalpXform.apply(this, arguments); //base class ctor

    this.opts = Object.assign({}, YalpSplitter.DefaultOptions, (typeof opts == 'string')? {name: opts}: opts || {}); //expose unknown options to others
//    if (this.opts.auto_export && this.opts.name) caller_exports(+1)[this.opts.name] = this;
    if (typeof this.opts.altch == 'undefined') this.opts.altch = null; //a little faster check
    this.stats = {dedup: 0, altdiff: 0, count: 0, numbuff: 0};
    if (this.opts.name) YalpSplitter.all.push(this);
    this.previous = null; //NOTE: used for dedup and current value retention
}
inherits_etc(YalpSplitter, YalpXform); //, module.exports);


YalpSplitter.prototype.onFrame = function(frdata)
{
//    console.error("splitter frame".cyan, this.stats.count, frdata); //(frdata !== null)? frdata.frtime: 'eof', (frdata !== null)? Buffer.isBuffer(frdata.data): '!buf');
    ++this.stats.count;
    if ((frdata !== null) && Buffer.isBuffer(frdata.data))
    {
        ++this.stats.numbuff;
        var mydata = frdata.data.slice(this.opts.firstch || 0, (this.opts.firstch || 0) + (this.opts.numch || 1));
        if (typeof this.opts.altch != 'undefined')
        {
            var altdata = frdata.data.slice(this.opts.altch, this.opts.altch + (this.opts.numch || 1));
            var cmp = bufdiff(mydata, altdata);
            if (cmp) { ++this.stats.altdiff; this.warn("primary != alt ch vals @%d..%d", Math.abs(cmp), Math.abs(bufdiff.reverse(mydata, altdata))); }
        }
//NOTE: dedup assumes that source buffers are not reused (this is true for Vixen2Sequence)
        if (this.opts.dedup && (this.previous !== null) && !bufdiff(this.previous, mydata)) { ++this.stats.dedup; return null; } //no need to pass this one thru
        this.previous = mydata;
        var newframe = Object.assign({}, frdata); //CAUTON: avoid changing source data in case it needs to go elsewhere
        frdata.data = mydata;
//        console.log("new frame", newframe.frtime, mydata.length, frdata.data.length);
    }
//    console.log("notrim frtime %s", (frdata !== null)? frdata.frtime: '(eof)');
//    if (frdata === null) console.error("splitter stats:".cyan, this.stats);
    if (frdata === null) return this.stats; //eof
    return frdata;
}

//NOTE: leave warn() undefined here so caller is forced to supply it
//YalpSplitter.prototype.warn = function(msg)
//{
//    if (isNaN(++this.stats.warnings)) this.stats.warnings = 1;
//    var args = Array.from(arguments);
//    args[0] = colors.yellow("warning: " + args[0]);
//    console.error.apply(null, args);
//}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//frame writer stream:
//serves as final destination for piped xforms
function YalpSink(opts)
{
    if (!(this instanceof YalpSink)) return makenew(YalpSink, arguments);
    options.objectMode = true;
    Writable.apply(this, options); //base class

    this.opts = Object.assign({}, YalpSink.DefaultOptions, (typeof opts == 'string')? {name: opts}: opts || {}); //expose unknown options to others
//    if (this.opts.auto_export && this.opts.name) caller_exports(+1)[this.opts.name] = this;
    if (this.opts.name) YalpSink.all.push(this);
}
inherits_etc(YalpSink, Writable); //, module.exports);


YalpSink.prototype._write = function(chunk, encoding, done)
{
    throw "YalpSink._write TODO: process chunk, call done";
    var data = deserialize(chunk, encoding);
//TODO: something with data
    done();
}

YalpXform.prototype.onFrame = function(data)
{
    throw "YalpXform.onFrame TODO: override this";
}


//eof
//====================================================================================================
//TODO: merge old stuff:

//var objectstream = require('objectstream'); //https://www.npmjs.com/package/objectstream
var Concentrate = require('concentrate'); //https://github.com/deoxxa/concentrate
var Dissolve = require('dissolve'); //https://github.com/deoxxa/dissolve
var UInt32BEBuffer = require('my-plugins/streamers/uint32bebuf');


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
//        m_stream.read( //TODO
    }

    function fmt(timestamp, bytes)
    {
        var retval = Concentrate()./*uint32be(0x57414C50).*/string("YALP", "utf8").uint32be(timestamp).uint32be(bytes.length).buffer(bytes).result();
//        console.log("fmt[%d]: %d", timestamp, retval.length, retval);
        return retval;
    }
}
//module.exports = YalpStream;


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


/*
//examples from http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html
function MyWritableStream(opts)
{
    if (!(this instanceof MyWritableStream)) return new MyWritableStream(options);
    options.objectMode = true;
    Writable.call(this, options); //base class
//TODO: custom init
}
util.inherits(MyWritableStream, Writable);
MyWritableStream.prototype._write = function (chunk, enc, cb)
{
//TODO: store chunk, then call cb when done
    var buffer = Buffer.isBuffer(chunk) ? chunk : new Buffer(chunk, enc); //convert string to buffer if needed
    cb();
};

//or instantiate directly; see http://stackoverflow.com/questions/21491567/how-to-implement-a-writable-stream
var echoStream = new stream.Writable();
echoStream._write = function (chunk, encoding, done)
{
  console.log(chunk.toString());
  done();
};
//or
ws.write = function(buf) {
   ws.bytes += buf.length;
}
ws.end = function(buf) {
   if(arguments.length) ws.write(buf);
   ws.writable = false;
   console.log('bytes length: ' + ws.bytes);
}

var wstream_prefab = fs.createWriteStream('myOutput.txt', {encoding: whatever});
var wrStream_custom = new MyWritableStream({});

wstream.on('finish', function () { console.log('file has been written'); });
wstream.write(buffer); //binary data
wstream.write(buffer);
wstream.end(); //eof+close
*/


/*
//examples from https://strongloop.com/strongblog/practical-examples-of-the-new-node-js-streams-api/

var stream = require('stream')
var liner = new stream.Transform( { objectMode: true } )

liner._transform = function (chunk, encoding, done) {
     var data = chunk.toString()
     if (this._lastLineData) data = this._lastLineData + data

     var lines = data.split('\n')
     this._lastLineData = lines.splice(lines.length-1,1)[0]

     lines.forEach(this.push.bind(this))
     done()
}

liner._flush = function (done) {
     if (this._lastLineData) this.push(this._lastLineData)
     this._lastLineData = null
     done()
}
*/

//eof
