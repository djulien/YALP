//YALP streaming playlist
//commands accepted on 'cmd' channel:
//  play/pause = manual control, overrides automated scheduler
//  speed = adjust playback speed [0 .. 1.0]
//  volume = set playback volume [0 .. 1.0]
//  mute/unmute = turn sound off/on
//output:
//  audio is streamed directly to sound card
//  h/w control is sent to downstream controllers on 'outhw' channel a few frames ahead of when it's needed
'use strict';

require('colors');
var fs = require('fs');
var glob = function(pattern, cb) //require('glob');
{
//    var colors = require('colors/safe');
    console.log("glob: looking for %s".blue, pattern);
    return require('glob').apply(null, arguments);
}
var path = require('path');
var sprintf = require('sprintf-js').sprintf; //, vsprintf = require('sprintf-js').vprintf;
var shortname = require('my-plugins/utils/shortname');
var callsite = require('callsite'); //https://www.npmjs.com/package/callsite
var relpath = require('my-plugins/utils/relpath');
var elapsed = require('my-plugins/utils/elapsed');
var ipc = require('my-plugins/utils/ipc');

module.exports = Playlist; //commonjs; returns playlist factory/ctor to caller
/*
module.exports = function(opts)
{
//    var def = Q.defer();
//    var pl = new Playlist(opts, def.resolve, def.reject);
//    return def.promise;
    return Q.Promise(function(resolve, reject, notify)
    {
        var pl = new Playlist(opts, resolve, reject, notify);
debugger;
    })
    .timeout(10000, "Playlist is taking too long to load!");
}
*/

//var YALP = YALP || {}; //namespace
///*YALP.*/ sequence = function(path, name) //ctor

//http://www.crockford.com/javascript/inheritance.html

//http://www.sandersdenardi.com/readable-writable-transform-streams-node/
//sequence is readable stream, player is consumer, non-flow mode
//var baseclass = require('stream').Readable;
//var baseclass = require('my-plugins/streamers/outhw');
//var baseclass = require('eventemitter2').EventEmitter2; //https://github.com/asyncly/EventEmitter2
var baseclass = require('my-plugins/utils/my-eventemitter2').EventEmitter2; //'eventemitter2').EventEmitter2; //https://github.com/asyncly/EventEmitter2
//var xform = require('stream').Transform || require('readable-stream').Transform; //poly-fill for older node.js
var inherits = require('inherits');
//require('longjohn'); //http://www.mattinsler.com/post/26396305882/announcing-longjohn-long-stack-traces-for-nodejs

