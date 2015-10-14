'use strict';
//base class behavior for sequenced songs

//var fileio = require('fileio'); //'../plugins/services/fileio');
//var Player = require('my-plugins/media/my-player');
var fs = require('fs');
var glob = require('glob');
var path = require('path');
var byline = require('byline');
var inherits = require('inherits');
var Tokenizer = require('tokenizer');
require('buffertools').extend(); //https://github.com/bnoordhuis/node-buffertools
var elapsed = require('my-plugins/utils/elapsed');
var relpath = require('my-plugins/utils/relpath');
var shortname = require('my-plugins/utils/shortname');
//var scaled = require('my-plugins/utils/time-scale');
//var mm = require('musicmetadata'); //https://github.com/leetreveil/musicmetadata
//var xform = require('stream').Transform || require('readable-stream').Transform; //poly-fill for older node.js
//var baseclass = require('events').EventEmitter;
var baseclass = require('my-plugins/streamers/seqdata');
//http://stackoverflow.com/questions/3505575/how-can-i-get-the-duration-of-an-mp3-file-cbr-or-vbr-with-a-very-small-library
//http://www.mp3-converter.com/mp3codec/mp3_anatomy.htm
//var mp3dat = require('mp3dat');
//http://lame.sourceforge.net/tech-FAQ.txt
//DECODER DELAY AT START OF FILE: 528 samples
//Extra padding at eof: LAME appends 288 samples to pad/flush the last granule
//  +  last frame of data is padded with 0's so that it has 1152 samples
//The number of bits/frame is:  frame_size*bit_rate/sample_rate.
//For MPEG1, frame_size = 1152 samples/frame
//For MPEG2, frame_size =  576 samples/frame
var PoolStream = require('pool_stream');
//var MuteStream = require('mute-stream');
var mp3volume = require('node-mpg123-util');
var Speaker = require('speaker');
var lame = require('lame');
//var promisedio = require("promised-io/promise"); //https://github.com/kriszyp/promised-io
var Q = require('q'); //https://github.com/kriskowal/q

module.exports = Sequence; //commonjs; returns sequence factory/ctor to caller
/*
module.exports = function(opts)
{
//    var def = Q.defer();
//    var pl = new Playlist(opts, def.resolve, def.reject);
//    return def.promise;
    return Q.Promise(function(resolve, reject, notify)
    {
        var seq = new Sequence(opts, resolve, reject, notify);
debugger;
    })
    .timeout(10000, "Sequence is taking too long to load!");
}
*/


//var YALP = YALP || {}; //namespace
///*YALP.*/ sequence = function(path, name) //ctor

//http://www.crockford.com/javascript/inheritance.html

