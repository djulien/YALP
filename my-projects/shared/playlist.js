//YALP Playlist base class

'use strict'; //help catch errors

var glob = require('glob');
var path = require('path');
var inherits = require('inherits');
var makenew = require('my-plugins/utils/makenew');
var caller = require('my-plugins/utils/caller').stack;
var ipc = require('my-plugins/utils/ipc');
var clock = require('my-plugins/utils/clock');
var Elapsed = require('my-plugins/utils/elapsed');
var shortname = require('my-plugins/utils/shortname');
var Q = require('q'); //https://github.com/kriskowal/q
//var add_method = require('my-plugins/my-extensions/object-enum').add_method;
var SchedulerMixin = require('my-projects/shared/scheduler').SchedulerMixin;
var Schedule = require('my-projects/shared/scheduler').Schedule;
//var PlaylistExtend = require('my-projects/shared/my-custom').PlaylistExtend;

function isdef(thing) { return (typeof thing !== 'undefined'); }
//add_method(Array.prototype, 'push_ifdef', function(newval) { if (isdef(newval)) this.push(newval); });

module.exports = Playlist;


function Playlist(opts)
{
//    console.log("playlist args", arguments);
    if (!(this instanceof Playlist)) return makenew(Playlist, arguments);
    var add_prop = function(name, value, vis) { if (!this[name]) Object.defineProperty(this, name, {value: value, enumerable: vis !== false}); }.bind(this); //expose prop but leave it read-only
    this.debug = function() { debugger; }

    add_prop('isPlaylist', true);
    add_prop('opts', (typeof opts !== 'object')? {name: opts}: opts || {}); //preserve unknown options for subclasses
    console.log("playlist opts %j", this.opts);
    add_prop('folder', this.opts.folder || path.dirname(caller(1, __filename))); //allow caller to override auto-collect folder in case playlist is elsewhere
    this.name = this.opts.name || shortname(this.folder); //caller(2)));
    var m_que = ipc.open('playlist'); //TODO: add designator to support multiple active playlists?
    this.SchedDrop(); //kludge: clear previous playlist schedule
    var m_ready = Q.promise(function(resolve, reject) //defer operation until ready
    {
//        this.ready = function(value) { resolve(value); };
        setTimeout(function() { resolve(0); }, 1000); //kludge: give async files time to load; TODO: pend/unpend
        this.error = function(value) { reject(value); };
    }.bind(this));

    var m_songs = [];
    Object.defineProperty(this, 'songs', //let caller set it, but not directly
    {
        get: function() { return m_songs; },
        set: function(newval) { (Array.isArray(newval)? newval: [newval]).forEach(function(pattern) { this.addSong(pattern); }.bind(this)); },
        enumerable: true,
    });
    this.addSong = function(pattern)
    {
        var where;
        var oldcount = this.songs.length;
        glob.sync(where = pattern || path.join(this.folder, '**', '!(*-bk).js')).forEach(function(filename)
        {
            console.log("adding song[%s] %s", m_songs.length, require.resolve(filename));
            var song = require(require.resolve(filename));
            if (!song) throw "Song '" + filename + "' failed to load.";
            if (!song.duration) throw "Song '" + filename + "' has no length.";
            m_songs.push(song);
//            console.log("added song", song);
        }); //.bind(this));
        if (this.songs.length > oldcount + 1) throw "Multiple files found at '" + where + "'";
        if (this.songs.length == oldcount) throw "Can't find sequence at '" + where + "'";
        return this; //fluent
    }

    var m_speed = 1.0;
    Object.defineProperty(this, 'speed', //let caller set it, but not directly
    {
        get: function() { return m_speed; },
        set: function(newval) { m_speed = Math.min(Math.max(newval, .1), 100); },
        enumerable: true,
    });
    if (isdef(this.opts.speed)) this.speed = this.opts.speed;
//    console.log("speed %s", this.speed);

    var m_schedule = [];
    Object.defineProperty(this, 'schedule',
    {
        get: function() { return m_schedule; },
        set: function(newval) { (Array.isArray(newval)? newval: [newval]).forEach(function(sched) { this.addSched(sched); }.bind(this)); },
        enumerable: true,
    });
    this.addSched = function(newsched)
    {
        console.log("add sched %j", newsched);
        m_schedule.push_ifdef(new Schedule(newsched));
        return this; //fluent
    }

//send command to myself:
    this.cmd = function(args) //, cb)
    {
        m_que.send('cmd', Array.from(arguments), function(data, reply)
        {
            console.log("reply: ", data);
            return false; //i don't want more
        });
    }

//    this.started;
    this.frtime = 0;
    this.selected = 0;
    var m_pending_stop;
    m_que.rcv('cmd', function(data, reply)
    {
//try{
        console.log("cmd: length %s, data %j", Array.isArray(data)? data.length: '-', data);
        switch (!Array.isArray(data)? data + '!': data[0] + ((data.length < 2)? '!': '*'))
        {
            case 'add*':
                try
                {
//TODO?                if (!data[1].length) data[1] = [data[1]];
                    this.addSong(data[1]);
//                song.filename = require.resolve(data[1]); //get path name
//                console.log("song filename", song.filename);
                    reply("added song[%s] '%s' ok", m_songs.length, data[1]);
                }
                catch (exc) { reply("failed to load song '%s' failed: %j", data[1], exc); }
                break;
            case 'play!':
                m_ready.then(function(resval) //defer response until aync files loaded
                {
                    if (!this.songs.length) { reply("no songs"); return; } //break;
//                this.started = clock.Now();
                    reply("now playing[%s], was? %s", clock.Now.asString(/*this.started*/), !!m_playing);
                    m_pending_stop = false; //cancelled
                    if (m_playing) return; //break;
                    send_frame(); //start playback
//                if (this.opts.auto_play === false) m_que.unref(); //started manually; allow playlist to close after playback
//test                if (this.opts.auto_play === false) setTimeout(function() { m_que.close(); }, 44000);
//                if (this.opts.auto_play === false) setTimeout(function() { console.log("handles", process._getActiveHandles()); }, 45000);
                }.bind(this));
                break;
            case 'pause!':
                reply("now paused, was? %s", !m_playing);
                if (m_playing) clearTimeout(m_playing);
                m_pending_stop = false; //satisfied
                m_playing = null;
                break;
            case 'speed*':
                if (m_playing) { reply("busy playing"); break; }
                this.speed = data[1]; //Math.min(Math.max(1 * data[1], .1), 100);
                reply("speed set to %s", this.speed);
                break;
            case 'rewind!':
                if (!this.songs.length) { reply("no songs"); break; }
//                if (m_playing) //pause + rewind + play; //{ reply("busy playing"); break; }
//                {
//                    if (m_playing) clearTimeout(m_playing);
//                    m_pending_stop = false; //satisfied
//                    m_playing = null;
//                    this.frtime = 0; //rewind current song only; useful if player starts up part way thru a song
//                    this.started = clock.Now();
//                    reply("now playing[%s], was? %s", clock.Now.asString(this.started), !!m_playing);
//                    m_pending_stop = false; //cancelled
//                    this.need_media = true;
//                    if (m_playing) break;
//                    send_frame(); //start playback
//                }
//TODO                if (!m_playing) m_que.broadcast({media: this.songs[this.selected].media[0], playback: false});
                reply("rewind[%s], was playing? %s", clock.Now.asString(), !!m_playing);
                if (!m_playing) this.selected = 0; //restart current song only; useful if player starts up part way thru a song
                this.frtime = 0;
                break;
            case 'status!':
                reply("song[%s/%s].frame[%s/%s], playing? %s, #subscribers %d", this.selected, this.songs.length, this.frtime, (this.selected < this.songs.length)? this.songs[this.selected].duration: -1, !!m_playing, m_que.subscribers.length);
                break;
            case 'quit!':
                reply("will quit now");
                process.exit(0);
                break;
            default:
                reply("unknown command: %s %j", typeof data, data);
                break;
        }
//}catch(exc){ reply("error: " + exc); }
    }.bind(this));

    var m_playing = null;
//    var this.elapsed; //= new Elapsed();
//    var buffers = [], ff = 0;
//    for (var i = 0; i < 2; ++i) buffers.push(new Buffer(100)); //4096));
    var send_frame = function()
    {
        m_playing = null; //timer satisfied
//NOTE: prep frame data even if no subscribers; this allows on-demand fx to be pre-rendered and cached for better playback performance
//NOTE: timing does not need to be precise here because we are doing read-ahead for downstream player; however, we don't want to stray too far off, so use auto-correcting cumulative timing
        if (!this.frtime) //start of song
        {
            var media = this.songs[this.selected].media[0];
            media.latency = this.songs[this.selected].latency; //kludge: override media latency with seq
            m_que.broadcast({media: media, playback: true}); //load new media in player *before* first frame
            this.elapsed = new Elapsed(); //used to help maintain cumulative timing accuracy
        }
        var frdata = this.songs[this.selected].render(this.frtime); //, buffers[ff ^= 1]); //{frnext, ports}; //alternating buffers; current buffer is still needed until data is actually sent
//frdata.allbuf = this.songs[this.selected].chvals(this.frtime / 50); //debug: entire buf
//        console.log("rendered frdata: %j", frdata);
//if (frdata.outbufs) for (var port in frdata.outbufs)
//{
//    if (!frdata.outbufs[port]) continue;
//    if (isdef(frdata.outbufs[port].length)) continue;
//    console.log(port, frdata.outbufs);
//    process.exit(1);
//}
//if (frdata.outbufs) for (var port in frdata.outbufs) { if (Buffer.isBuffer(frdata.outbufs[port])) continue;
//var buf = frdata.outbufs[port];
//console.log(JSON.stringify(buf));
//console.log(typeof buf);
//console.log(buf.constructor.name);
//console.log(Buffer.isBuffer(buf));
//console.log(buf.length);
//process.exit(1);
//}
        frdata.song = this.selected; //useful for debug
        frdata.loop = this.opts.loop; //useful for debug
        frdata.duration = this.songs[this.selected].duration; //useful for debug
        frdata.frtime = this.frtime;
        if (!frdata.frnext) frdata.frnext = this.songs[this.selected].duration;
        frdata.delay = frdata.frnext / this.speed - this.elapsed.now; //for debug/info only
//        if (m_que.subscribers.length || !this.frtime) console.log("prep[@%s] song[%s/%s].frtime[%s/%s] for %s subscribers (%s good, %s bad), delay next %s", clock.Now.asString(), this.selected, this.songs.length, this.frtime, this.songs.length? this.songs[this.selected].duration: -1, m_que.subscribers.length, m_que.subscribers.numgood, m_que.subscribers.numbad, frdata.delay); //frnext - this.elapsed.now);
//no, do it anyway    if (subscribers.length)
        /*if (frdata.outbufs)*/ m_que.broadcast(frdata); //NOTE: send even if no data so bad connections can be cleaned up; TODO: pipe?
//example messages enqueued for 10 sec song:
//{media: {filename: ..., duration: 10000, playback: true, latency: 230}}
//{song: 0, frtime: 0, frnext: 50, bufs: {port1: [...], port2: [...], ...}}
//{song: 0, frtime: 50, frnext: 100, bufs: {port1: [...], port2: [...], ...}}
// :
//{song: 0, frtime: 9950, frnext: 10000, bufs: {port1: [...], port2: [...], ...}}
//{media: {filename: ..., duration: 10000, playback: true, latency: 230}}
// :

//        frdata.frnext /= this.speed;
//        var limit = this.songs[this.selected].duration / this.speed;
        if ((this.frtime = frdata.frnext) >= this.songs[this.selected].duration) //advance to next frame, wrap at end; TODO: push down into Sequence?
        {
            this.frtime = 0;
            if (++this.selected >= this.songs.length) { this.selected = 0; if (this.opts.loop && (this.opts.loop !== true)) --this.opts.loop; }
//            console.log("next up: song[%s/%s], stop? %s, loop? %s: ", this.selected, this.songs.length, m_pending_stop, this.loop, this.songs[this.selected]);
            if (!this.selected && (m_pending_stop || !this.opts.loop)) { console.warn("done"); return; } //{ console.log("handles", process._getActiveHandles()); return; } //cmd('pause');
//            m_que.broadcast({media: this.songs[this.selected].media[0], playback: true}); //load new media in player
//            this.need_media = true;
        }

//    console.log("delay next %d", frdata.next - elapsed.now);
        m_playing = setTimeout(function() { send_frame(); }, frdata.frnext / this.speed - this.elapsed.now); //auto-correct cumulative timing; //frdata.curtime); //NOTE: timing is approx
    }.bind(this);

//    var m_subscribers = [];
//    var m_numgood = 0, m_numbad = 0;
    m_que.subscr /*.rcv*/('frames', function(data_ignore, reply_cb)
    {
//debugger;
//        console.log("subscribe req:", data_ignore);
//        m_que.m_subscribers.push(reply_cb);
//        m_que.subscribers.length = m_que.m_subscribers.length;
        reply_cb("okay, will send you frames");
    });
//    m_que.broadcast = function(send_data)
//    {
//        if (m_que.subscribers.length) console.log("playlist broadcast:", send_data);
//        var keepers = [];
//        m_que.subscribers.numgood = m_que.subscribers.numbad = 0;
//        m_que.m_subscribers.forEach(function(reply_cb, inx)
//        {
//            if (reply_cb(send_data) > 0) { ++m_que.subscribers.numgood; keepers.push(reply_cb); }
//            else { console.log("stop sending to %s", inx); ++m_que.subscribers.numbad; }
//        });
//        var pruned = m_que.m_subscribers.length - keepers.length;
//        if (!pruned) return;
//        m_que.m_subscribers = keepers;
//        m_que.subscribers.length = m_que.m_subscribers.length;
//        console.log("%s subscribers left after %s pruned", m_que.m_subscribers.length, pruned);
//    }

//NO    this.ports = {};
    if (this.opts.auto_play !== false) /*setTimeout*/ process.nextTick(function() { this.scheduler(); }.bind(this)); //, 1000); //give caller time to adjust schedule or async files to load

    function xadd_prop(name, value) //expose prop but leave it read-only
    {
//        console.log("this is ", this, this.constructor.name, this.constructor + '');
//        if (thing[name]) return; //already there
        Object.defineProperty(this, name, {value: value, enumerable: true});
//        console.log("extended %s with %s".blue, thing.constructor.name, name);
    }
//    if (this.opts.extend) this.opts.extend(this); //do this after prototype is completely defined
    if (this.opts.auto_collect !== false) console.log("TODO: auto-collect songs at %s", this.folder);
}
inherits(Playlist, SchedulerMixin); //mixin class


Playlist.prototype.play = function(opts)
{
    console.log("Running playlist '%s' ...".green, this.name);
    this.cmd('play');
}

Playlist.prototype.pause = function(opts)
{
    console.log("Stopping playlist '%s' ...".red, this.name);
    this.cmd('pause'); //pending_stop = true;
}

//var PlaylistMixin = require('my-projects/my-models');
//if (PlaylistMixin) PlaylistMixin(Playlist); //do this after prototype is completely defined


//eof
