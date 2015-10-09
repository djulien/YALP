'use strict';
//base class behavior for sequenced songs

//var fileio = require('fileio'); //'../plugins/services/fileio');
//var Player = require('my-plugins/media/my-player');
var fs = require('fs');
var glob = require('glob');
var path = require('path');
var inherits = require('inherits');
var elapsed = require('my-plugins/utils/elapsed');
var relpath = require('my-plugins/utils/relpath');
var scaled = require('my-plugins/utils/time-scale');
//var mm = require('musicmetadata'); //https://github.com/leetreveil/musicmetadata
var xform = require('stream').Transform || require('readable-stream').Transform; //poly-fill for older node.js
var EventEmitter = require('events').EventEmitter;
var PoolStream = require('pool_stream');
var Speaker = require('speaker');
var lame = require('lame');
var promisedio = require("promised-io/promise"); //https://github.com/kriszyp/promised-io

module.exports = Sequence; //commonjs; returns sequence factory/ctor to caller

//var YALP = YALP || {}; //namespace
///*YALP.*/ sequence = function(path, name) //ctor

//http://www.crockford.com/javascript/inheritance.html

//options: auto_collect
function Sequence(opts) //factory/ctor
{
    if (!(this instanceof Sequence)) return new Sequence(opts); //make "new" optional; make sure "this" is set
    xform.call(this, Object.assign(opts || {}, {objectMode: true, })); //pass options to base class; allow binary data
//    var m_stream = new xform({ objectMode: true, });
//    var m_evte = new EventEmitter;
//    var m_audio = null; //fs.createReadStream(this.songs[this.current].path)
//    opts = opts || {};
    opts = (typeof opts === 'object')? opts: (typeof opts !== 'undefined')? {path: opts, }: {};
//    opts = Object.assign({auto_collect: true, reqd: true, limit: 1, playlist: true}, opts);

    this.cues = [];
    this.models = [];
    this.media = []; //opts.path || ''; //TODO: allow > 1?
//    this.selected = 0;
    this.isSequence = true;
    this.elapsed = new elapsed(); //from creation until played
//NO    this.path = module.parent.filename; //already known by caller, but set it anyway in case wild card was used
    var stack = require('callsite')(); //https://www.npmjs.com/package/callsite
//    stack.forEach(function(site, inx){ console.log('stk[%d]: %s@%s:%d'.blue, inx, site.getFunctionName() || 'anonymous', relpath(site.getFileName()), site.getLineNumber()); });
//NOTE: can't use module.parent because it will be the same for all callers (due to module caching)
    this.path = stack[(stack[1].getFileName() == __filename)? 2: 1].getFileName(); //skip past optional nested "new" above
    this.name = opts.name || path.basename(this.path, path.extname(this.path)); //|| 'NONE';
    if (this.name == "index") this.name = path.basename(path.dirname(this.name)); //use folder name instead to give more meaningful name
    console.log("new sequence: name '%s', path '%s'".blue, this.name, this.path);

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
            if (!m_duration)
                this.media.forEach(function (file, inx)
                {
                    var cache = this.cache[file] || {};
                    if (!cache.duration) throw "Async scan of '" + relpath(file) + "' not completed yet.";
                    m_duration += cache.duration;
                }, this); //CAUTION: need to preserve context within forEach loop
            return m_duration;
        },
        set: function(newval)
        {
            if (newval) throw "Sequence.duration is read-only";
            m_duration = newval; //only allow it to be cleared
        },
    });

    this.addMedia = function(file)
    {
//        if (player.canPlay(file)
//        seq.index = this.songs.length;
        console.log("add media %s".blue, file);
        var fstat = fs.statSync(file);
        if (!fstat.isFile()) { console.log("not a file: %s".red, relpath(file)); return; }
        var cache = this.cache[file] || {};
        if (!cache.duration || (cache.timestamp < fstat.mtime)) //start reading file to get duration
        {
//TODO: bkg watcher to do this when music first added to dir
            console.log("scan '%s' for duration".cyan, relpath(file));
            var timer = new elapsed();
//kludge: the only reliable way to get audio duration seems to be to decode it all
            fs.createReadStream(file)
                .pipe(new lame.Decoder())
//                        .on('format', function (format) { this.pipe(new Speaker(format)); })
                .on('end', function()
                {
                    cache.timestamp = fstat.mtime;
                    cache.duration = timer.now;
                    cache_dirty();
                    console.log("scan complete; decoded %s: duration %s".cyan, relpath(file), scaled(timer.now));
//                    cb(timer.now);
                });
        }
        this.media.push(file);
        this.duration = 0; //invalidate cached value
    }
    this.addCue = function(file)
    {
//        if (player.canPlay(file)
//        seq.index = this.songs.length;
        console.log("add cue %s".blue, file);
        var fstat = fs.statSync(file);
        if (!fstat.isFile()) { console.log("not a file: %s".red, relpath(file)); return; }
        this.cues.push(file);
    }

/*
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
*/

