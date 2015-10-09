//YALP playlist streamer
//play/pause commands can be sent into player to control it manually (or use automated scheduler)
//h/w output commands are sent from player to downstream hardware output
'use strict';

var path = require('path');
var EventEmitter = require('events').EventEmitter;
var xform = require('stream').Transform || require('readable-stream').Transform; //poly-fill for older node.js
var fs = require('fs');
var glob = require('glob');
var elapsed = require('my-plugins/utils/elapsed');
var inherits = require('inherits');

module.exports = Playlist; //commonjs; returns playlist factory/ctor to caller

//var YALP = YALP || {}; //namespace
///*YALP.*/ sequence = function(path, name) //ctor

//http://www.crockford.com/javascript/inheritance.html

//options: auto_play (schedule or loop), auto_next, loop
function Playlist(opts) //factory/ctor
{
    if (!(this instanceof Playlist)) return new Playlist(opts); //make "new" optional; make sure "this" is set
    xform.call(this, Object.assign(opts || {}, {objectMode: true, })); //pass options to base class; allow binary data
//    var m_stream = new xform({ objectMode: true, });
//    var m_evte = new EventEmitter;
    var m_duration = 0; //this.duration = 0;
//    var m_audio = null; //fs.createReadStream(this.songs[this.current].path)
    opts = opts || {};
//    opts = (typeof opts === 'object')? opts: (typeof opts !== 'undefined')? {index: 1 * opts, }: {};

    this.songs = [];
    this.selected = 0;
    this.isPlaylist = true;
    this.elapsed = new elapsed(); //from creation until played
    this.path = module.parent.filename; //already known by caller, but set it anyway
    if (path.basename(this.path) == 'index.js') this.path = path.dirname(this.path); //use folder name instead to give more meaningful name
    this.name = opts.name || path.basename(this.path, path.extname(this.path)), //|| 'NONE';
    this.schedule = null; //TODO
    var this_playlist = this;
    Object.defineProperty(this, "duration",
    {
        get: function() //read-only, computed, cached
        {
            if (!m_duration)
                this.songs.forEach(function (song, inx)
                {
                    m_duration += song.duration;
                });
            return m_duration;
        },
        set: function(newval)
        {
            if (newval) throw "Playlist.duration is read-only";
            m_duration = newval; //only allow it to be cleared
        },
    });

    this.addSong = function(seqpath) //song is a sequence folder
    {
        console.log("PL add song %s".blue, seqpath);
//        opts = (typeof opts === 'object')? opts: (typeof opts !== 'undefined')? {path: opts, }: {};
        glob.sync(seqpath).forEach(function (file, index)
        {
            console.log("PL resolved candidate %s".blue, file);
            var seq = require(file); //seqpath); //maybe add try/catch here to allow graceful continuation? OTOH, glob said it was there, so it's okay to require it
            if (!seq.isSequence) return;
//        propagate(song, this);
            seq.index = this.songs.length;
            this.songs.push(seq);
        }, this); //CAUTION: need to preserve context within forEach loop
        this.duration = 0; //invalidate cached value
    }

    this._transform = function (chunk, encoding, done)
    {
        console.log("playlist in-stream: cmd ".blue, JSON.stringify(chunk));
        switch (chunk.cmd || '')
        {
            case "play": this.play(); return;
            case "pause": this.pause(); return;
            case "next": this.next(); return;
            case "stop": this.stop(); return;
            default: console.log("unknown command: '%s'".red, chunk.cmd || '');
        }
        done();
    }
    this._flush = function (done)
    {
        console.log("playlist in-stream: EOF".blue);
        this.stop();
        done();
    }

//example mp3 player from https://gist.github.com/TooTallNate/3947591
//more info: https://jwarren.co.uk/blog/audio-on-the-raspberry-pi-with-node-js/
//fancier example from https://www.npmjs.com/package/pool_stream
//this is impressively awesome - 6 lines of portable code!
    this.play = function(opts) //manual start
    {
//        opts = opts || {};
        this.elapsed = new elapsed();
        if (!this.songs.length) throw "No songs to play";
        opts = (typeof opts === 'object')? opts: (typeof opts !== 'undefined')? {index: 1 * opts, }: {};
        if (opts.shuffle) //rearrange list in-place; index prop indicates original order
        {
            this.songs.forEach(function(song, inx) { song.order = Math.random(); });
            this.songs.sort(function(lhs, rhs) { return (lhs.order < rhs.order)? -1: (lhs.order > rhs.order)? 1: 0; });
        }
        this.selected = Math.min(opts.rewind? 0: ('index' in opts)? 1 * opts.index: this.selected || 0, this.songs.length - 1); //clamp to end of list
//        if (this.selected < 0) throw "Can't find currently selected song";
        var next = opts.single? this.selected: (this.selected + 1) % this.songs.length;
        var evtinfo = {current: this.songs[this.selected], next: this.songs[next], };
        this.emit('begin', null, evtinfo); //playlist

        return this.songs[this.selected].play(0)
            .once('start', function() { this_playlist.emit('start', null, evtinfo); }) //song
            .on('progress', function() { this_playlist.emit('progress', null, evtinfo); })
            .once('pause', function() { this_playlist.emit('pause', null, evtinfo); })
            .once('resume', function() { this_playlist.emit('resume', null, evtinfo); })
            .on('error', function(errinfo) { this_playlist.emit('error', errinfo); })
            .once('stop', function()
            {
                this_playlist.emit('stop', null, evtinfo); //song
                if (opts.loop && (opts.single || (this_playlist.selected < this_playlist.songs.length - 1))) this_playlist.write({cmd: "play", index: next, }); //avoid recursion
                else this_playlist.emit('end', null, evtinfo); //playlist
            });
    }

    this.pause = function()
    {
        this.elapsed = {now: this.elapsed.now, }; //freeze elapsed timer
        return this.songs[this.selected].pause()
            .once('pause', function() { this_playlist.emit('pause', null, evtinfo); })
            .on('error', function(errinfo) { this_playlist.emit('error', errinfo); });
    }

//TODO: are resume + stop needed?
    this.resume = function() //TODO: is this really useful?
    {
        this.elapsed = new elapsed(-this.elapsed.now); //exclude paused time so elapsed time is correct
        return this.songs[this.selected].play()
            .once('play', function() { this_playlist.emit('resume', null, evtinfo); })
            .on('error', function(errinfo) { this_playlist.emit('error', errinfo); });
    }

    this.stop = function() //TODO: is this really useful?
    {
        this.elapsed = {now: this.elapsed.now, }; //freeze elapsed timer
        return this.songs[this.selected].stop()
            .once('stop', function() { this_playlist.emit('stop', null, evtinfo); })
            .on('error', function(errinfo) { this_playlist.emit('error', errinfo); });
    }

//pass-thru methods to shared player object:
//    this.on = m_evte.on;
//    this.play = this.paths[0].play;
//    this.stop = this.paths[0].stop;
//    this.next = this.paths[0].next;
//    this.pipe = m_stream.pipe;

    if (opts.auto_collect)
    {
        console.log("PL auto-collect: %s".blue, path.dirname(this.path) + "/**/!(*-bk).js");
        var files = glob.sync(path.dirname(this.path) + "/**/!(*-bk).js"); //mp3"); //, {}, function (err, files)
        console.log("PL: auto-collect got %d candidate seq files", files.length);
        files.forEach(function(file, inx) { this.addSong(path.dirname(file)); }, this); //CAUTION: need to preserve context within forEach loop
    }
    (opts.paths || []).forEach(function(file, inx) { this.addSong(file); }, this); //CAUTION: need to preserve context within forEach loop
//    this.paths.forEach(function (seq, inx) { this.duration += seq.duration; }, this); //CAUTION: need to preserve context within forEach loop

//    return this; //not needed for ctor
}
inherits(Playlist, xform); //http://stackoverflow.com/questions/8898399/node-js-inheriting-from-eventemitter
//Playlist.prototype = Object.create(xform.prototype); //http://www.sitepoint.com/simple-inheritance-javascript/
//????Door.prototype.__proto__ = events.EventEmitter.prototype;
//MyStream.prototype._read = function () {