//options: auto_collect
function Sequence(opts) //, resolve, reject, notify) //factory/ctor
{
    if (!(this instanceof Sequence)) return new Sequence(opts); //, resolve, reject, notify); //make "new" optional; make sure "this" is set
    baseclass.call(this, Object.assign(opts || {}, {objectMode: true, })); //pass options to base class; allow binary data
//console.log("seq ctor in");
//    var m_stream = new baseclass({ objectMode: true, });
//    var m_evte = new EventEmitter;
//    var m_audio = null; //fs.createReadStream(this.songs[this.current].path)
//    opts = opts || {};
    opts = (typeof opts === 'object')? opts: (typeof opts !== 'undefined')? {path: opts, }: {};
//    opts = Object.assign({auto_collect: true, reqd: true, limit: 1, playlist: true}, opts);

//    this.cues = [];
//    this.seqdata = new seqdata();
    this.models = [];
    this.media = []; //opts.path || ''; //TODO: allow > 1?
//    this.selected = 0;
    this.isSequence = true;
//    this.elapsed = new elapsed(); //junk value until played
//NO    this.path = module.parent.filename; //already known by caller, but set it anyway in case wild card was used
    var stack = require('callsite')(); //https://www.npmjs.com/package/callsite
//    stack.forEach(function(site, inx){ console.log('stk[%d]: %s@%s:%d'.blue, inx, site.getFunctionName() || 'anonymous', relpath(site.getFileName()), site.getLineNumber()); });
//NOTE: can't use module.parent because it will be the same for all callers (due to module caching)
    this.path = stack[(stack[1].getFileName() == __filename)? 2: 1].getFileName(); //skip past optional nested "new" above
    this.name = opts.name || path.basename(this.path, path.extname(this.path)); //|| 'NONE';
    if (this.name == "index") this.name = path.basename(path.dirname(this.name)); //use folder name instead to give more meaningful name
//    console.log("new sequence: name '%s', path '%s'".blue, this.name, this.path);

//    glob.sync(path.dirname(this.path) + "/* + seqpath).forEach(function (file, index)
//    if (fs.statSync(path.dirname(this.path) + "/cache.json").isFile()? require('../../package.json')
    try { this.cache = require(path.dirname(this.path) + "/cache"); } //.json"); }
    catch (exc) { this.cache = {}; }; //NOTE: https://nodejs.org/api/fs.html#fs_fs_exists_path_callback recommends just trying it rather than fstat first

    var m_duration = 0; //this.duration = 0;
//    var duration_known = promisedio.Deferred;
    Object.defineProperty(this, "duration",
    {
        get: function() //read-only, computed, cached
        {
            if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
            if (!m_duration)
                this.media.forEach(function (file, inx) { m_duration += file.duration /*this.getDuration()*/; }, this); //CAUTION: need to preserve context within forEach loop
            return m_duration;
        },
        set: function(newval)
        {
            if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
            if (newval) throw "Sequence.duration is read-only";
            m_duration = newval; //only allow it to be cleared
        },
    });

    var m_volume;
    Object.defineProperty(this, "volume",
    {
        get: function()
        {
            return m_volume; //this.decoder? mp3volume.getVolume(this.decoder.mh): m_volume; //always used saved value (in case decoder stale)
        },
        set: function(newval)
        {
//            console.log("set volume %d", newval);
            m_volume = newval; // || 0.5; //stash it in case playback is not active
            if (this.decoder) mp3volume.setVolume(this.decoder.mh, m_volume); //TODO
        },
    });

//promise-keepers:
    var this_seq = this;
    var m_promise = Q.Promise(function(resolve, reject, notify)
    {
//        var seq = new Sequence(opts, resolve, reject, notify);
        this_seq.mark_ready = function()
        {
            resolve(this);
        }
        this_seq.error = function(msg)
        {
//            console.trace();
//            var stack = require('callsite')(); //https://www.npmjs.com/package/callsite
//            stack.forEach(function(site, inx){ console.log('stk[%d]: %s@%s:%d'.blue, inx, site.getFunctionName() || 'anonymous', relpath(site.getFileName()), site.getLineNumber()); });
            reject(msg);
        }
        this_seq.warn = function(msg)
        {
            notify(msg);
        }
    })
    .timeout(10000, "Sequence is taking too long to load!");
    this.ready = function(cb) //expose promise call-back as a method so sequence api can be used before it's ready
    {
        return m_promise.then(cb);
    }

    var m_pending = 0;
    this.pend = function(num) { m_pending += (num || 1); } //console.log("seq %s pend+ %d", this.name, m_pending); }
    this.unpend = function(num)
    {
        if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
//        console.log("seq %s pend- %d", this.name, m_pending - (num || 1));
        if (m_pending -= (num || 1)) return;
        this.mark_ready(); //emit('ready');
    }

    var AUDIO_EXTs = "mp3,mp4,wav,ogg,webm";
    if (opts.auto_collect)
    {
        this.pend();
//        var callerdir = path.dirname(stack()[2].getFileName()); //start searches relative to actual sequence folder
//        console.log("caller dir: " + relpath(callerdir));
//        var files = glob.sync(callerdir + "/!(*-bk).mp3"); //look for any mp3 files in same dir
        var files = glob.sync(path.dirname(this.path) + "/**/!(*-bk).{" + AUDIO_EXTs + "}"); //, {}, function (err, files)
//        console.log("SEQ: auto-collect got %d candidate media files from %s".blue, files.length, path.dirname(this.path) + "/**/!(*-bk).{" + AUDIO_EXTs + "}"); //relpath(path.dirname(this.path)));
        files.forEach(function(file, inx) { this.addMedia(file); }, this); //CAUTION: need to preserve context within forEach loop

        files = glob.sync(path.dirname(this.path) + "/**/*timing*!(*-bk)");
//        console.log("SEQ: auto-collect got %d candidate timing files".blue, files.length);
        files.forEach(function(file, inx) { this.addCues(file); }, this); //CAUTION: need to preserve context within forEach loop
//TODO: auto-collect models? they are likely in different folder - how to find?
        this.unpend(); //kludge: force readiness if no files to load
    }
    (opts.paths || (opts.path? [opts.path]: [])).forEach(function(file, inx)
    {
        if (file.match('/(' + AUDIO_EXTs.replace(/,/g, '|') + ')$/i')) this.addMedia(file);
        else this.addCue(file);
    }, this); //CAUTION: need to preserve context within forEach loop
    if (opts.interval) this.addFixedFrames(opts.interval); //generate frame cues at specified interval
//    {
//        if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
//        for (var time = 0, frnum = 0; time < this.duration; time += opts.interval, ++frnum)
//            this.addCue("frame", time, Math.min(time + opts.interval, this.duration), "frame#" + frnum, "seq");
//    }

//no    if (!this.pending) this.ready(); //this.emit('ready'); //caller might want to add something, so don't mark it ready yet
//    return this; //not needed for ctor
//console.log("seq ctor out");
}
//for js oop intro see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Introduction_to_Object-Oriented_JavaScript
inherits(Sequence, baseclass); //http://stackoverflow.com/questions/8898399/node-js-inheriting-from-eventemitter


