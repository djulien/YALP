//generic Sequence class
'use strict';

var glob = require('glob');
var path = require('path');
var mp3len = require('my-plugins/utils/mp3len');
var Vixen2 = require('my-projects/shared/vixen2');
var timescale = require('my-plugins/utils/time-scale');
var caller = require('my-plugins/utils/caller').stack;
var bufdiff = require('my-plugins/utils/buf-diff');

var Sequence = module.exports = function(opts) //temp shim
{
    if (!(this instanceof Sequence)) return new (Sequence.bind.apply(Sequence, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    this.opts = opts || {};
    this.cues = [];
    this.cue_dirty = false;
    if (this.opts.auto_collect)
    {
        this.addMedia();
        this.addCues();
    }
}

//format info for easier viewing in node inspector:
Sequence.prototype.debug = function()
{
    if (!global.v8debug) return; //http://stackoverflow.com/questions/6889470/how-to-programmatically-detect-debug-mode-in-nodejs
    /*var sprintf =*/ require('sprintf.js'); //.sprintf;
    var buf = [sprintf("%d cues:", this.cues.length)];
    this.cues.forEach(function(cue, inx)
    {
//        console.log("cue[%d/%d] name '%s', from %d, to %d, text '%s'", inx, this.cues.length, cue.name, cue.from, cue.to, cue.text);
        buf.push(sprintf("cue[%d/%d]: name '%s', from %d, to %d, text '%s'", inx, this.cues.length, cue.name, cue.from, cue.to, cue.text));
    }, this); //CAUTION: need to preserve context within forEach loop
    this.debug_cues = buf.join('\n');
    debugger; //https://nodejs.org/api/debugger.html
}

Sequence.prototype.addCue = function(opts) //{name, from, to, text, src)
{
//    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
    if (!opts) opts = {};
    if (!opts.name) opts.name = 'ext';
    if ((opts.from && (opts.from < 100)) || (opts.to && (opts.to < 100))) //assume caller gave sec; convert to msec
    {
        if (opts.from) opts.from *= 1000;
        if (opts.to) opts.to *= 1000;
    }
    if (!opts.from) opts.from = 0;
    if (opts.from > this.duration) { console.log("cue past end: %s".red, linebuf); return; }
    if (this.back_trim && (this.back_trim.name == opts.name)) //fill in gap from previous entry
    {
        this.back_trim.to = opts.from;
        this.back_trim = null;
    }
    if (!opts.to) { opts.to = this.duration; this.back_trim = opts; } //set tentative end, but allow next entry to trim it
    if (opts.to < opts.from) { console.log("ends before starts: %j".red, opts); return; }
    if (!opts.text) opts.text = '';
//    this.cues.push({from: from || 0, to: to || 9999 /*this.duration*/, text: text || '', src: src || null, name: section || 'ext', });
    this.cues.push(opts);
    this.cues_dirty = true;
    return this; //fluent
}

/*
Sequence.prototype.addFixedFrames = function(interval, name)
{
//    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
    if (interval < 10) interval *= 1000; //assume caller gave sec; convert to msec
    if (interval < 10) throw "Interval too small: " + interval;
    for (var time = 0, frnum = 0; time < this.duration; time += interval, ++frnum)
        this.cues.push({name: name || "frames", from: time, to: Math.min(time + interval, this.duration), text: name || 'fr#' + frnum});
    this.cues_dirty = true;
    return this; //fluent
}
*/

Sequence.prototype.setDuration = function(duration, desc)
{
    if (this.duration && (duration != this.duration)) console.log("duration mismatch: was %s vs. vix2 %s", timescale(this.duration), timescale(duration));
    this.duration = duration;
    return this; //fluent
}

/*
Sequence.prototype.addVixen2 = function(opts) //{path, audio, cues}
{
    var where;
    opts = (typeof opts === 'string')? {path: opts}: opts || {};
//    console.log("here0", caller(2));
//debugger;
    glob(where = (opts.path || path.join(/*__dirname*/ path.dirname(caller(2)), '**', '!(*-bk).vix')), function(err, files)
    {
        if (err) throw "Can't add Vixen2 " + where + ": " + err;
//        if (files.length != 1) throw (files.length? "Too many": "No") + " Vixen2 files found at " + where;
        var found = files.some(function(filename, inx)
        {
            var vix2 = Vixen2.vix2seq(filename);
            if (!vix2) return false;
//            console.log("loaded '%s'".green, filename);
//            console.log("audio '%s'".blue, seq.audio || '(none)');
            console.log("duration %s, interval %s, #fr %d, #ch %d, audio %s".blue, timescale(vix2.duration), timescale(vix2.interval), vix2.numfr, vix2.channels.length, vix2.audio);
            if (vix2.audiolen != vix2.duration) console.log("seq len %d != audio len %d".red, vix2.duration, vix2.audiolen);
            this.setDuration(vix2.duration, "vix2");
            if (opts.audio !== false) this.addMedia(vix2.audio);
            if (opts.cues !== false) this.fixedInterval = vix2.interval; //addFixedFrames(vix2.interval, 'vix2');
            console.log("opts.cues %s, fixint %s, vixint %s".cyan, opts.cues, this.fixedInterval, vix2.interval);
            if (this.vix2) throw "Too many Vixen2 files found at " + where;
            return this.vix2 = vix2;
        }.bind(this));
        if (!found) throw "Vixen2 file not found at " + where;
//console.log("seq.render: fixed int %s, isseq %s", this.fixedInterval, this instanceof Sequence);
//        else { console.log("cwd ", process.cwd()); console.log("found vix file at " + where); }
    }.bind(this));
    return this; //fluent
}
*/