//options: auto_play (schedule or loop), auto_next, loop
function Playlist(opts) //, resolve, reject, notify) //factory/ctor
{
    if (!(this instanceof Playlist)) return new Playlist(opts); //, resolve, reject, notify); //make "new" optional; make sure "this" is set
    baseclass.call(this); //, Object.assign(opts || {}, {objectMode: true, })); //pass options to base class; allow binary data
//console.log("playlist ctor in");
//    var m_stream = new xform({ objectMode: true, });
//    var m_evte = new EventEmitter;
//    var m_audio = null; //fs.createReadStream(this.songs[this.current].path)
    opts = (typeof opts === 'string')? {name: opts}: opts || {};
//    opts = (typeof opts === 'object')? opts: (typeof opts !== 'undefined')? {index: 1 * opts, }: {};

    this.songs = [];
    this.selected = 0; //undefined;
    this.isPlaylist = true; //for paranoid/sanity checking of "this"
    this.elapsed = new elapsed(); //used for load/init time tracking until first playback
//    this.outhw = new Outhw();
    var stack = callsite();
//NOTE: can't use module.parent because it will be the same for all callers (due to module caching)
//    this.path = module.parent.filename; //already known by caller, but set it anyway
    this.path = stack[(stack[1].getFileName() == __filename)? 2: 1].getFileName(); //skip past optional nested "new" above
    this.name = opts.name || shortname(this.path); //|| 'NONE';
    if (this.name == 'index') this.name = shortname(path.dirname(this.path)); //try to give it a more meaningful name
//    this.schedule = null; //TODO
    this.setMaxListeners(4); //catch leaks sooner (EventEmitter)
    if (opts.silent !== false) this.emit = this.emit_logged.bind(this);

    var m_oldvolume; //cached for unmute
    this.mute = function(off)
    {
        if (off === false) { this.unmute(); return; } //alias
        if (typeof m_oldvolume !== 'undefined') return; //already muted
        m_oldvolume = this.volume; this.volume = 0;
    }
    this.unmute = function()
    {
        if (typeof m_oldvolume === 'undefined') return; //already unmuted
        this.volume = m_oldvolume; m_oldvolume = undefined;
    }

    require('./mixins/duration')(this, 'songs');
    require('./mixins/volume')(this, function(newval)
    {
        if (this.selected < this.songs.length) this.songs[this.selected].volume = newval;
    }.bind(this));
    require('./mixins/speed')(this, function(newval)
    {
        if (newval != 1.0) throw "TODO: speed";
        if (this.selected < this.songs.length) this.songs[this.selected].speed = newval;
    }.bind(this));
    require('./mixins/promise-keepers')(this, 10000);

//    var this_playlist = this;
    this.on('cmd', function(cmd, opts) //kludge: async listener function to avoid recursion in multi-song play loop
    {
        if (!this.isPlaylist) throw "wrong 'this'"; //paranoid/sanity context check
//        console.log("playlist in-stream: cmd %s, opts %s".yellow, cmd, JSON.stringify(opts));
        switch (cmd || '')
        {
//enforce event emitter interface by using private functions:
            case "play":
                if (resume.call(this, opts)) return;
                play.apply(this, Array.prototype.slice.call(arguments, 1));
                return;
            case "pause": pause.call(this, opts); return;
//            case "resume": resume.call(this, opts); return;
//            case "next": next.apply(this, args); return;
            case "stop": stop.call(this, opts); return;
            case "volume": this.volume = opts; return;
            case "speed": this.speed = opts; return;
            default: this.warn("Unknown command: '%s'", JSON.stringify(cmd || ''));
        }
    }.bind(this));
//pass-thru methods to shared player object:
//    this.on = m_evte.on;
//    this.play = this.paths[0].play;
//    this.stop = this.paths[0].stop;
//    this.next = this.paths[0].next;
//    this.pipe = m_stream.pipe;

//NOTE: at least one song must be added by any of the 3 ways below in order for playlist to be marked ready; a playlist without any songs is useless anyway
    if (opts.auto_collect !== false)
    {
        this.pend("Auto-collecting songs from '%s' ...", relpath(path.dirname(this.path)));
//        if (!this.isPlaylist) throw "wrong 'this'"; //paranoid/sanity context check
//        this.warn("Auto-collecting songs ...");
//        console.log("PL auto-collect: %s".blue, path.dirname(this.path) + "/**/!(*-bk).js");
        glob(path.join(path.dirname(this.path), "**", "!(*-bk).js"), function(err, files) //); //mp3"); //, {}, function (err, files)
        {
            if (!this.isPlaylist) throw "wrong 'this'"; //paranoid/sanity context check
//            this.warn("Playlist auto-collect found %d candidate seq file%s", files.length, (files.length != 1)? 's': '');
            (files || []).forEach(function(filename, inx) { this.addSong(filename); }.bind(this)); //, this_playlist); //CAUTION: need to preserve context within forEach loop
            this.unpend(); //kludge: force readiness if no files to load; at least one song must be pended before this, otherwise playlist will be prematurely marked ready
        }.bind(this)); //CAUTION: need to preserve context within glob callback
    }
//    (opts.paths || []).forEach(function(filename, inx) { this.addSong(filename); }.bind(this)); //, this); //CAUTION: need to preserve context within forEach loop
//    this.paths.forEach(function (seq, inx) { this.duration += seq.duration; }, this); //CAUTION: need to preserve context within forEach loop
    process.nextTick(function() //allow caller to add songs or make other changes after ctor returns but before playlist is marked ready
    {
        if (!this.isPlaylist) throw "wrong 'this'"; //paranoid/sanity context check
//        if (this.songs && (typeof this.songs.length === 'undefined')) this.songs = [this.songs]; //convert singleton to array
        if (this.schedule && (typeof this.schedule.length === 'undefined')) this.schedule = [this.schedule]; //convert singleton to array
        (this.songs || []).forEach(function(filename, inx) { this.addSong.call(this, filename); }.bind(this)); //, this_playlist); //CAUTION: need to preserve context within forEach loop
    }.bind(this));

    this.validate = function()
    {
        for (var i = this.songs.length; i > 0; --i) if (typeof this.songs[i - 1] !== 'object') this.songs.splice(i - 1, 1); //remove strings that were converted to objects
//        console.log("#songs ", this.songs.length, this.songs);
        if (this.schedule) console.log("TODO: Schedule not yet implemented (found %d items)".red, this.schedule.length);
        if (this.opening) console.log("TODO: Opening song not yet supported; found '%s'".red, relpath(this.opening));
        if (this.closing) console.log("TODO: Closing song not yet supported; found '%s'".red, relpath(this.closing));
    }

//no    if (!this.pending) this.ready(); //this.emit('ready'); //caller might want to add something, so don't mark it ready yet
//    return this; //not needed for ctor
//console.log("playlist ctor out");
}
inherits(Playlist, baseclass); //http://stackoverflow.com/questions/8898399/node-js-inheriting-from-eventemitter
//Playlist.prototype = Object.create(xform.prototype); //http://www.sitepoint.com/simple-inheritance-javascript/
//????Door.prototype.__proto__ = events.EventEmitter.prototype;
//MyStream.prototype._read = function () {


