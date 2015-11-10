
'use strict';

var clock = require('my-plugins/utils/clock');


//TODO: merge scheduler code?
//Date.prototype.mmdd = function() { return 100 * (this.getMonth() + 1) + this.getDate(); }
//Date.prototype.hhmm = function() { return 100 * this.getHour() + this.getMinute(); }
//Date.prototype.weekday = function() { return this.getDay(); } //http://www.w3schools.com/jsref/jsref_obj_date.asp
function mmdd(date) { return 100 * (date.getMonth() + 1) + date.getDate(); }
function hhmm(date) { return 100 * date.getHour() + date.getMinute(); }
function weekday(date) { return date.getDay(); } //http://www.w3schools.com/jsref/jsref_obj_date.asp

function mmdd2days(mmdd) { return mmdd + (32 - 100) * Math.floor(mmdd / 100); } //kludge: use 32 days/month as an approximation
function hhmm2min(hhmm) { return hhmm + (60 - 100) * Math.floor(hhmm / 100); }
//function hhmm2msec(hhmm) { return hhmm2min(hhmm) * 60 * 1000; } //msec

function MIN(values) { return values.length? Math.min.apply(null, values): values; }
function BTWN(val, from, to) { return (from <= to)? (val >= from) && (val <= to): (val <= to) || (val >= from); }
function SafeItem(choices, which)
{
    if (!choices.length) return choices;
//    var wday = "Su,M,Tu,W,Th,F,Sa".split(',')[now.getDay()];
    return (which < 0)? choices[0]: (which >= choices.length)? choices[choices.length - 1]: choices[which];
}


//CAUTION: not cleared if multiple playlists used
var m_all = [];
var m_sorted = false;
var Schedule = module.exports.Schedule = function(opts)
{
    if (!(this instanceof Schedule)) return setnew(Schedule, arguments);
    var add_prop = function(name, value) { if (!this[name]) Object.defineProperty(this, name, {value: value}); }.bind(this); //expose prop but leave it read-only
    m_all.push(this); m_sorted = false;

    if (opts.name) add_prop('name', opts.name);
    add_prop('day_to', opts.day_to);
    add_prop('day_from', opts.day_from);
    add_prop('time_to', opts.time_to);
    add_prop('time_from', opts.time_from);

//give preference to shorter schedules so they can override or interrupt longer schedules
    var m_priority;
    add_prop('priority', function()
    {
        if (isdef(m_priority)) return m_priority;
        var date_range = mmdd2days(MIN(this.day_to)) - mmdd2days(MIN(this.day_from));
        if (date_range < 0) date_range += 12 * 32; //adjust for year-end wrap
        var time_range = hhmm2min(MIN(this.time_to)) - hhmm2min(MIN(this.time_from));
        if (time_range < 0) time_range += 24 * 60; //adjust for midnight wrap
        return m_priority = date_range * 24 * 60 + time_range;
    }.bind(this));

    var m_wkday, m_starttime, m_stoptime;
    var gettimes = function(weekday)
    {
        if (weekday == m_wkday) return;
        m_starttime = SafeItem(this.time_from, weekday);
        m_stoptime = SafeItem(this.time_to, weekday);
        m_wkday = weekday;
    }.bind(this);
    this.starttime = function(weekday) { gettimes(weekday); return m_starttime; }
    this.stoptime = function(weekday) { gettimes(weekday); return m_stoptime; }
}


Schedule.prototype.active = function(now)
{
    if (!now) now = new Date();
//        var weekday = now.getDay(); //http://www.w3schools.com/jsref/jsref_obj_date.asp
//        var weekday = "Su,M,Tu,W,Th,F,Sa".split(',')[now.getDay()];
//        var month = "Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec".split(',')[now.getMonth()];
//        var mmdd = mmdd2days(100 * now.GetMonth() + now.getDate());
    console.log("playlist scheduler: mmdd now %s, btwn start %s + end %s? %s", mmdd(now), this.day_from, this.day_to, BTWN(mmdd(now), this.day_from, this.day_to));
    if (!BTWN(mmdd(now), this.day_from, this.day_to)) return false;
//        var hhmm = now.getHour() * 100 + now.getMinute();
    return true;
}


//dummy class to donate methods to another class:
var SchedulerMixin = module.exports.SchedulerMixin = function(opts)
{
    throw "Mixin class; don't instantiate";
}


//clear global collection when switching playlists
SchedulerMixin.prototype.SchedDrop = function()
{
    m_all = [];
    m_sorted = false;
}

//main scheduler loop:
//wait until scheduled time, then run playlist
SchedulerMixin.prototype.scheduler = function(opts)
{
    var now = new Date();
//    if (!m_all.length /*this.schedule*/) return;
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


//TODO:    shuttle: function()
/*
//TODO: opener, closer
run: function(done_cb)
{
    var now = new Date();
    if (!THIS.active(now)) return false;
    console.log("playlist: starting at %d, opener? %d, within 1 hr of start? %d", now.hhmm(), !!THIS.opener, BTWN(now.hhmm(), THIS.starttime(now.weekday), THIS.starttime(now.weekday()) + 100));
    if (THIS.opener && BTWN(now.hhmm(), THIS.starttime(now.weekday), THIS.starttime(now.weekday()) + 100)) playback(THIS.opener); //don't play opener if starting late
    THIS.songs.every(function(song, inx)
    {
        playback(song);
        return active();
    });
    if (THIS.closer) playback(THIS.closer);
    return true;
}
*/

function setnew(type, args)
{
//    if (this instanceof type) return;
    return new (type.bind.apply(type, [null].concat(Array.from(args))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
}

//eof
