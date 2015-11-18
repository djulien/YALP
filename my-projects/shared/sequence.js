//YALP Sequence base class

'use strict'; //help catch errors

var glob = require('glob');
var path = require('path');
var inherits = require('inherits');
var makenew = require('my-plugins/utils/makenew');
var caller = require('my-plugins/utils/caller').stack;
var mp3len = require('my-plugins/utils/mp3len');
//var clock = require('my-plugins/utils/clock');
//var Elapsed = require('my-plugins/utils/elapsed');
var shortname = require('my-plugins/utils/shortname');
var add_method = require('my-plugins/my-extensions/object-enum').add_method;
var CueListMixin = require('my-projects/shared/cuelist').CueListMixin;
var Cue = require('my-projects/shared/cuelist').Cue;
var ChannelPool = require('my-projects/models/chpool');
//var SequenceExtend = require('my-projects/shared/my-custom').SequenceExtend; //my-models');

function isdef(thing) { return (typeof thing !== 'undefined'); }
add_method(Array.prototype, 'push_ifdef', function(newval) { if (isdef(newval)) this.push(newval); });

module.exports = Sequence;


function Sequence(opts)
{
//    console.log("seq args", arguments);
    if (!(this instanceof Sequence)) return makenew(Sequence, arguments);
    var add_prop = function(name, value, vis) { if (!this[name]) Object.defineProperty(this, name, {value: value, enumerable: vis !== false}); }.bind(this); //expose prop but leave it read-only
    this.debug = function() { debugger; }

    add_prop('isSequence', true);
    add_prop('opts', (typeof opts !== 'object')? {name: opts}: opts || {}); //preserve unknown options for subclasses
//    console.log("seq opts %j", this.opts);
    add_prop('folder', this.opts.folder || path.dirname(caller(1, __filename))); //allow caller to override auto-collect folder in case sequence is elsewhere
    console.log("seq folder", this.folder);
    this.name = this.opts.name || shortname(this.folder); //caller(2)));
    if (isdef(this.opts.latency)) this.latency = this.opts.latency; //default 230 msec audio delay; TODO: try to calculate this based on bitrate + framesize?
//    console.log("seq latency opts %s", this.latency);

    var m_media = [];
    Object.defineProperty(this, 'media', //let caller set it, but not directly
    {
        get: function() { return m_media; },
        set: function(newval) { (Array.isArray(newval)? newval: [newval]).forEach(function(pattern) { this.addMedia(pattern); }.bind(this)); },
        enumerable: true,
    });
    var m_duration = 0;
    Object.defineProperty(this, 'duration', { enumerable: true, get: function()
    {
//        if (m_duration) return m_duration;
//        m_duration = 0;
//        m_media.forEach(function(media) { m_duration += media.duration; });
//        this.ResetCue(m_duration);
        return m_duration;
    }});
    this.addMedia = function(pattern)
    {
//        debugger;
        var where;
        var oldcount = this.media.length;
//        console.log("old media %d", this.media.length, this.media.length? this.media[0]: null);
//path.dirname(opts.dirname)
        glob.sync(where = pattern || path.join(this.folder, '**', '!(*-bk).{mp3,mp4,wav,ogg,webm}')).forEach(function(filename)
        {
            filename = require.resolve(filename);
            var info = this.get_duration(filename);
            console.log("adding media[%s] %s", m_media.length, filename, "media info", info, "seq already has? %s", isdef(this.latency));
            if (!isdef(this.latency) /*m_media.length*/) this.latency = info.latency; //isdef(this.opts.latency)? this.opts.latency: info.latency;
            m_media.push({filename: filename, duration: 1000 * info.audiolen, latency: info.latency});
            if (opts.use_media_len /*!== false*/) m_duration += medialen;
//            console.log("latency", this.latency, this.opts.latency, this.media[0].latency);
        }.bind(this));
//        console.log("old count %d, new %d, latest ", oldcount, this.media.length, this.media.slice(-1)[0]);
        if (this.media.length > oldcount + 1) throw "Multiple files found at '" + where + "' ";
        if (this.media.length == oldcount) throw "Can't find media at '" + where + "'";
        return this; //fluent
    }

    var m_cues = [];
    Object.defineProperty(this, 'cues',
    {
        get: function() { return m_cues; },
        set: function(newval) { (Array.isArray(newval)? newval: [newval]).forEach(function(cue) { this.addCue(cue); }.bind(this)); },
        enumerable: true,
    });
    this.addCue = function(newcue)
    {
        console.log("add cue %j", newcue);
        m_cues.push(new Cue(newcue));
        if (!opts.use_media_len)
        {
            var last_cue = m_cues.slice(-1)[0];
//            if (cue_end && !m_cuemax) process.nextTick(function() { m_duration = m_cuemax; }); //wait until all cues + media loaded
            m_duration = Math.max(m_duration, last_cue.to || last_cue.from);
        }
        return this; //fluent
    }

    this.unpend = this.pend = function() { console.log("TODO: pend".red); }

//    if (this.opts.extend) this.opts.extend(this); //do this after prototype is completely defined
    if (this.opts.auto_collect === false) return;
    this.addMedia();
    this.addCues();
    console.log("TODO: auto-collect cues, models? at %s", this.folder);
}
inherits(Sequence, CueListMixin); //mixin class