//format info for easier viewing in node inspector:
Playlist.prototype.debug = function()
{
    if (!global.v8debug) return; //http://stackoverflow.com/questions/6889470/how-to-programmatically-detect-debug-mode-in-nodejs
//    setTimeout(function() //give async data time to arrive
    var buf = ['playlist info:'];
    if (this.songs.length === 'undefined') buf.push(sprintf("song: '%s'", relpath(this.songs)));
    else (this.songs || []).forEach(function(song, inx)
    {
//        console.log(typeof song.duration, song.duration); //might not be loaded yet
        if (song.isSequence)
            buf.push(sprintf("song[%d/%d]: name '%s', path '%s', duration %d", inx, this.songs.length, song.name || '??', song.path || '?', song.duration || 0)); //song duration might not be loaded yet if this is called before .ready()
        else
            buf.push(sprintf("song[%d/%d]: " + song)); //not loaded yet
    }.bind(this)); //, this); //CAUTION: need to preserve context within forEach loop
    buf.push(sprintf("total duration: %d msec", this.duration || 0));
    if (this.schedule.length === 'undefined') buf.push("schedule: " + JSON.stringify(this.schedule));
    else (this.schedule || []).forEach(function(sched, inx)
    {
        buf.push(sprintf("sched[%d/%d]: name '%s', day from %d, to %d, time from %s, to %s", inx, this.schedule.length, sched.name || '(no name)', sched.day_from || 0, sched.day_to || 0, sched.time_from || 0, sched.time_to || 0));
    }.bind(this)); //, this); //CAUTION: need to preserve context within forEach loop
    this.debug_songs = buf.join('\n');
    debugger; //https://nodejs.org/api/debugger.html
//    }, 1000);
}


//song is a sequence folder; NO LONGER also a readable stream
Playlist.prototype.addSong = function(seqpath)
{
    if (!this.isPlaylist) throw "wrong 'this'"; //paranoid/sanity context check
    if (typeof seqpath === 'object') return; //skip sequences that are already loaded
    this.pend("Loading candidate song(s) from '%s'", relpath(seqpath)); //NOTE: need to do this immediately so playlist will be pending at process.nextTick
//        console.log("PL add song %s".blue, seqpath);
//        opts = (typeof opts === 'object')? opts: (typeof opts !== 'undefined')? {path: opts, }: {};
//    glob.sync(seqpath).forEach(function (filename, index)
//    var this_playlist = this; //kludge: preserve context; TODO: bind http://stackoverflow.com/questions/15455009/js-call-apply-vs-bind
    glob(seqpath, function(err, files) //, index)
    {
        if (!this.isPlaylist) throw "wrong 'this'"; //paranoid/sanity context check
        (files || []).forEach(function(filename, inx)
        {
            if (!this.isPlaylist) throw "wrong 'this'"; //paranoid/sanity context check
            this.duration = 0; //invalidate cached value if new song is added
            this.pend(); //"Playlist resolved candidate %s", filename);
            var seq = null;
            try
            {
                seq = require(filename); //seqpath); //maybe add try/catch here to allow graceful continuation? OTOH, glob said it was there, so it's okay to require it
                if (!seq.isSequence) { this.unpend("Not a sequence '%s'", relpath(filename)); return; }
            }
            catch (exc)
            {
                this.unpend("Broken sequence '%s': " + exc, relpath(filename));
                return;
            }
//            var this_playlist = this; //kludge: preserve context; TODO: bind http://stackoverflow.com/questions/15455009/js-call-apply-vs-bind
            seq
                .once('sequence.ready', function() { this.unpend("Sequence loaded '%s'", relpath(filename)); }.bind(this)) //once('ready', function()
                .once('error', function(err) { this.error("ERROR add song '" + relpath(filename) + "': " + err); }.bind(this));
//        propagate(song, this);
            seq.index = this.songs.length;
            this.songs.push(seq);
//            seq.pipe(this, {end: false}); //https://github.com/atamborrino/streamee.js/blob/master/index.js
/*??
        seq.on('end', function()
        {
            self.nActiveStreams--;
            if (self.nActiveStreams === 0) self.push(null); // end
        });
*/
        }.bind(this)); //, this_playlist); //CAUTION: need to preserve context within forEach loop
        this.unpend(); //mark async glob completed
    }.bind(this)); //NA, this); //CAUTION: need to preserve context within glob callback
//    this.duration = 0; //invalidate cached value
}


