'use strict';
console.log("even-test playlist load ...");
console.timeStamp(); //shows time in FF, adds event to timeline in Chrome

//var $ = require('jquery');
//var domready = require('domready');
//var layout = require('../../plugins/services/layout.js');
//var debug = require('debug');
//var settings = require('settings');

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
        day_from: 901, //mmdd
        day_to: 930, //mmdd
        time_from: 300 +PM, //hhmm
        time_to: [ 500 +PM, 930 +PM, 930 +PM, 930 +PM, 930 +PM, 1100 +PM, 500 +PM, ], //hhmm
    },
    songs:
    [
        "test-wazzit",
    ],
    opener: "test-opener",
    closer: "test-closer",
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
        console.log("even-test playlist: mmdd now %d, btwn start %d + end %d? %d", now.mmdd(), THIS.schedule.day_from, THIS.schedule.day_to, BTWN(now.mmdd(), THIS.schedule.day_from, THIS.schedule.day_to));
        if (!BTWN(now.mmdd(), THIS.schedule.day_from, THIS.schedule.day_to)) return false;
//        var hhmm = now.getHour() * 100 + now.getMinute();
        console.log("even-test playlist: weekday %d, hhmm now %d, btwn start %d + end %d? %d", now.weekday(), now.hhmm(), THIS.starttime(now.weekday()), THIS.stoptime(now.weekday()), BTWN(now.hhmm(), THIS.starttime(now.weekday()), THIS.stoptime(now.weekday())));
        if (!BTWN(now.hhmm(), starttime(now.weekday()), stoptime(now.weekday()))) return false;
        console.log("even-test playlist is active");
        return true;
    },
    run: function(done_cb)
    {
        var now = new Date();
        if (!THIS.active(now)) return false;
        console.log("even-test playlist: starting at %d, opener? %d, within 1 hr of start? %d", now.hhmm(), !!THIS.opener, BTWN(now.hhmm(), THIS.starttime(now.weekday), THIS.starttime(now.weekday()) + 100));
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

module.exports = THIS; //commonjs; not needed by top-level plug-ins
global['plst_' + __filename.replace(/^.*\//, "")] = THIS;

console.timeStamp(); //shows time in FF, adds event to timeline in Chrome
console.log("... even-test playlist loaded");

//return module.exports; //send api back to caller
//eof