Sequence.prototype.addMedia = function(opts) //{path}
{
    var where;
    const AUDIO_EXTs = 'mp3,mp4,wav,ogg,webm';
    opts = (typeof opts === 'string')? {path: opts}: opts || {};
//debugger;
    glob(where = (opts.path || path.join(/*__dirname*/ path.dirname(caller(2)), '**', '!(*-bk).{' + AUDIO_EXTs + '}')), function(err, files)
    {
        if (err) throw "Can't add media " + where + ": " + err;
        var found = files.some(function(filename, inx)
        {
//            if (!filename.match('/(' + AUDIO_EXTs.replace(/,/g, '|') + ')$/i')) return false;
            if (this.media) throw "Too many media files found at " + where;
            if (!this.duration || (this.opts.use_media_len !== false)) this.setDuration(1000 * mp3len(filename), "media");
            this.media = filename;
            return this.duration;
        }.bind(this));
//        console.log("cwd ", process.cwd());
        if (!found) throw "Media file not found at " + where;
    }.bind(this));
    return this; //fluent
}

Sequence.prototype.sortCues = function()
{
//    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
    if (!this.cues_dirty) return;
    this.cues.sort(function(lhs, rhs) //sort by start time, give shorter fx higher priority
    {
        return Math.sign(lhs.from - rhs.from) || Math.sign(lhs.to - rhs.to);
    });
    this.cues_dirty = false;
    return this; //fluent
}

Sequence.prototype.findCue = function(frtime)
{
//TODO
    return this; //fluent
}

//render frames on demand:
//example/generic implementation
Sequence.prototype.render = function(frtime, buf)
{
//console.log("seq.render: fixed int %s, isseq %s", this.fixedInterval, this instanceof Sequence);
/*
    if (this.fixedInterval)
    {
        var nextfr = frtime + this.fixedInterval;
        var buflen = this.vix2.getFrame(Math.floor(frtime / this.fixedInterval), buf);
        buf = buf.slice(0, buflen);
    }
*/
    var dirty = !frtime || !this.prevbuf || bufdiff(this.prevbuf, buf); //this.prevbuf.compare(buf);
    this.prevbuf = buf;
/*TODO
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
*/
    return {frnext: nextfr, rawbuf: dirty? buf: undefined, dirty: dirty}; //frtime + .500, port#: buf};
}


//eof