//example mp3 player from https://gist.github.com/TooTallNate/3947591
//more info: https://jwarren.co.uk/blog/audio-on-the-raspberry-pi-with-node-js/
//fancier example from https://www.npmjs.com/package/pool_stream
//this is impressively awesome - 6 lines of portable code!
//Playlist.prototype.play = function(opts)
function play(opts)
{
    if (!this.isPlaylist) throw "wrong 'this'"; //paranoid/sanity context check
//        opts = opts || {};
    if (!this.songs.length) throw "No songs to play";
    opts = (typeof opts === 'object')? opts: (typeof opts !== 'undefined')? {index: 1 * opts, }: {};
    if (this.songs.length == 1) opts.single = true;
    if (opts.loop === true) opts.loop = 1;
    if (opts.emit !== false) this.elapsed = new elapsed(); //mark start of playback
    if (opts.shuffle) //rearrange list in-place (ensures complete list is used and playlist length is maintained); index prop indicates original order
    {
        this.songs.forEach(function(song, inx) { song.order = Math.random(); });
        this.songs.sort(function(lhs, rhs) { return (lhs.order < rhs.order)? -1: (lhs.order > rhs.order)? 1: 0; });
    }
    this.selected = Math.min(opts.rewind? 0: ('index' in opts)? 1 * opts.index: this.selected || 0, this.songs.length - 1); //clamp to end of list
//        if (this.selected < 0) throw "Can't find currently selected song";
    var next = opts.single? this.selected: (this.selected + 1) % this.songs.length;
    var evtinfo = {current: this.songs[this.selected], next: this.songs[next], };
    if (opts.emit !== false) this.emit('playlist.begin', null, evtinfo); //playlist
    this.songs[this.selected].volume = this.volume;
    if (this.progress) clearInterval(this.progress); this.progress = null;
    var progintv = (opts.progress === true)? this.songs[this.selected].duration / 100: !opts.progress? 0: (opts.progress < 100)? opts.progress * 1000: opts.progress; //caller probably wanted seconds not msec; default to 1%
    if (progintv) this.progress = setInterval(function()
    {
        if (!evtinfo.current.elapsed.paused) this.emit('playlist.progress', null, evtinfo);
    }.bind(this), Math.max(250, progintv)); //progress updates no faster than 1/4 sec
    if (!this.index) //show mem usage at start of each loop (casual memory leak detection)
    {
        var meminfo = process.memoryUsage();
        var memscale = require('my-plugins/utils/mem-scale');
        console.log("mem: %s, %s, %s, %s ...".blue, memscale(meminfo.rss), memscale(meminfo.vsize || 0), memscale(meminfo.heapTotal), memscale(meminfo.heapUsed));
    }
//    var this_playlist = this; //kludge: preserve context; TODO: bind http://stackoverflow.com/questions/15455009/js-call-apply-vs-bind
//    console.log("playlist play [%d]", this.selected, this.songs.length);
//    console.log(typeof this.songs[this.selected], this.songs[this.selected].isSequence);

    if (!this.songs[this.selected].hasevt)
        this.songs[this.selected] //.play(0)
            .on/*ce*/('song.start', function() { /*console.log("PLEVT: start")*/; this.emit('song.start', null, evtinfo); }.bind(this)) //song
            .on('song.progress', function() { /*console.log("PLEVT: progress")*/; this.emit('song.progress', null, evtinfo); }.bind(this))
//            .once('pause', function() { /*console.log("PLEVT: pause")*/; this.emit('pause', null, evtinfo); }.bind(this))
//            .once('resume', function() { /*console.log("PLEVT: resume")*/; this.emit('resume', null, evtinfo); }.bind(this))
            .on('error', function(errinfo) { console.log("PLEVT: error"); this.emit('error', errinfo, evtinfo); }.bind(this))
            .on/*ce*/('song.stop', function()
            {
                if (!this.isPlaylist) throw "wrong 'this'"; //paranoid/sanity context check
//                console.log("PLEVT: stop, loop? %d, single? %d, selected %d < length %d? %d, next %d", !!opts.loop, !!opts.single, this.selected, this.songs.length, this.selected < this.songs.length - 1, next);
                this.emit('song.stop', null, evtinfo); //song
                if (this.progress) clearInterval(this.progress); this.progress = null; //don't leave dangling timer
//single: loop--: repeat current
//multi: first play thru to end of list, then check loop--
//                if (opts.loop && (opts.single || (this.selected < this.songs.length - 1)))
                opts.index = next; opts.emit = false;
                if ((!opts.single && (this.selected < this.songs.length - 1)) || --opts.loop) //first play to end of list, then check loop
                    this.emit('cmd', "play", opts); //{index: next, single: opts.single, loop: opts.loop, emit: false, }); //push({cmd: "play", index: next, }); //avoid recursion
                else this.emit('playlist.end', null, evtinfo); //playlist
            }.bind(this))
            .hasevt = true;
    this.songs[this.selected] //.play(0)
        .emit('cmd', 'play'); //.play(0);
}

