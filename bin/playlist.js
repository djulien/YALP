#!/usr/bin/env node
//#!/usr/local/bin/node --expose-gc

'use strict';

var que = require('my-plugins/utils/ipc').open('playlist');
var clock = require('my-plugins/utils/clock');
var Elapsed = require('my-plugins/utils/elapsed');

var started;
var songs = []; //{name, path, duration}
var selected = 0, frtime = 0;
var pending_stop, auto_loop;
que.rcv('cmd', function(data, reply)
{
//try{
//    console.log("cmd: length %d, data %j", data.length, data);
    switch (!data.length? data + '!': data[0] + ((data.length < 2)? '!': '*'))
    {
        case 'add*':
            try
            {
//TODO?                if (!data[1].length) data[1] = [data[1]];
                var song = require(data[1]);
                song.filename = require.resolve(data[1]); //get path name
                console.log("song filename", song.filename);
                reply("add song[%d] '%s' ok? %s: %j", songs.length, data[1], !!song, song);
                songs.push(song);
            }
            catch (exc) { reply("load %s failed: %j", data[1], exc); }
            break;
        case 'play!':
            if (!songs.length) { reply("no songs"); break; }
            started = clock.Now();
            reply("now playing[%s], was? %s", clock.Now.asString(started), !!playing);
            pending_stop = false; //cancelled
            if (!playing) send_frame();
            break;
        case 'pause!':
            reply("now paused, was? %s", !playing);
            if (playing) clearTimeout(playing);
            pending_stop = false; //satisfied
            playing = null;
            break;
        case 'rewind!':
            if (playing) { reply("busy playing"); break; }
            reply("rewind, was playing? %s", !!playing);
            selected = frtime = 0;
            break;
        case 'status!':
            reply("song[%d/%d].frame[%d/%d], playing? %s, #subscribers %d", selected, songs.length, frtime, (selected < songs.length)? songs[selected].duration: -1, !!playing, subscribers.length);
            break;
        case 'quit!':
            reply("will quit now");
            process.exit(0);
            break;
        default:
            reply("unknown command: %j", data);
            break;
    }
//}catch(exc){ reply("error: " + exc); }
});

//send command to myself:

function cmd(args) //, cb)
{
//    var args = arguments.length? arguments: cmd.pending.shift(); //assumes caller will not dequeue if empty
//    if (arguments.length && cmd.pending) return cmd.pending.push(arguments); //wait for previous cmd to finish before sending a new one (ipc is not reentrant)
//    cmd.pending = [];
    que.send('cmd', Array.from/*prototype.slice.call*/(arguments), function(data, reply)
    {
        console.log("reply: ", data);
//        if (/*cb ||*/ cmd.pending.length) process.nextTick(function() //return from current message before sending reply or next cmd
//        {
//            if (cb) cb(data);
//            if (cmd.pending.length) cmd(); //dequeue next request
//        });
        return false; //i don't want more
    });
}

var subscribers = [];
var good = 0, bad = 0;
que.rcv('frames', function(data_ignore, reply_cb)
{
//debugger;
    console.log("subscribe req:", data_ignore);
    subscribers.push(reply_cb);
    reply_cb("okay, will send you frames");
});

var playing = null;
var elapsed; //= new Elapsed();
var buffers = [], ff = 0;
for (var i = 0; i < 2; ++i) buffers.push(new Buffer(100)); //4096));
function send_frame()
{
    playing = null; //timer satisfied
//NOTE: prep frame data even if no subscribers; this allows on-demand fx to be pre-rendered and cached for better playback performance
//NOTE: timing does not need to be precise here because we are doing read-ahead for downstream player; however, we don't want to stray too far off, so use auto-correcting cumulative timing
    if (!frtime) elapsed = new Elapsed(); //used to help maintain cumulative timing accuracy
    var frdata = songs[selected].render(frtime, buffers[ff ^= 1]); //{frnext, ports}; //alternating buffers; current buffer is still needed until data is actually sent
    console.log("rendered frdata: %j", frdata);
    frdata.song = selected;
    frdata.frtime = frtime;
    if (!frdata.frnext) frdata.frnext = songs[selected].duration;
    if (subscribers.length || !frtime) console.log("prep[@%s] song[%d/%d].frame[%d/%d] for %d subscribers (%d good, %d bad)", clock.Now.asString(), selected, songs.length, frtime, songs.length? songs[selected].duration: -1, subscribers.length, good, bad);
//no    if (subscribers.length)
    sendall(frdata);

    if ((frtime = frdata.frnext) >= songs[selected].duration) //advance to next frame, wrap at end
    {
        frtime = 0;
        if (++selected >= songs.length) selected = 0;
//        console.log("next up: song[%d/%d]: ", selected, songs.length, songs[selected]);
        if (!selected && (pending_stop || !auto_loop)) return; //cmd('pause');
        sendall({media: songs[selected].filename}); //load new media in player
    }

//    console.log("delay next %d", frdata.next - elapsed.now);
    playing = setTimeout(function() { send_frame(); }, 1000 * frdata.frnext - elapsed.now); //auto-correct cumulative timing; //frdata.curtime); //NOTE: timing is approx
}

