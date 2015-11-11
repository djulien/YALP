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


var Sequence = module.exports = function(opts)
{
//    console.log("seq args", arguments);
    if (!(this instanceof Sequence)) return makenew(Sequence, arguments);
    var add_prop = function(name, value, vis) { if (!this[name]) Object.defineProperty(this, name, {value: value, enumerable: vis !== false}); }.bind(this); //expose prop but leave it read-only
    this.debug = function() { debugger; }

    add_prop('isSequence', true);
    add_prop('opts', (typeof opts !== 'object')? {name: opts}: opts || {}); //preserve unknown options for subclasses
//    console.log("seq opts %j", this.opts);
    add_prop('folder', this.opts.folder || path.dirname(caller(2))); //allow caller to override auto-collect folder in case sequence is elsewhere
    add_prop('name', this.opts.name || shortname(this.folder)); //caller(2)));

    var m_media = [];
    Object.defineProperty(this, 'media', //let caller set it, but not directly
    {
        get: function() { return m_media; },
        set: function(newval) { (Array.isArray(newval)? newval: [newval]).forEach(function(pattern) { this.addMedia(pattern); }.bind(this)); },
        enumerable: true,
    });
    var m_duration;
    Object.defineProperty(this, 'duration', { enumerable: true, get: function()
    {
        if (m_duration) return m_duration;
        m_duration = 0;
        m_media.forEach(function(media) { m_duration += media.duration; });
        this.ResetCue(m_duration);
        return m_duration;
    }});
    this.addMedia = function(pattern)
    {
//        debugger;
        var where;
        var oldcount = this.media.length;
//        console.log("old media %d", this.media.length, this.media.length? this.media[0]: null);
//path.dirname(opts.dirname)
        glob.sync(where = pattern || path.join(this.folder, '**', '!(*-bk).{mp3,mp4,wav,ogg,webm}')).forEach(function(filename) { filename = require.resolve(filename); console.log("adding media[%s] %s", m_media.length, filename); m_media.push({filename: filename, duration: 1000 * this.get_duration(filename)}); }.bind(this));
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
        m_cues.push_ifdef(new Cue(newcue));
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
    console.log("chpool %s buf len %d", chpool.name, chpool.buf.byteLength);
    chpool.buf.fill(0); //start with all channels off
});
*/


Sequence.prototype.get_duration = function(filename)
{
    switch (path.extname(filename))
    {
        case '.mp3': return mp3len(filename);
        default: throw "Don't know how to get duration of " + path.extname(filename) + " file";
    }
}

//render frames on demand:
//generic implementation
Sequence.prototype.render = function(frtime)
{
    var portbufs = {};
    var frnext_min = (this.FixedFrameInterval)? frtime + this.FixedFrameInterval: this.duration;
    ChannelPool.all.forEach(function(chpool, inx, all)
    {
        chpool.models.forEach(function(model, inx, all)
        {
            var frnext = model.render(frtime); //tell model to render new output
            if (frnext < frnext_min) frnext_min = frnext;
        });
        var portbuf = chpool.render();
        if (portbuf) portbufs[chpool.name] = portbuf;
    });
    return {frnext: frnext_min, bufs: portbufs};
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
        var len = Math.floor((buf.byteLength - used) * Math.random()); //TODO
        var portbuf = buf.slice(used, len); used += len;
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
