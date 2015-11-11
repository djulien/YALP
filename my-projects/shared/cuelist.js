
'use strict';

var fs = require('fs');
var glob = require('glob');
var path = require('path');
var byline = require('byline');
var makenew = require('my-plugins/utils/makenew');
//var NodeCache = require( "node-cache" );
//var Tokenizer = require('tokenizer');
//require('buffertools').extend(); //https://github.com/bnoordhuis/node-buffertools
//var elapsed = require('my-plugins/utils/elapsed');
var relpath = require('my-plugins/utils/relpath');
var shortname = require('my-plugins/utils/shortname');
//var Now = require('my-plugins/utils/clock').Now;


//CAUTION: not cleared if multiple sequences used
//var m_all = [];
//var m_sorted = false;
var m_limit;
var m_back_trim;
var Cue = module.exports.Cue = function(opts)
{
    if (!(this instanceof Cue)) return makenew(Cue, arguments);
    var add_prop = function(name, value, vis) { if (!this[name]) Object.defineProperty(this, name, {value: value, enumerable: vis !== false}); }.bind(this); //expose prop but leave it read-only
//    m_all.push(this); m_sorted = false;

//    if (!opts.name) opts.name = 'ext';
    if (opts.name) add_prop('name', opts.name);
    if ((opts.from && (opts.from < 100)) || (opts.to && (opts.to < 100))) //assume caller gave sec; convert to msec
    {
        if (opts.from) opts.from *= 1000;
        if (opts.to) opts.to *= 1000;
    }
    add_prop('from', opts.from || 0);
    if (opts.from > m_limit) { console.log("past end: %j", opts); return; }
    if (m_back_trim && (m_back_trim.name == opts.name)) //fill in gap from previous entry
    {
        m_back_trim.to = opts.from;
        m_back_trim = null;
    }
    if (!opts.to) { opts.to = m_limit; m_back_trim = opts; } //set tentative end, but allow next entry to trim it
    if (opts.to < opts.from) { console.log("ends before starts: ", opts); return; }
    add_prop('to', opts.to);
    add_prop('text', opts.text || '');
}


//dummy class to donate methods to another class:
var CueListMixin = module.exports.CueListMixin = function(opts)
{
    throw "Mixin class; don't instantiate";
}


////clear global collection when switching playlists
CueListMixin.prototype.ResetCue = function(duration)
{
//    m_all = [];
//    m_sorted = false;
    m_limit = duration;
    m_back_trim = null;
}

//use with Vixen2 or xLights files
CueListMixin.prototype.addFixedFrames = function(interval)
{
//    if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
    if (interval < 10) interval *= 1000; //assume caller gave sec; convert to msec
    if (interval < 10) throw "Interval too small: " + interval;
    for (var time = 0, frnum = 0; time < this.duration; time += interval, ++frnum)
        this.cues.push({name: "frames", from: time, to: Math.min(time + interval, this.duration), text: frnum});
    this.FixedFrameInterval = interval;
//    m_sorted = false; //this.cues_dirty = true;
    return this; //fluent
}


