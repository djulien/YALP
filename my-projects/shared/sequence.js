//YALP Sequence base class

'use strict'; //help catch errors

var glob = require('glob');
var inherits = require('inherits');
var caller = require('my-plugins/utils/caller').stack;
//var clock = require('my-plugins/utils/clock');
//var Elapsed = require('my-plugins/utils/elapsed');
var shortname = require('my-plugins/utils/shortname');
var add_method = require('my-plugins/my-extensions/object-enum').add_method;
var CueListMixin = require('my-projects/shared/cuelist').CueListMixin;
var Cue = require('my-projects/shared/cuelist').Cue;

add_method(Array.prototype, 'push_ifdef', function(newval) { if (isdef(newval)) this.push(newval); });


var Sequence = module.exports = function(opts)
{
//    console.log("seq args", arguments);
    if (!(this instanceof Sequence)) return setnew(Sequence, arguments);
    var add_prop = function(name, value) { if (!this[name]) Object.defineProperty(this, name, {value: value}); }.bind(this); //expose prop but leave it read-only

    add_prop('opts', (typeof opts !== 'object')? {name: opts}: opts || {}); //preserve unknown options for subclasses
    console.log("seq opts %j", this.opts);
    add_prop('name', this.opts.name || shortname(caller(2)));

    var m_media = [];
    Object.defineProperty(this, 'media', //let caller set it, but not directly
    {
        get: function() { return m_media; },
        set: function(newval) { (Array.isArray(newval)? newval: [newval]).forEach(function(path) { this.addMedia(path); }.bind(this)); },
    });
    var m_duration;
    add_prop('duration', function()
    {
        if (m_duration) return m_duration;
        m_duration = 0;
        m_media.forEach(function(media) { m_duration += media.duration; });
        this.ResetCue(m_duration);
        return m_duration;
    });
    this.addMedia = function(path)
    {
        var where;
        var oldcount = this.media.length;
        const AUDIO_EXTs = 'mp3,mp4,wav,ogg,webm';
        glob.sync(where = path || path.join(path.dirname(caller(2)), '**', '!(*-bk).{' + AUDIO_EXTs + '}')).forEach(function(filename) { console.log("adding media[%s] %s", m_media.length, require.resolve(filename)); m_media.push({filename: require.resolve(filename), duration: 1000 * mp3len(filename)}); }); //.bind(this));
        if (this.media.length > oldcount + 1) throw "Multiple files found at '" + where + "'";
        if (this.media.length == oldcount) throw "Can't find media at '" + where + "'";
        return this; //fluent
    }

    var m_cues = [];
    Object.defineProperty(this, 'cues',
    {
        get: function() { return m_cues; },
        set: function(newval) { (Array.isArray(newval)? newval: [newval]).forEach(function(cue) { this.addCue(cue); }.bind(this)); },
    });
    this.addCue = function(newcue)
    {
        console.log("add cue %j", newcue);
        m_cues.push_ifdef(new Cue(newcue));
        return this; //fluent
    }

    this.debug = function() { debugger; }
}
inherits(Sequence, CueListMixin); //mixin class


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
    chpool.buf.fill(0);
    m_portbufs[chpool.name] = chpool.buf;
});


//render frames on demand:
//generic implementation
Sequence.prototype.render = function(frtime)
{
//    if (!this.buffers) //alloc alternating buffers to support dedup
    ChannelPool.all.forEach(function(chpool, inx) { chpool.buf.fill(Math.floor(frtime / this.FixedFrameInterval)); });
    return {frnext: frtime + this.FixedFrameInterval, bufs: m_portbufs, dirty: true};
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


function isdef(thing)
{
    return (typeof thing !== 'undefined');
}

function setnew(type, args)
{
//    if (this instanceof type) return;
    return new (type.bind.apply(type, [null].concat(Array.from(args))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
}

//eof
