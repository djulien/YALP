#!/usr/bin/env node
//#!/usr/local/bin/node --expose-gc

'use strict';

//TODO: http://stackoverflow.com/questions/22235019/node-passthrough-stream-how-to-properly-address-piped-objects

require('colors');
var fs = require('fs');
var lame = require('lame');
//var glob = require('glob');
var path = require('path');
//var inherits = require('inherits');
var makenew = require('my-plugins/utils/makenew');
var caller = require('my-plugins/utils/caller').stack;
var ipc = require('my-plugins/utils/ipc');
var clock = require('my-plugins/utils/clock');
var Elapsed = require('my-plugins/utils/elapsed');
var shortname = require('my-plugins/utils/shortname');
//var add_method = require('my-plugins/my-extensions/object-enum').add_method;
//var baseclass = require('my-plugins/utils/my-eventemitter2').EventEmitter2; //eventemitter2').EventEmitter2; //https://github.com/asyncly/EventEmitter2

//http://lame.sourceforge.net/tech-FAQ.txt
//DECODER DELAY AT START OF FILE: 528 samples
//Extra padding at eof: LAME appends 288 samples to pad/flush the last granule
//  +  last frame of data is padded with 0's so that it has 1152 samples
//The number of bits/frame is:  frame_size*bit_rate/sample_rate.
//For MPEG1, frame_size = 1152 samples/frame
//For MPEG2, frame_size =  576 samples/frame
//var PoolStream = require('pool_stream');
//var MuteStream = require('mute-stream');
var mp3volume = require('node-mpg123-util');
var Speaker = require('speaker');
var lame = require('lame');

function isdef(thing) { return (typeof thing !== 'undefined'); }

//require('my-projects/shared/my-custom');
var empty = require('my-projects/playlists/empty'); //force custom models to load
var ChannelPool = require('my-projects/models/chpool');

//set up event handlers for all ports:
//ChannelPool.op_start = new Elapsed();
console.log("TODO: move to chpool?");
ChannelPool.all.forEach(function(chpool)
{
    chpool.incoming = []; //null;
    if (!chpool.port) { console.log("no port", chpool.name); return; }
//handlers:
    chpool.port
        .on('open', function() { chpool.isopen = chpool.port.isOpen(); console.log("'%s' opened @%s".green, chpool.opts.device, ChannelPool.op_elapsed.scaled()); })
//.flush(cb(err)) data received but not read
        .on('data', function(data)
        {
            console.log("'%s' received %d data @%s: '%s'".blue, chpool.opts.device, data.length, ChannelPool.op_elapsed.scaled(), data.toString('utf8').replace(/\n/g, "\\n"));
//            if (!chpool.incoming) chpool.incoming = [];
            chpool.incoming.push(data);
            chpool.inlast = clock.Now();
        })
        .on('error', function(err) { console.log("'%s' ERR @%s: ".red, chpool.opts.device, ChannelPool.op_elapsed.scaled(), err); })
        .on('close', function() { chpool.isopen = false; console.log("'%s' closed @%s".cyan, chpool.opts.device, ChannelPool.op_elapsed.scaled()); });
    chpool.port.wrote = function(data, cb) //write + drain; based on example from https://github.com/voodootikigod/node-serialport/blob/master/README.md
    {
        var elapsed = new Elapsed();
        chpool.port.write(data, function(err)
        {
            if (err) { console.log("'%s' write error @%s: ".red + err, chpool.opts.device, elapsed.scaled()); return cb(err); }
            chpool.port.drain(function(err)
            {
                if (err) { console.log("'%s' drain error @%s: ".red + err, chpool.pfs.device, elapsed.scaled()); return cb(err); }
                console.log("'%s' write+drain @%s: ".blue, chpool.opts.device, elapsed.scaled());
                cb();
            });
        });
    }
});