//TODO: are pause + resume useful?
//Playlist.prototype.pause = function()
function pause()
{
    if (!this.isPlaylist) throw "wrong 'this'"; //paranoid/sanity context check
    if (this.songs[this.selected].paused) return false;
    this.elapsed.pause(); // = {now: this.elapsed.now, }; //freeze elapsed timer
    this.songs[this.selected].emit('cmd', 'pause'); //pause();
    return true;
//        return this.songs[this.selected].pause()
//            .once('pause', function() { console.log("PLEVT: pause"); this.emit('pause', null, evtinfo); })
//            .on('error', function(errinfo) { console.log("PLEVT: error", errinfo); this.emit('error', errinfo); });
}

//Playlist.prototype.resume = function() //TODO: is this really useful?
function resume()
{
    if (!this.isPlaylist) throw "wrong 'this'"; //paranoid/sanity context check
    if (!this.songs[this.selected].paused) return false;
    this.elapsed.resume(); // = new elapsed(-this.elapsed.now); //exclude paused time so elapsed time is correct
    this.songs[this.selected].emit('cmd', 'resume'); //.resume();
    return true;
//        return this.songs[this.selected].play()
//            .once('play', function() { console.log("PLEVT: play"); this.emit('resume', null, evtinfo); })
//            .on('error', function(errinfo) { console.log("PLEVT: error", errinfo); this.emit('error', errinfo); });
}

//Playlist.prototype.stop = function() //TODO: is this really useful?
function stop()
{
    if (!this.isPlaylist) throw "wrong 'this'"; //paranoid/sanity context check
    if (this.progress) clearInterval(this.progress); this.progress = null;
    this.elapsed.pause(); // = {now: this.elapsed.now, }; //freeze elapsed timer
    this.songs[this.selected].emit('cmd', 'stop'); //stop();
//            .once('stop', function() { console.log("PLEVT: stop"); this.emit('stop', null, evtinfo); })
//            .on('error', function(errinfo) { console.log("PLEVT: error", errinfo); this.emit('error', errinfo); });
}


/*TODO ????
Playlist.prototype._transform = function (chunk, encoding, done)
{
    console.log("playlist in-stream: cmd ".yellow, JSON.stringify(chunk));
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

Playlist.prototype._flush = function (done)
{
    console.log("playlist in-stream: EOF".yellow);
    this.stop();
    done();
}
*/


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