/*
//load generic models:
var ChannelPool = require('my-projects/models/chpool');
var Model = require('my-projects/models/model').Model;
//apply customization:
require('my-projects/my-models');
//force channel buffers/pools to be allocated, set to known value:
var m_portbufs = {};
ChannelPool.all.forEach(function(chpool, inx)
{
debugger;
    m_portbufs[chpool.name] = chpool.buf;
    console.log("chpool %s buf len %d", chpool.name, chpool.buf.length);
    chpool.buf.fill(0); //start with all channels off
});
*/


Sequence.prototype.get_duration = function(filename)
{
    var latency = 230; //TODO: calculate latency based on sample and bit rates and frame size
    switch (path.extname(filename))
    {
        case '.mp3': return {audiolen: mp3len(filename), latency: latency};
        default: throw "Don't know how to get duration of " + path.extname(filename) + " file";
    }
}

//render frames on demand:
//generic implementation
Sequence.prototype.render = function(frtime)
{
    var portbufs = {}, rawbufs = {}, hasbuf = false, hasraw = false;
    var frnext_min = this.duration; //assume no further frames are needed (no animation); //(this.FixedFrameInterval)? frtime + this.FixedFrameInterval: this.duration;
//check each port for pending output and next refresh time:
    ChannelPool.all.forEach(function(chpool, inx, all)
    {
//        chpool.models.forEach(function(model, inx, all)
//        {
//            var frnext = model.render(frtime); //tell model to render new output
//            if (frnext < frnext_min) frnext_min = frnext;
//        });
        var portbuf = chpool.render(frtime); //{frnext, buf}
        if (!portbuf) return; //continue;
        if (portbuf.buf) { portbufs[chpool.name] = portbuf.buf; hasbuf = true; }
        if (portbuf.rawbuf) { rawbufs[chpool.name] = portbuf.rawbuf; hasraw = true; }
//        portlens[chpool.name] = portbuf.buf.length; //kludge: buf length gets dropped somewhere, so pass it back explicitly
//        if (portbuf.frnext === false) return; //no further animation wanted
//        if (portbuf.frnext === true) portbuf.frnext = frtime + ?; //asap; //this.duration; //one more update at end of seq
        if (typeof portbuf.frnext !== 'number') return;
        frnext_min = Math.min(frnext_min, portbuf.frnext); //set next animation frame time
    });
    return {frnext: frnext_min, outbufs: hasbuf? portbufs: null, rawbufs: hasraw? rawbufs: null}; //, outlens: hasbuf? portlens: null};
}


Sequence.prototype.xrender = function(frtime)
{
//    if (!this.buffers) //alloc alternating buffers to support dedup
//    ChannelPool.all.forEach(function(chpool, inx) { chpool.buf.fill(Math.floor(frtime / this.FixedFrameInterval)); });
//    return {frnext: frtime + this.FixedFrameInterval, bufs: m_portbufs, dirty: true};
    throw "Override Sequence.render() with real logic";
//    return {frnext: this.duration, bufs: frtime? m_portbufs: null, dirty: !!frtime};

//console.log("seq.render: fixed int %s, isseq %s", this.fixedInterval, this instanceof Sequence);
/*
    if (this.fixedInterval)
    {
        var nextfr = frtime + this.fixedInterval;
        var buflen = this.vix2.getFrame(Math.floor(frtime / this.fixedInterval), buf);
        buf = buf.slice(0, buflen);
    }
*-/
    var dirty = !frtime || !this.prevbuf || bufdiff(this.prevbuf, buf); //this.prevbuf.compare(buf);
    this.prevbuf = buf;
/-*TODO
    var cue = this.findCue(frtime, Sequence.prototype.render.prevcue); //{name, from, to, text, src}
    if (cue) this.applyFx(cue, buf);
    switch (cue.text || '??')
    {
        case "fx:one": buf.fill(1); break;
        case "fx:two": buf.fill(2); break;
        case "fx:three": buf.fill(3); break;
        case "fx:four": buf.fill(4); break;
        case "fx:init": buf.fill(0); break; //initial state
        default: return null;
    }
//    buf.fill(0);
    var frdata = {frnext: frtime + .500}, used = 0;

    for (var i = 0; i < 4; ++i)
    {
        var len = Math.floor((buf.length - used) * Math.random()); //TODO
        var portbuf = buf.slice(used, used + len); used += len;
        portbuf.fill(0x11 * (i + 1)); //TODO
        frdata['port' + i] = portbuf;
    }

    return frdata; //{frnext: frtime + .500, port#: buf};

    return {frnext: nextfr, rawbuf: dirty? buf: undefined, dirty: dirty}; //frtime + .500, port#: buf};
*/
}

//var SequenceMixin = require('my-projects/my-models');
//if (SequenceMixin) SequenceMixin(Sequence); //do this after prototype is completely defined


//eof