//example mp3 player from https://gist.github.com/TooTallNate/3947591
//more info: https://jwarren.co.uk/blog/audio-on-the-raspberry-pi-with-node-js/
//fancier example from https://www.npmjs.com/package/pool_stream
//this is impressively awesome - 6 lines of portable code!
    this.play = function(opts) //manual start
    {
//        opts = opts || {};
        this.elapsed = new elapsed();
        if (!this.media.length) throw "No '" + this.name + "' media to play";
        opts = (typeof opts === 'object')? opts: (typeof opts !== 'undefined')? {index: 1 * opts, }: {};
        this.selected = Math.min(opts.rewind? 0: ('index' in opts)? 1 * opts.index: this.selected || 0, this.media.length - 1); //clamp to end of list
//        var next = opts.single? this.selected: (this.selected + 1) % this.songs.length;
//        var evtinfo = {current: this.songs[this.selected], next: this.songs[next], });
        this.emit('start', this.media[this.selected]);
        var this_seq = this;
        var pool = new PoolStream() //TODO: is pool useful here?
            .on('end', function ()
            {
                console.log('pool end time is: %s', scaled(this_seq.elapsed.now));
            })
            .on('finish', function ()
            {
                console.log('pool finish time is: %s', scaled(this_seq.elapsed.now));
            });
        console.log("open [%d/%d] '%s' for playback".cyan, this.selected, this.media.length, relpath(this.media[this.selected]));
        return fs.createReadStream(this.media[this.selected])
            .pipe(pool)
            .pipe(new lame.Decoder())
            .on('format', function (format)
            {
                this.pipe(new Speaker(format));
            })
// following events will tell you why need pool:
            .on('end', function ()
            {
                this_seq.emit('stop', this_seq.media[this_seq.selected]);
                console.log('audio end time is: %s', scaled(this_seq.elapsed.now));
            })
            .on('finish', function ()
            {
                console.log('writable finish time is: %s', scaled(this_seq.elapsed.now));
            });
    }

    this.pause = function()
    {
        this.interrupt = true; //async
        if (this.interrupted) this.elapsed = {now: this.elapsed.now, } //freeze elapsed timer
//TODO            .once('pause', function() { this.emit('pause', null, evtinfo); })
//TODO            .on('error', function(errinfo) { this.emit('error', errinfo); });
    }

/*TODO: are stop + resume useful?
    this.resume = function()
    {
        this.interrupt = true; //async
        this.elapsed = new elapsed(-this.elapsed.now); //exclude paused time so elapsed time is correct
            .once('play', function() { this.emit('resume', null, evtinfo); })
            .on('error', function(errinfo) { this.emit('error', errinfo); });
    }

    this.stop = function()
    {
        this.elapsed = {now: this.elapsed.now, }; //freeze elapsed timer
        this.songs[this.selected].stop()
            .once('stop', function() { this.emit('stop', null, evtinfo); })
            .on('error', function(errinfo) { this.emit('error', errinfo); });
    }
*/

    function cache_dirty()
    {
//        this.cache.dirty = true;
        if (this.cache_delaywr) clearTimeout(this.cache_delaywr);
        var cachefile = path.dirname(this.path) + "/cache.json";
        this.cache_delaywr = setTimeout(function()
        {
            fs.writeFile(cachefile, JSON.stringify(this.cache), function(err)
            {
                if (err) throw "SEQ: Can't write '" + relpath(cachefile) + "': " + err;
                else console.log("SEQ: wrote cache file '%s'".cyan, relpath(cachefile));
            });
        }, 20000); //start writing in 20 sec if no other changes
    }

    var AUDIO_EXTs = "mp3,mp4,wav,ogg,webm";
    if (opts.auto_collect)
    {
//        var callerdir = path.dirname(stack()[2].getFileName()); //start searches relative to actual sequence folder
//        console.log("caller dir: " + relpath(callerdir));
//        var files = glob.sync(callerdir + "/!(*-bk).mp3"); //look for any mp3 files in same dir
        var files = glob.sync(path.dirname(this.path) + "/**/!(*-bk).{" + AUDIO_EXTs + "}"); //, {}, function (err, files)
        console.log("SEQ: auto-collect got %d candidate media files from %s".blue, files.length, path.dirname(this.path) + "/**/!(*-bk).{" + AUDIO_EXTs + "}"); //relpath(path.dirname(this.path)));
        files.forEach(function(file, inx) { this.addMedia(file); }, this); //CAUTION: need to preserve context within forEach loop

        files = glob.sync(path.dirname(this.path) + "/**/*timing*!(*-bk)");
        console.log("SEQ: auto-collect got %d candidate timing files".blue, files.length);
        files.forEach(function(file, inx) { this.addCue(file); }, this); //CAUTION: need to preserve context within forEach loop
//TODO: auto-collect models? they are likely in different folder - how to find?
    }
    (opts.paths || (opts.path? [opts.path]: [])).forEach(function(file, inx)
    {
        if (file.match('/(' + AUDIO_EXTs.replace(/,/g, '|') + ')$/i')) this.addMedia(file);
        else this.addCue(file);
    }, this); //CAUTION: need to preserve context within forEach loop

//    return this; //not needed for ctor
}
//for js oop intro see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Introduction_to_Object-Oriented_JavaScript
inherits(Sequence, xform); //http://stackoverflow.com/questions/8898399/node-js-inheriting-from-eventemitter


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