Sequence.prototype.addMedia = function(filename)
{
    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
//        if (player.canPlay(file)
//        seq.index = this.songs.length;
//        console.log("add media %s".blue, file);
    var fstat = fs.statSync(filename); //TODO: glob
    if (!fstat.isFile()) { console.log("not a file: %s".red, relpath(filename)); return; }
    var duration = 0; //mp3len(filename);
    var cache = this.cache[filename] || {};
    if (!cache.duration || ((cache.stamp || 0) < fstat.mtime))
    {
//TODO: bkg watcher to do this when music first added to dir?
        console.log("scan '%s' for duration".cyan, relpath(filename));
        cache.stamp = (new Date()).getTime();
        cache.time = (new Date()).toString(); //human-readable, mainly for debug
        cache.duration = mp3len(filename);
        this.cache[filename] = cache; //in case entry not there
        cache_dirty();
    }
    this.media.push({path: filename, /*mtime: fstat.mtime,*/ duration: cache.duration, });
    this.duration = 0; //invalidate cached value
    return this; //allow chaining
}


//    this.getFrame = function(frnum) //NOTE: this must be overridden by instance; dummy logic supplied here
//    {
//        var buf = new Buffer(16); //simulate 16 channels
//        buf.clear(frnum);
//        return {frnum: frnum || 1, when: 50 * frnum, data: buf, len: buf.length, };
//    }


/*
Sequence.prototype._transform = function (chunk, encoding, done)
{
    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
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

Sequence.prototype._flush = function (done)
{
    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
    console.log("playlist in-stream: EOF".blue);
    this.stop();
    done();
}
*/