//TODO: allow player to start before playlist (ipc problem)
console.log("TODO: mem leak when playlist is not running");
function Player(opts)
{
//    console.log("player args", arguments);
    if (!(this instanceof Player)) return makenew(Player, arguments);
    var add_prop = function(name, value, vis) { if (!this[name]) Object.defineProperty(this, name, {value: value, enumerable: vis !== false}); }.bind(this); //expose prop but leave it read-only
    this.debug = function() { debugger; }

    add_prop('isPlayer', true);
    add_prop('opts', (typeof opts !== 'object')? {name: opts}: opts || {}); //preserve unknown options for subclasses
    if (!isdef(this.opts.ioahead)) this.opts.ioahead = 5; //allow 5 msec for USB + serial overhead
    if (!isdef(this.opts.tslop)) this.opts.tslop = 2.5; //allow +-2.5 msec for timing slop
    console.log("player opts %j", this.opts);
    add_prop('folder', this.opts.folder || path.dirname(caller(1, __filename))); //allow caller to override auto-collect folder in case playlist is elsewhere
    this.name = this.opts.name || shortname(this.folder); //caller(2)));
    this.started = clock.Now();
    this.m_media = {}; //{filename, duration, latency}
    this.frame = {}; //{frtime, frnext, bufs}
//    var m_ports = []; //{device, handler}
//    var m_state = STATES.idle;
//    var m_playing;

    var m_speed = 1.0;
    Object.defineProperty(this, 'speed', //let caller set it, but not directly
    {
        get: function() { return m_speed; },
        set: function(newval) { m_speed = Math.min(Math.max(newval, .1), 100); },
        enumerable: true,
    });
//    if (isdef(this.opts.speed)) this.speed = this.opts.speed;

    var m_volume = 1.0;
    Object.defineProperty(this, 'volume', //let caller set it, but not directly
    {
        get: function() { return m_volume; },
        set: function(newval) { m_volume = Math.max(newval, 0); if (this.decoder) ; },
        enumerable: true,
    });
//        if (this.decoder) mp3volume.setVolume(this.decoder.mh, newval); //TODO

//    var m_mute = new MuteStream();
    Object.defineProperty(this, 'mute', //let caller set it, but not directly
    {
        get: function() { return m_mute.muted; },
        set: function(newval) { if (newval) m_mute.mute(); else m_mute.unmute(); },
        enumerable: true,
    });

    var m_que = ipc.open('player'); //TODO: add designator to allow multiple players?
//send command to myself:
    this.cmd = function(args) //, cb)
    {
        m_que.send('cmd', Array.from(arguments), function(data, reply)
        {
            console.log("reply: ", data);
            return false; //i don't want more
        });
    }
    m_que.rcv('cmd', function(data, reply)
    {
//try{
//    console.log("cmd: length %d, data %j", data.length, data);
        switch (!data.length? data + '!': data[0] + ((data.length < 2)? '!': '*'))
        {
            case 'speed*':
                try { this.speed = data[1]; reply("speed set to %s", this.speed); }
                catch (exc) { reply("couldn't set speed: " + exc); }
                break;
            case 'volume*':
                try { this.volume = data[1]; reply("volume set to %s", this.volume); }
                catch (exc) { reply("couldn't set volume: " + exc); }
                break;
            case 'mute!':
            case 'unmute!':
                var want_mute = (data === 'mute');
                if ((want_mute && this.muted) || (!want_mute && !this.muted)) reply("already %sd", data);
                else { this.mute = want_mute; reply("now %sd? %s", data, this.muted); }
                break;
//            case 'play!':
//            case 'pause!':
//                var want_play = (data === 'play');
//                if (m_playing == want_play) { reply("already %s", data); }
//                reply(
//                this.elapsed = new Elapsed();
//                break;
            case 'open!':
            case 'close!':
                var want_open = (data === 'open');
                var ok = (want_open? this.port_open: this.port_close)();
                reply("ports %sed? %s", data, ok);
                break;
            case 'status!':
                reply("media '%j', speed %s, volume %s, muted %s, #subscribers %d, frtime %s, elapsed %s", this.media, this.speed, this.volume, this.mute, m_que.subscribers.length, this.frame.frtime, this.elapsed.now);
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
    }.bind(this));

//example messages for 10 sec song:
//{media: {filename: ..., duration: 10000, latency: 230}}
//{song: 0, frtime: 0, frnext: 50, bufs: {port1: [...], port2: [...], ...}}
//{song: 0, frtime: 50, frnext: 100, bufs: {port1: [...], port2: [...], ...}}
// :
//{song: 0, frtime: 9950, frnext: 10000, bufs: {port1: [...], port2: [...], ...}}
//{media: {filename: ..., duration: 10000, latency: 230}}
// :
//subscribe to frame + media events from playlist:
//    var m_frames = []; //fifo; not needed? (use timers instead, since there will only be a few)
    var m_playlist = ipc.open('playlist');
    m_playlist.send('frames', "hello!", function(data) //subscribe to playlist
    {
        if (data.media) //{filename, duration, latency}
        {
            this.media = data.media; //remember latest one (for status/debug, not critical to playback)
            console.log("media", data);
            if (data.playback) this.playback(data.media);
//            else this.elapsed = null; //no playback
        }
        if (isdef(data.frtime)) //{song, loop, frtime, frnext, outbufs}
        {
            buffix(data.outbufs);
            if (!this.audiostart) //player started part way thru a song?
            {
                console.log("no audio");
                if (this.restartreq > 3) process.exit(1); //too many retries
                m_playlist.send('cmd', 'rewind', function(data_reply) { console.log("rewind reply:", data_reply); return false; });
                this.restarted = (this.restarted || 0) + 1;
                return true; //request more data
            }
            data.audiostart = this.audiostart; //debug
            data.ioahead = this.opts.ioahead; //debug
            data.when = this.audiostart + data.frtime - this.opts.ioahead; //when to send output to hardware; set .ioahead to match USB/serial latency
            this.frame = data; //remember latest one (for status/debug, not critical to playback)
//??            if (!data.frtime) this.send_frame(data.outbufs); //first frame can go immediately
//for (var port in data.outbufs)
//    if (data.outbufs[port] && !data.outbufs[port].data.length) { console.log(data.outbufs); console.log(JSON.stringify(data.outbufs)); process.exit(1); }
            this.send_frame(data, true);
        }
        return true; //request more data
    }.bind(this));

    m_que.subscr('iostats', function(data_ignore, reply_cb)
    {
        reply_cb("okay, will send you iostats");
    });
    this.iostats = function(data) { m_que.broadcast(data); }

    if (this.opts.auto_open !== false) this.port_open();
}

function buffix(bufs)
{
    if (!bufs) return;
    for (var port in bufs)
    {
        var buf = bufs[port];
        if (buf && !isdef(buf.length)) buf.length = buf.data.length; //kludge: repair buffer (type changed somewhere along the way, maybe during socketio)
    }
}

Player.prototype.port_open = function()
{
    console.log("port open");
    ChannelPool.op_elapsed = new Elapsed();
    ChannelPool.all.forEach(function(chpool)
    {
        if (!chpool.port) { console.log(chpool.name + " no port"); return; }
        if (chpool.isopen) { console.log("port '%s' already open".red, port.name); return; }
        console.log("open port ", chpool.name, chpool.opts.device);
        chpool.port.open(); //function(err)
//        {
//            if (err) { console.log("'%s' open err after %s: ".red + err, chpool.opts.device, ChannelPool.op_elapsed.scaled()); return; }
//            console.log("'%s' opened after %d".green, chpool.opts.device, this.op_elapsed.scaled());
//            chpool.isopen = chpool.port.isOpen(); //true;
//            this.io("ls\n");
//            this.io("echo hello there;\n");
//            var buf = new Buffer(2000);
//            buf.fill(0x5a);
//            this.io(buf);
//        }.bind(this));
    }); //.bind(this));
}


Player.prototype.port_close = function()
{
    console.log("port close");
    ChannelPool.op_elapsed = new Elapsed();
    ChannelPool.all.forEach(function(chpool)
    {
        if (!chpool.port) { console.log(chpool.name + " no port"); return; }
        if (!chpool.isopen) { console.log("port '%s' already closed".red, port.name); return; }
        console.log("close port ", chpool.name, chpool.opts.device);
        chpool.port.close();
    });
}


Player.prototype.send_frame = function(frdata, first)
{
    var sent = clock.Now();
    var delay = frdata.when - sent;
    if (delay > this.opts.tslop)
    {
        if (!first) frdata.premature = delay; //for debug and iostats
        if (!first) console.log("frame[%s] premature by %d msec; rescheduling".red, frdata.frtime, delay);
        /*this.pending =*/ setTimeout(function() { this.send_frame(frdata); }.bind(this), delay); //(re)try later
        return;
    }
//    if (delay < -this.opts.tslop) console.log("frame[%s] late by %d msec!".red, frdata.frtime, -delay);
//    else if (delay) console.log("frame[%s] timing is a little off but not bad: %d msec".yellow, frdata.frtime, delay);
    frdata.outstatus = (delay < -this.opts.tslop)? "overdue": delay? "not-bad": "good";
//add info to frdata for debug and iostats:
    frdata.delay = delay;
    frdata.time_debug = 'sent ' + clock.Now.asString(sent) + ', when ' + clock.Now.asString(frdata.when) + ', audio ' + clock.Now.asString(this.audiostart); //useful for debug
//    console.log("frame", frdata); //without input
//first pass: save input received so far and send time-critical output
    ChannelPool.all.forEach(function(chpool, inx)
    {
        chpool.insave = chpool.incoming; //save input received so far for analysis/integrity checking
        chpool.intime = chpool.inlast - chpool.outlast;
        chpool.incoming = []; //null;
        if (!chpool.opts.device || !chpool.isopen) return;
        if (!(frdata.outbufs || {})[chpool.name]) return; //no data for this port
//if (!frdata.outbufs[chpool.name].data.length) { console.log(frdata.outbufs); console.log(JSON.stringify(frdata.outbufs)); process.exit(0); }
//        console.log("write", typeof frdata.outbufs[chpool.name], frdata.outbufs[chpool.name].length, frdata.outbufs[chpool.name]); process.exit();
        chpool.outlast = clock.Now();
        chpool.inlast = undefined;
        chpool.port.write(frdata.outbufs[chpool.name]);
    });
//second pass: package received input and send with output to I/O monitor
    frdata.inbufs = {};
    frdata.intimes = {};
    ChannelPool.all.forEach(function(chpool, inx)
    {
        var inlen = 0;
        chpool.insave.forEach(function(inchunk, inx) { inlen += inchunk.length; }); //add up chunk lengths first to reduce mem alloc overhead
        if (inlen) frdata.inbufs[chpool.name] = Buffer.concat(chpool.insave, inlen); //Uint8Array(inlen);
        frdata.intimes[chpool.name] = chpool.intime;
    });
    console.log("frame", frdata); //with input
    this.iostats(frdata); //send to I/O monitor for processing
}


//streamed audio playback:
Player.prototype.playback = function(opts) //{filename, duration, latency}
{
//    var pool = new PoolStream() //TODO: is pool useful here?
//    if (this.paused) { this.resume(); return; }
//    this.paused = false;
    var svvol = this.volume;
    this.pbcancel();
    this.elapsed = new Elapsed(); //measure startup latency
    this.audiostart = clock.Now() + (opts.latency || 0); //guess when audio will actually start; typically ~ 200 msec; adjust .latency to match
    console.log("set audiostart", this.audiostart, clock.Now.asString(this.audiostart), "latency", opts.latency);
    return fs.createReadStream(opts.filename)
//BROKEN            .pipe(pool) //does this make much difference?
//        .pipe(new MuteStream()) //mute) //TODO
        .pipe(this.decoder = new lame.Decoder())
        .once('format', function (format)
        {
//            if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
            this.volume = svvol; //restore stashed value
            console.log("fmt raw_encoding: %d, sampleRate: %d, channels: %d, signed? %d, float? %d, ulaw? %d, alaw? %d, bitDepth: %d".blue, format.raw_encoding, format.sampleRate, format.channels, format.signed, format.float, format.ulaw, format.alaw, format.bitDepth);
//                console.log("fmt @%s: ", this.elapsed.scaled(), JSON.stringify(format));
            this.decoder.pipe(this.speaker = new Speaker(format))
                .once('open', function () //speaker
                {
//                    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
                    var meminfo = opts.want_stats? process.memoryUsage(): {rss: 0, vsize: 0, heapTotal: 0, heapUsed: 0};
                    console.log("audio start latency: actual %d, expected %d", this.elapsed.now, opts.latency);
                    this.audiostart = clock.Now(); //sync playback to actual audio start time; first (init) frame can be premature, but subsequent frames must be synced correctly
//                    this.emit('song.start', {file: filename.path, latency: this.elapsed.now}); //, memrss: memscale(meminfo.rss), memvsize: memscale(meminfo.vsize || 0), memhtot: memscale(meminfo.heapTotal), memhused: memscale(meminfo.heapUsed)});
//                    if (this.elapsed.now > 200) console.log("audio '%s' started @%s, reseting", path.basename(filename.path), this.elapsed.scaled());
//                    this.elapsed = new elapsed(); //restart it at actual audio start
                }.bind(this))
                .once('flush', function () //speaker
                {
                    this.pbcancel();
                    console.log('audio flush time is: %s', this.elapsed.scaled());
                }.bind(this))
                .once('close', function () //speaker
                {
//                    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
//                        this.elapsed = {now: this.elapsed.now, scaled: function() { return }; //freeze elapsed timer
//                    this.elapsed.pause();
                    this.pbcancel();
                    console.log("audio ended @%s", this.elapsed.scaled());
//TODO                    this.seqstop(); //NOTE: do this < emit(stop) so no trailing data comes in > next song starts
//                    this.emit('song.stop', filename.path);
//                    if (this.media.length > 1) throw "Play more media"; //TODO
                }.bind(this))
                .once('error', function (err) //stream or speaker
                {
//                    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
                    this.pbcancel();
                    console.log('audio error @%s: '.red, this.elapsed.scaled(), err);
//                    this.error("audio error: " + err); //emit('error', err, filename.path);
//                        this.seqstop();
                }.bind(this))
                .once('finish', function () //stream
                {
//                    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
                    this.pbcancel();
                    console.log('audio finish time is: %s', this.elapsed.scaled());
                }.bind(this));
        }.bind(this))
        .once('error', function (err)
        {
//            if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
            this.pbcancel();
            this.error("lame decoder error: " + err); //emit('error', err, filename.path);
//            console.log('lame decoder error: '.red, err);
//                this.seqstop();
        }.bind(this));
}


Player.prototype.pbcancel = function()
{
//TODO: unreliable
    if (this.speaker) this.speaker.close();
    if (this.decoder) this.decoder.end();
    this.speaker = this.decoder = null;
}


var player = new Player({xauto_open: false});

//eof
