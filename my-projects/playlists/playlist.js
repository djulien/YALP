//YALP playlist streamer
//play/pause commands can be sent into player to control it manually (or use automated scheduler)
//h/w output commands are sent from player to downstream hardware output
'use strict';

var path = require('path');
var EventEmitter = require('events').EventEmitter;
var xform = require('stream').Transform || require('readable-stream').Transform; //poly-fill for older node.js
var fs = require('fs');
var lame = require('lame');
var Speaker = require('speaker');
var PoolStream = require('pool_stream');
var elapsed = require('my-plugins/utils/elapsed');


module.exports = Playlist; //commonjs; returns new playlist object to caller

//var YALP = YALP || {}; //namespace
///*YALP.*/ sequence = function(path, name) //ctor

//http://www.crockford.com/javascript/inheritance.html

//options: auto_play (schedule or loop), auto_next, loop
function Playlist(opts) //factory/ctor
{
    if (!(this instanceof Playlist)) return new Playlist(opts); //make "new" optional; make sure "this" is set
    xform.call(this, Object.assign(opts || {}, {objectMode: true, }); //pass options to base class; allow binary data
//    var m_stream = new xform({ objectMode: true, });
//    var m_evte = new EventEmitter;
    var m_duration = 0; //this.duration = 0;
    var m_audio = null; //fs.createReadStream(this.songs[this.current].path)
    opts = opts || {};

    this.songs = [];
    this.selected = 0;
    this.isPlaylist = true;
    this.path = module.parent.filename; //already known by caller, but set it anyway
    if (path.basename(this.path) == 'index.js') this.path = path.dirname(this.path); //use folder name instead to give more meaningful name
    this.name = opts.name || path.basename(this.path, path.extname(this.path)), //|| 'NONE';
    if (this.name == 'index') this.name =
    this.scheduler = null; //TODO
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

    if (opts.auto_collect)
    {
        var files = globSync(path.dirname(this.path) + "/**/!(*-bk).mp3"); //, {}, function (err, files)
        console.log("PLAYL: auto-collect got %d seq files", files.length);
        files.forEach(function(file, inx) { this.addSong(file); });
    }
    (opts.paths || []).forEach(function(file, inx) { this.addSong(file); });
//    this.paths.forEach(function (seq, inx) { this.duration += seq.duration; });

    this.addSong = function(opts) //TODO: refactor
    {
        var song =
        {
            index: this.songs.length,
            path: opts.path || opts, //= path.absolute(path);
            name: opts.name || path.basename(path, path.extname(path)),
            get duration() { return 12; }, //TODO
        };
        propagate(song, this);
        this.songs.push(song);
        this.duration = 0; //invalidate cached value
    }

    m_stream._transform = function (chunk, encoding, done)
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
    m_stream._flush = function (done)
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
        if (!this.songs.length) throw "No songs to play";
        opts = (typeof opts === 'object')? opts: (typeof opts !== 'undefined')? {index: 1 * opts, }: {};
        if (opts.shuffle) //rearrange list in-place; index prop indicates original order
        {
            this.songs.forEach(function(song, inx) { song.order = Math.random(); });
            this.songs.sort(function(lhs, rhs) { return (lhs.order < rhs.order)? -1: (lhs.order > rhs.order)? 1: 0; });
        }
        this.selected = Math.min(opts.rewind? 0: (index in opts)? 1 * opts.index: this.selected, this.songs.length - 1); //clamp to end of list
//        if (this.selected < 0) throw "Can't find currently selected song";
        var next = opts.single? this.selected: (this.selected + 1) % this.songs.length;
        var evtinfo = {current: this.songs[this.selected], next: this.songs[next], });
        this.emit('begin', evtinfo); //playlist
        this.songs[this.selected].play()
            .once('start', function() { this.emit('start', evtinfo); }) //song
            .on('progress', function() { this.emit('start', evtinfo); })
            .once('stop', function()
            {
                this.emit('stop', evtinfo); //song
                if (opts.single && opts.loop) this.songs[this.selected].play()
                if (opts.loop) this.play(
        if (
        if (this.active === 'undefined
        if (this.next || 0 >= this.songs.length
        fs.createReadStream(this.songs[this.current].path)
            .pipe(new lame.Decoder())
            .on('format', function (format)
            {
                this.pipe(new Speaker(format));
            });
// following events will tell you why need pool:
            .on('end', function ()
            {
                console.log('audio end time is: %s', new Date());
            });
pool.on('end', function () {
  console.log('pool end time is: %s', new Date());
});
pool.on('finish', function () {
  console.log('pool finish time is: %s', new Date());
});
writable.on('finish', function () {
  console.log('writable finish time is: %s', new Date());
});
    }
===
var readable = fs.createReadStream('a_file');
var pool = new PoolStream();
var writable = fs.createWriteStream('b_file');

readable.pipe(pool).pipe(writable);

===

//pass-thru methods to shared player object:
    this.on = m_evte.on;
//    this.play = this.paths[0].play;
//    this.stop = this.paths[0].stop;
//    this.next = this.paths[0].next;
    this.pipe = m_stream.pipe;

//    return this; //not needed for ctor
}
util.inherits(Playlist, xform); //http://stackoverflow.com/questions/8898399/node-js-inheriting-from-eventemitter
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