//example mp3 player from https://gist.github.com/TooTallNate/3947591
//more info: https://jwarren.co.uk/blog/audio-on-the-raspberry-pi-with-node-js/
//fancier example from https://www.npmjs.com/package/pool_stream
//this is impressively awesome - 6 lines of portable code!
//    var pool = new PoolStream() //TODO: is pool useful here?
//    var mute = new MuteStream();
Sequence.prototype.play = function(opts) //manual start
{
    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
    if (this.paused) { this.resume(); return; }
//        opts = opts || {};
    this.paused = false;
    this.elapsed = new elapsed();
    if (!this.media.length) throw "No '" + this.name + "' media to play";
    opts = (typeof opts === 'object')? opts: (typeof opts !== 'undefined')? {index: 1 * opts, }: {};
    this.selected = Math.min(opts.rewind? 0: ('index' in opts)? 1 * opts.index: this.selected || 0, this.media.length - 1); //clamp to end of list
//        var next = opts.single? this.selected: (this.selected + 1) % this.songs.length;
//        var evtinfo = {current: this.songs[this.selected], next: this.songs[next], });
//        require('callsite')().forEach(function(caller) { console.log("SEQ.play called from %s@%s:%d", caller.getFunctionName() || 'anonymous', relpath(caller.getFileName()), caller.getLineNumber()); });
    this.buffered = 0; //TODO
    var this_seq = this;
    this.seqstart(); //NOTE: this will probably send out first (init) frame prematurely
    var svvol = this.volume;

    var filename = this.media[this.selected]; //.path;
//        console.log("read [%d/%d] '%s' for playback @%s".cyan, this.selected, this.media.length, path.basename(filename.path), this.elapsed.scaled());
    return fs.createReadStream(this.media[this.selected].path)
//BROKEN            .pipe(pool) //does this make much difference?
//            .pipe(new MuteStream()) //mute) //TODO
        .pipe(this_seq.decoder = new lame.Decoder())
        .once('format', function (format)
        {
            this_seq.volume = svvol; //restore stashed value
//                console.log("raw_encoding: %d, sampleRate: %d, channels: %d, signed? %d, float? %d, ulaw? %d, alaw? %d, bitDepth: %d".cyan, format.raw_encoding, format.sampleRate, format.channels, format.signed, format.float, format.ulaw, format.alaw, format.bitDepth);
//                console.log("fmt @%s: ", this_seq.elapsed.scaled(), JSON.stringify(format));
//                console.log(this.media || "not there".red);
            this.pipe(this_seq.speaker = new Speaker(format))
//                    .on('end', function ()
//                    {
//                        console.log('speaker end time is: %s', this_seq.elapsed.scaled());
//                    })
                .once('open', function () //speaker
                {
                    if (!this_seq.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
                    this.starttime = Now(); //this is the actual audio start time; first (init) frame can be premature, but subsequent frames must be synced correctly
                    this_seq.emit('start', filename.path);
                    if (this_seq.elapsed.now > 200) console.log("audio '%s' started @%s, reseting", path.basename(filename.path), this_seq.elapsed.scaled());
                    this.elapsed = new elapsed(); //restart it at actual audio start
                })
                .once('flush', function () //speaker
                {
                    this_seq.speaker = this_seq.decoder = null;
//                        console.log('audio flush time is: %s', this_seq.elapsed.scaled());
                })
                .once('close', function () //speaker
                {
                    if (!this_seq.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
//                        this_seq.elapsed = {now: this_seq.elapsed.now, scaled: function() { return }; //freeze elapsed timer
                    this_seq.elapsed.pause();
                    this_seq.speaker = this_seq.decoder = null;
//                        console.log("audio '%s' ended @%s", path.basename(filename.path), this_seq.elapsed.scaled());
                    this_seq.seqstop(); //NOTE: do this < emit(stop) so no trailing data comes in > next song starts
                    this_seq.emit('stop', filename.path);
/*
                    var cache = this_seq.cache[filename.path] || {};
                    if ((cache.stamp || 0) < filename.mtime)
                    {
                        cache.stamp = (new Date()).getTime();
                        cache.time = (new Date()).toString();
                        cache.duration = this_seq.elapsed.now; //save for other usage
                        this_seq.cache[filename.path] = cache; //in case entry not there
                        cache_dirty.apply(this_seq); //preserve "this"
                    }
*/
                    if (this_seq.media.length > 1) throw "Play more media"; //TODO
                })
                .on('error', function (err) //stream or speaker
                {
                    if (!this_seq.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
//??                        this_seq.speaker = this_seq.decoder = null;
                    console.log('audio error: '.red, err);
                    this_seq.error("audio error: " + err); //emit('error', err, filename.path);
//                        this_seq.seqstop();
                })
                .once('finish', function () //stream
                {
                    if (!this_seq.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
                    this_seq.speaker = this_seq.decoder = null;
//                        console.log('audio finish time is: %s', this_seq.elapsed.scaled());
                });
        })
        .on('error', function (err)
        {
            if (!this_seq.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
//??                        this_seq.speaker = this_seq.decoder = null;
            this_seq.error("lame decoder error: " + err); //emit('error', err, filename.path);
//            console.log('lame decoder error: '.red, err);
//                this_seq.seqstop();
        });
}


//TODO: are pause + resume useful?
Sequence.prototype.pause = function()
{
    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
    if (this.paused) return;
    this.elapsed.pause(); // = {now: this.elapsed.now, } //freeze elapsed timer
//        mute.pause();
    this.paused = true;
//        this.interrupt = true; //async
//TODO            .once('pause', function() { this.emit('pause', null, evtinfo); })
//TODO            .on('error', function(errinfo) { this.emit('error', errinfo); });
}


Sequence.prototype.resume = function()
{
    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
    if (!this.paused) return;
    this.elapsed.resume(); // = new elapsed(-this.elapsed.now); //exclude paused time so total elapsed time is still correct
//        mute.resume();
    this.paused = false;
//        this.interrupt = true; //async
//            .once('play', function() { this.emit('resume', null, evtinfo); })
//            .on('error', function(errinfo) { this.emit('error', errinfo); });
}


Sequence.prototype.stop = function()
{
    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
//        this.elapsed = {now: this.elapsed.now, }; //freeze elapsed timer
    this.speaker.unpipe(); //from player.js
    this.speaker.end();
    this.speaker = this.decoder = null;
//            .once('stop', function() { this.emit('stop', null, evtinfo); })
//            .on('error', function(errinfo) { this.emit('error', errinfo); });
}


Sequence.prototype.cache_dirty = function()
{
    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
//        this.cache.dirty = true;
//        if (this.cache_delaywr) clearTimeout(this.cache_delaywr);
    var cachefile = path.dirname(this.path) + "/cache.json";
    console.log("wr cache %s", cachefile);
//        this.cache_delaywr = setTimeout(function()
    {
        fs.writeFile(cachefile, JSON.stringify(this.cache), function(err)
        {
            if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
            if (err) this.error("SEQ: Can't write '" + relpath(cachefile) + "': " + err);
            else this.warn /*console.log*/("SEQ: wrote cache file '%s'" + relpath(cachefile));
        });
}//        }, 20000); //start writing in 20 sec if no other changes
}


//eof

//use same player object for all songs (to make a playlist)
/*
var player = new Player()
    .on('downloading', function(song)
    {
        console.log("SEQ: downloading %s".green, song.src);
    })
    .on('playing', function(song)
    {
//     var buf = ""; for (var i in song) buf += "," + i;
        console.log("SEQ: now playing %s".green, relpath(song.src));
//        setTimeout(function(){ player.next(); }, 5000); //only first 5 sec
    })
    .on('playend', function(song)
    {
        console.log("SEQ: finished %s, Switching to next one ...".green, song.src);
    })
    .on('error', function(err)
    {
//??        if (!this.busy) throw "Player didn't know it was busy";
        console.log('SEQ: ERROR'.red, err);
    });
*/


/*
    if (opts.path)
        if (opts.path.length) this.paths.push.apply(this.paths, opts.path); //this.paths.splice(this.paths.length, 0, this.paths);
        else this.paths.push(opts.path);
    if (opts.reqd && (this.paths.length < 1)) throw "missing media file(s) in " + callerdir;
    if (this.paths.length > opts.limit) throw "too many media files (" + this.paths.length + " vs. " + opts.limit + "), last was: '" + relpath(this.paths[this.paths.length - 1]) + "'"; //TODO: support multiple media files?
    this.name = opts.name || (this.paths.length && path.basename(this.paths[0], path.extname(this.paths[0]))) || 'NONE';
//    player.add(this.paths);
    this.duration = 0;
    this.paths.forEach(function (filename, inx)
    {
//the duration of MP3 files is recorded as an ID3 tag in the file header
//        var relpath = relpath(filename);
        console.log("player add %s".blue, relpath(filename)); //filename);
//        console.log("stat:", fs.statSync(filename));
//        mp3dat.stat({stream: fs.createReadStream(filename), size: fs.statSync(filename).size}, function (data)
//        var duration = 0;
//        var parser = mm(fs.createReadStream(filename), function (err, metadata)
//        {
//            if (err) console.log("mp3 data err: ".red, err);
//            else { console.log("mp3 dat for '%s': ".green, relpath(filename), metadata.duration); duration = metadata.duration; }
//        });
//        parser.on('TLEN', function (result) { console.log("TLEN: ", result); duration = result; });
TODO: https://github.com/nikhilm/node-taglib
        this.duration += fs.statSync(filename).size; //TBD
        if (opts.playlist)
        {
            console.log("pl len ", player.playlistlen, inx);
            if (!inx) /-*if (this.paths.length)*-/ this.plinx = player.playlistlen; //remember index in play list of first file for this seq
            player.add(filename);
        }
    }, this); //CAUTION: need to preserve context within forEach loop
    if (opts.playlist && this.paths.length)
    {
        this.play = function (duration) //player.play;
        {
//            if (this.plinx === 'undefined') return; //not playable (not on play list)
            console.log("seq[%d] %s play %d", this.plinx, this.paths[0], duration);
//            player.stop();
/-*
            if (player.timer) { clearTimeout(player.timer); player.timer = null; }
            if ((duration !== 'undefined') && (duration < this.duration)) //partial only
            {
                player.timer = setTimeout(function() { player.stop(); player.timer = null; }, duration);
            }
            player.play(this.plinx);
//            else player.next();
*-/
            return player.play(this.plinx, duration);
        };
//pass-thru methods to shared player object:
//        this.play = player.playPartial;
        this.stop = player.stop;
        this.next = player.next;
        this.on = player.on;
    }

    return this;
};
*/