function sendall(send_data)
{
    good = bad = 0;
    var keepers = [];
    subscribers.forEach(function(reply_cb, inx)
    {
        if (reply_cb(send_data) > 0) { ++good; keepers.push(reply_cb); }
        else { console.log("stop sending to %d", inx); ++bad; }
    });
    var pruned = subscribers.length - keepers.length;
    if (!pruned) return;
    subscribers = keepers;
    console.log("%d subscribers left after %d pruned", subscribers.length, pruned);
}

var glob = require('glob');
var path = require('path');

//console.log(require.resolve(path.join(__dirname, 'package.json')));
for (var cfgdir = __dirname; cfgdir; cfgdir = path.dirname(cfgdir))
{
//    console.log("check %s", path.join(cfgdir, 'package.json'));
    try { var cfg = require(path.join(cfgdir, 'package.json')).yalp || {}; break; }
    catch (exc) {} //console.log("package.json not found at %s", cfgdir); }
}
//console.log(cfg);
//console.log("cfg path ", path.join(cfgdir, cfg.playlist)); process.exit(0);
//if (cfg.playlist) cfg.playlist = require.resolve(cfg.playlist); //path.join(cfgdir, cfg.playlist); //path.relative(__dirname, path.join(cfgdir, cfg.playlist));
//console.log("playlist %s", require.resolve(cfg.playlist)); //path.resolve(__dirname, cfg.playlist)); process.exit(0);
//console.log(glob.sync(path.join(cfgdir, cfg.playlist)));
var playlist = cfg.playlist? require(cfg.playlist): {}; //'my-projects/playlists/xmas2015');
//console.log("songs %j", playlist.songs);
//if (cfg.playlist) console.log("pl", require.resolve(cfg.playlist)); process.exit(0);
(playlist.songs || []).forEach(function(song, inx) { require(require.resolve(glob.sync(song)[0])); }); //path.relative(__dirname, glob.sync(song)[0])); });
(playlist.songs || []).forEach(function(song, inx) { cmd('add', require.resolve(glob.sync(song)[0])); }); //path.relative(__dirname, glob.sync(song)[0])); });
(playlist.schedule || []).sort(function(lhs, rhs) { return priority(lhs) - priority(rhs); }); //place schedule in order of preference by duration
if ((playlist.opts || {}).autoplay) setTimeout(function() { scheduler(playlist); }, 1000); //kludge: give async files time to load

//no; needs to be static/scoped for correct handling inside scheduler; var was_active = null;
function scheduler(playlist)
{
    var now = new Date();
    if (!playlist.schedule) return;
    var is_active = null; playlist.schedule.some(function(sched, inx)
    {
//        console.log("sched %j active? %s", sched, active(sched, now));
        return is_active = active(sched, now)? sched: null; //kludge: array.some only returns true/false, so save result in here
//        return is_active; //true => break, false => continue
    });
    console.log("scheduler[@%s] was %j, is %j, change state? %s", clock.Now.asString(), scheduler.was_active, is_active, !is_active != !scheduler.was_active);
//TODO: opener, closer
    if (is_active && !scheduler.was_active) cmd('play');
    else if (!is_active && sheduler.was_active) pending_stop = true; //cmd('pause');
    auto_loop = scheduler.was_active = is_active;
    setTimeout(function() { scheduler(playlist); }, 60 * 1000); //timing not critical; just check for active schedule periodically
}

//TODO: merge scheduler code
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

function priority(THIS) //give preference to shorter schedules so they can override or interrupt longer schedules
{
    if (THIS.cached_pri) return THIS.cached_pri;
    var date_range = mmdd2days(MIN(THIS.day_to)) - mmdd2days(MIN(THIS.day_from));
    if (date_range < 0) date_range += 12 * 32; //adjust for year-end wrap
    var time_range = hhmm2min(MIN(THIS.time_to)) - hhmm2min(MIN(THIS.time_from));
    if (time_range < 0) time_range += 24 * 60; //adjust for midnight wrap
    return THIS.cached_pri = date_range * 24 * 60 + time_range;
}

function gettimes(THIS, weekday)
{
    if (weekday == THIS.cached_wkday) return;
    THIS.cached_starttime = SafeItem(THIS.time_from, weekday);
    THIS.cached_stoptime = SafeItem(THIS.time_to, weekday);
    THIS.cached_wkday = weekday;
}

function starttime(THIS, weekday)
{
    gettimes(THIS, weekday);
    return THIS.cached_starttime;
}

function stoptime(THIS, weekday)
{
    gettimes(THIS, weekday);
    return THIS.cached_stoptime;
}

function active(THIS, now)
{
    if (!now) now = new Date();
//        var weekday = now.getDay(); //http://www.w3schools.com/jsref/jsref_obj_date.asp
//        var weekday = "Su,M,Tu,W,Th,F,Sa".split(',')[now.getDay()];
//        var month = "Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec".split(',')[now.getMonth()];
//        var mmdd = mmdd2days(100 * now.GetMonth() + now.getDate());
//    console.log("playlist scheduler: mmdd now %d, btwn start %d + end %d? %s", mmdd(now), THIS.day_from, THIS.day_to, BTWN(mmdd(now), THIS.day_from, THIS.day_to));
    if (!BTWN(mmdd(now), THIS.day_from, THIS.day_to)) return false;
//        var hhmm = now.getHour() * 100 + now.getMinute();
    return true;
}

//    shuttle: function()
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

//eof