//eof
/*
TODO: merge scheduler code

Date.prototype.mmdd = function() { return 100 * (this.getMonth() + 1) + this.getDate(); }
Date.prototype.hhmm = function() { return 100 * this.getHour() + this.getMinute(); }
Date.prototype.weekday = function() { return this.getDay(); } //http://www.w3schools.com/jsref/jsref_obj_date.asp

function MIN(thing) { return thing.length? Math.min.apply(null, thing): thing; }
function BTWN(val, from, to)
{
    return (from < to)? (val >= to) && (val <= from): (val <= to) || (val >= from);
}
function SafeItem(choices, which)
{
    if (!choices.length) return choices;
//    var wday = "Su,M,Tu,W,Th,F,Sa".split(',')[now.getDay()];
    return (which < 0)? choices[0]: (which >= choices.length)? choices[choices.length - 1]: choices[which];
}
function mmdd2days(mmdd) { return mmdd + (32 - 100) * Math.floor(mmdd / 100); } //kludge: use 32 days/month as an approximation
function hhmm2min(hhmm) { return hhmm + (60 - 100) * Math.floor(mmdd / 100); }
//function hhmm2msec(hhmm) { return hhmm2min(hhmm) * 60 * 1000; } //msec

var AM = 0, PM = 1200;
var THIS =
{
    schedule:
    {
        day_from: 1124, //mmdd
        day_to: 1228, //mmdd
        time_from: 530 +PM, //hhmm
        time_to: [ 1100 +PM, 930 +PM, 930 +PM, 930 +PM, 930 +PM, 1100 +PM, 1100 +PM, ], //hhmm
    },
    songs:
    [
        "Hippo",
        "Capital C",
    ],
    opener: "thx",
    closer: "goodnight",
//    shuttle: function()
    get priority() //give preference to shorter schedules so they can override or interrupt longer schedules
    {
        if (THIS.cached_pri) return THIS.cached_pri;
        var date_range = mmdd2days(MIN(THIS.schedule.day_to)) - mmdd2days(MIN(THIS.schedule.day_from));
        if (date_range < 0) date_range += 12 * 32; //adjust for year-end wrap
        var time_range = hhmm2min(MIN(THIS.schedule.time_to)) - hhmm2min(MIN(THIS.schedule.time_from));
        if (time_range < 0) time_range += 24 * 60; //adjust for midnight wrap
        return THIS.cached_pri = date_range * 24 * 60 + time_range;
    },
    starttime: function(weekday)
    {
        if (weekday != (THIS.starttime.cache || {}).weekday)
            THIS.starttime.cache = {weekday: weekday, time_from: SafeItem(THIS.schedule.time_from, weekday())};
        return THIS.starttime.cache.time_from;
    },
    stoptime: function(weekday)
    {
        if (weekday != (THIS.stoptime.cache || {}).weekday)
            THIS.stoptime.cache = {weekday: weekday, time_to: SafeItem(THIS.schedule.time_to, weekday())};
        return THIS.starttime.cache.time_to;
    },
    active: function(now)
    {
        if (!now) now = new Date();
//        var weekday = now.getDay(); //http://www.w3schools.com/jsref/jsref_obj_date.asp
//        var weekday = "Su,M,Tu,W,Th,F,Sa".split(',')[now.getDay()];
//        var month = "Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec".split(',')[now.getMonth()];
//        var mmdd = mmdd2days(100 * now.GetMonth() + now.getDate());
        console.log("xmas playlist: mmdd now %d, btwn start %d + end %d? %d", now.mmdd(), THIS.schedule.day_from, THIS.schedule.day_to, BTWN(now.mmdd(), THIS.schedule.day_from, THIS.schedule.day_to));
        if (!BTWN(now.mmdd(), THIS.schedule.day_from, THIS.schedule.day_to)) return false;
//        var hhmm = now.getHour() * 100 + now.getMinute();
        console.log("xmas playlist: weekday %d, hhmm now %d, btwn start %d + end %d? %d", now.weekday(), now.hhmm(), THIS.starttime(now.weekday()), THIS.stoptime(now.weekday()), BTWN(now.hhmm(), THIS.starttime(now.weekday()), THIS.stoptime(now.weekday())));
        if (!BTWN(now.hhmm(), starttime(now.weekday()), stoptime(now.weekday()))) return false;
        console.log("xmas playlist is active");
        return true;
    },
    run: function(done_cb)
    {
        var now = new Date();
        if (!THIS.active(now)) return false;
        console.log("xmas playlist: starting at %d, opener? %d, within 1 hr of start? %d", now.hhmm(), !!THIS.opener, BTWN(now.hhmm(), THIS.starttime(now.weekday), THIS.starttime(now.weekday()) + 100));
        if (THIS.opener && BTWN(now.hhmm(), THIS.starttime(now.weekday), THIS.starttime(now.weekday()) + 100)) playback(THIS.opener); //don't play opener if starting late
        THIS.songs.every(function(song, inx)
        {
            playback(song);
            return active();
        });
        if (THIS.closer) playback(THIS.closer);
        return true;
    },
};

function playback(song)
{
    console.log("playback " + song);
}

/-*
    var mon = "Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec".split(',')[now.getMonth()];
    var mday = now.getDate(); //1..31

    switch (mon)
    {
        case 'Jan':
            return (mday < 4)? new NewYears(): null;
        case 'Apr':
            return ((mday >= 20) && (mday <= 24))? new Easter(): null;
        case 'Oct':
            return (mday >= 24)? new Halloween(): null;
        case 'Nov':
            return (mday >= 24)? new Christmas(): null;
        case 'Dec':
            return (mday < 28)? new Christmas(): new NewYears();
    }
    return null;
    switch (mon * 100 + mday) //special days
    {
        case 1231: //New Years' eve
            stoptime = 2500; //1 AM next day
            break;
        case 1224: //Christmas eve
            stoptime = 2400;
            break;
        case 1225:
    console.log("schedule: now %d, wkday %s, start %d, stop %d", msec2hhmm(now.getTime()), wday, msec2hhmm(starttime), msec2hhmm(stoptime));
    if (now.var is_active = (now.getTime() >= starttime
    if (now.getHours() < 5) return false;
    if (now
*-/
*/
