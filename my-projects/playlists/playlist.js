'use strict';

//var $ = require('jquery');
//var domready = require('domready');
//var layout = require('../../plugins/services/layout.js');
//var debug = require('debug');
//var settings = require('settings');

module.exports = Playlist; //commonjs; returns new sequence object to caller

//var YALP = YALP || {}; //namespace
///*YALP.*/ sequence = function(path, name) //ctor

function Playlist(opts) //ctor/factory
{
    if (typeof this !== 'Playlist') return new Playlist(opts); //make "new" optional; make sure "this" is set
    if (!opts) opts = {};

    this.isPlaylist = true;
    this.songs = []; //opts.path || '';

    if (opts.auto_collect)
    {
        var files = globSync(module.parent.__dirname + "/*[!-bk].mp3"); //, {}, function (err, files)
        console.log("PLAYL: auto-collect got %d seq files", files.length);
        this.paths = files;
    }
    if (opts.paths) this.paths.push(opts.path);
    this.name = opts.name || 'NONE';
//    this.paths.forEach(function (path, inx) { player.add(path); });

    this.duration = 0;
    this.paths.forEach(function (seq, inx) { this.duration += seq.duration; });

//pass-thru methods to shared player object:
    this.play = this.paths[0].play;
    this.stop = this.paths[0].stop;
    this.next = this.paths[0].next;
    this.on = this.paths[0].on;

    return this;
};

TODO: merge code

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

/*
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
*/

module.exports = THIS; //commonjs; not needed by top-level plug-ins
global['plst_' + __filename.replace(/^.*\//, "")] = THIS;

console.timeStamp(); //shows time in FF, adds event to timeline in Chrome
console.log("... xmas playlist loaded");

//return module.exports; //send api back to caller
//eof