CueListMixin.prototype.addCues = function(pattern)
{
//        debugger;
    var where;
    glob.sync(where = pattern || path.join(this.folder, '**', '!(*-bk).{timing,cues}')).forEach(function(filename)
    {
        filename = require.resolve(filename);
        console.log("adding timing cues from %s", filename);
        this.pend();
        var section = "timing", src = shortname(filename), linenum = 0, back_trim = null, numwarn = [0, 0];
//TODO: use cached values if file !changed
        var stream = byline(fs.createReadStream(filename))
            .on('readable', function()
            {
                for (;;)
                {
//                if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
                    var linebuf = stream.read();
                    if (!linebuf) break;
                    linebuf = linebuf.toString('utf8'); ++linenum;
//                    console.log(typeof linebuf, linebuf);
                    var matches;
                    if (matches = linebuf.match(/^#\s*(.+):?\s*$/)) //, 'heading');
                    {
//                        if (this.cues.length && (this.cues[this.cues.length - 1].to == 'next')
//                        flush.apply(this);
                        section = matches[1]; //token;
                        back_trim = null;
//                        if (this.cues[name]) console.log("dupl heading %s".yellow, name);
                    }
                    else if (matches = linebuf.match(/^\s*([\d.]+)(\s+([\d.]+))?(\s+(.+))?\s*$/)) //, 'from');
                    {
//                        flush.apply(this);
                        var from = Math.round(1000 * matches[1]); //token;
                        if (from > this.duration) { if (!numwarn[0]++) console.log("%s:%d starts past end %d: %s", src, linenum, this.duration / 1000, linebuf.replace(/\t+/g, ' ')); continue; }
                        if (back_trim) this.cues[this.cues.length - 1].to = from; back_trim = null; //fill in gap from previous entry
                        var to = matches[3]? Math.round(1000 * matches[3]): back_trim = this.duration /*9999000*/; //'next'; //will be filled in by next entry; use junk value past end to preserve to >= from validation
                        if (matches[3] && (to < from)) { if (!numwarn[1]++) console.log("%s:%d ends %d before starts %d: %s", src, linenum, to / 1000, from / 1000, linebuf.replace(/\t+/g, ' ')); continue; }
                        var text = matches[5] || null;
//                        var cues = this.cues[name] = this.cues[name] || [];
//                        console.log("hd %s, from %d, to %d, text %s", section, from, to, text);
//                    this.cues.push({from: from || 0, to: to || 9999 /*this.duration*/, text: text || '', src: src || null, name: section || 'ext'});
                        this.cues.push({name: section, from: from, to: to, text: matches[5] || '', src: src + ':' + linenum});
//                    this.addCue(section, from, to, text, src + ':' + linenum);
                        this.cues_dirty = true;
                    }
                    else console.log("junk cue line ignored in %s:%d: %s".yellow, src, linenum, linebuf);
                }
            }.bind(this))
            .on('end', function()
            {
//                flush();
                if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
//            console.log("%d cues from %s, dirty? %d", this.cues.length, relpath(filename), this.cues_dirty);
                if (Math.max(numwarn[0], numwarn[1]) > 1) console.log("(%d more warnings)", Math.max(numwarn[0] - 1, 0) + Math.max(numwarn[1] - 1, 0));
                this.unpend(); //ing) this.ready(); //emit('ready');
            }.bind(this))
            .on('error', function(err) { /*this.unpend()*/; this.error /*console.log*/("cues: not a file: %s: %s" + relpath(filename) + " " + err); }.bind(this));
    }.bind(this));
    return this; //fluent
}


/*
Sequence.prototype.findCue = function(frtime)
{
//TODO
    return this; //fluent
}
function sortCues()
{
    if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
    if (!this.cues_dirty) return;
    this.cues.sort(function(lhs, rhs) //sort by start time, give shorter fx higher priority
    {
        return Math.sign(lhs.from - rhs.from) || Math.sign(lhs.to - rhs.to);
    });
    this.cues_dirty = false;
//    return this; //allow chaining
}
*/


//main scheduler loop:
//wait until scheduled time, then run playlist
/*
CueListMixin.prototype.scheduler = function(opts)
{
    var now = new Date();
//    if (!m_all.length /-*this.schedule*-/) return;
    if (!m_sorted) m_all.sort(function(lhs, rhs) { return lhs.priority - rhs.priority; }); //give priority to shorter schedules if they overlap
    m_sorted = true;
//no; needs to be static/scoped for correct handling inside scheduler; var was_active = null;
    var is_active = null; m_all.some(function(sched, inx)
    {
//        console.log("sched %j active? %s", sched, active(sched, now));
        return is_active = sched.active(now)? sched: null; //kludge: array.some only returns true/false, so save result in here
//        return is_active; //true => break, false => continue
    });
    var changed = (!is_active != !this.was_active);
    console.log("scheduler[@%s] %d ents, was %j, is %j, change state? %s", clock.Now.asString(), m_all.length, this.was_active, is_active, changed, is_active);
//TODO: opener, closer
    if (is_active && !this.was_active) this.play(); //cmd('play');
    else if (!is_active && this.was_active) this.pause(); //pending_stop = true; //cmd('pause');
//    console.log("TODO: scheduler");
//    console.log("Scheduling '%s' scheduler ...".green, this.name);
//no    this.auto_loop = //caller might only want to run once with schedule
    this.was_active = is_active;
    if (changed && !this.opts.loop) return; //no need to continue checking schedule
    setTimeout(function() { this.scheduler(opts); }.bind(this), 60 * 1000); //timing not critical; just check for active schedule periodically
}
*/

//eof
