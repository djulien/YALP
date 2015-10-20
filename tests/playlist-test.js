'use strict';

//if (!global.has_ext)
//{
//    global.has_ext = require('my-plugins/my-extensions/');
//    delete require.cache[require.resolve(__filename)];
//    require(__filename); //re-load myself with language extensions enabled
//}
//else { ... }
console.log("START UP");

require('colors');
var scaled = require('my-plugins/utils/time-scale');
var elapsed = require('my-plugins/utils/elapsed');


var fs = require('fs');
var lame = require('lame');

function test3()
{
    var mp3len = require('my-plugins/utils/mp3len');
    var relpath = require('my-plugins/utils/relpath');
    var glob = {sync: function(pattern) { console.log("glob(%s)".blue, pattern); return require('glob').sync(pattern); }, };
    var files = glob.sync(process.cwd() + '/my-projects/songs/xmas/**/!(*-bk).mp3');
    var duration = [0.0, 0.0, 0.0];
    var frames = [0, 0, 0];
    var total = [0, 0, 0];
    var ofs = 0;
    files./*slice(0, 1).*/ forEach(function (filename, inx)
    {
        console.log("'%s' cbr est: %d", relpath(filename), mp3len(filename, true)); //(faster) for CBR only
        console.log("'%s' vbr est: %d", relpath(filename), mp3len(filename)); //(slower) for VBR (or CBR)
//        mp3len(filename, true, function(duration) //(faster) for CBR only
//        {
//            console.log("cbr est: %d", duration);
//        });
//        mp3len(filename, function(duration) //(slower) for VBR (or CBR)
//        {
//            console.log("vbr est: %d", duration);
//        });
    });
}


function test1()
{
var fs = require('fs');
var glob = {sync: function(pattern) { console.log("glob(%s)".blue, pattern); return require('glob').sync(pattern); }, };
var relpath = require('my-plugins/utils/relpath');
var PoolStream = require('pool_stream');
var MuteStream = require('mute-stream')
var Speaker = require('speaker');
this.media = glob.sync(process.cwd() + '/my-projects/songs/xmas/Amaz*/!(*-bk).mp3');
console.log("media: ", JSON.stringify(this.media));
this.selected = 0;
var this_seq = this;
this.elapsed = new elapsed();
        console.log("open [%d/%d] '%s' for playback".cyan, this.selected, this.media.length, relpath(this.media[this.selected]));
        var pool = new PoolStream() //TODO: is pool useful here?
        var mute = new MuteStream();
        fs.createReadStream(this.media[this.selected])
//BROKEN            .pipe(pool) //does this make much difference?
            .pipe(mute)
            .pipe(new lame.Decoder())
            .once('format', function (format)
            {
                console.log("raw_encoding: %d, sampleRate: %d, channels: %d, signed? %d, float? %d, ulaw? %d, alaw? %d, bitDepth: %d".cyan, format.raw_encoding, format.sampleRate, format.channels, format.signed, format.float, format.ulaw, format.alaw, format.bitDepth);
                console.log("fmt @%s: ", this_seq.elapsed.scaled(), JSON.stringify(format));
                console.log(this.media || "not there".red);
                this.pipe(new Speaker(format))
//                    .on('end', function ()
//                    {
//                        console.log('speaker end time is: %s', this_seq.elapsed.scaled());
//                    })
                    .once('open', function () //speaker
                    {
                        console.log('speaker open time is: %s', this_seq.elapsed.scaled());
                    })
                    .once('flush', function () //speaker
                    {
                        console.log('speaker flush time is: %s', this_seq.elapsed.scaled());
                    })
                    .once('close', function () //speaker
                    {
                        console.log('speaker close time is: %s', this_seq.elapsed.scaled());
                    })
                    .on('error', function (err) //stream or speaker
                    {
                        console.log('speaker error: '.red, err);
                    })
                    .once('finish', function () //stream
                    {
                        console.log('speaker finish time is: %s', this_seq.elapsed.scaled());
                    });
            })
            .on('error', function (err)
            {
                console.log('lame error: '.red, err);
            });
}



function test2()
{
    var loading = new elapsed();
    var playlist = require('my-projects/playlists/xmas2015');
//    playlist.play(); return; //do this once to load cache
//    playlist.pipe(outhw); //NOTE: starts playback

//    setTimeout(test, 21000); //give async scan time to run and cache time to write

//    return;
//    console.log("%s duration: %s, #songs %d, scheduled? %d", playlist.name, scaled(playlist.duration), playlist.songs.length, !!playlist.scheduler);
//    setTimeout(function()
    playlist.on('playlist.ready', function(pl)
    {
        console.log("playlist ready after %s", loading.scaled());
//        playback(pl); //playlist); //.play()); //play once
        pl.volume = 1.0;
        pl.emit('cmd', {loop: 10, }); //single: true, }); //{single: true, index: 1, }); //{loop: 2, single: true, index: 1});
    }) //, 10); //kludge: give async callbacks time to finish
    .on('playlist.begin', function(err, info) { if (err) showerr("begin", err); else console.log("begin".green); })
    .on('song.start', function(err, info) { if (err) showerr("start", err); else status("start", info.current); })
    .on('song.progress', function(err, info) { if (err) showerr("progess", err); else status("progress", info.current); })
    .on('playlist.progress', function(err, info) { if (err) showerr("progess", err); else status("progress", info.current); })
//      .on('pause', function(err, info) { if (err) showerr("pause", err); else status("pause", info.current); })
//      .on('resume', function(err, info) { if (err) showerr("resume", err); else status("resume", info.current); })
    .on('song.stop', function(err, info) { if (err) showerr("stop", err); else status("stop", info.current); }) //, info.next); })
    .on('playlist.end', function(err, info) { if (err) showerr("end", err); else console.log("end".cyan); })
    .on('error', function(err) { console.log("ERROR ".red, err);
//            console.trace();
//            var stack = require('callsite')(); //https://www.npmjs.com/package/callsite
//            stack.forEach(function(site, inx){ console.log('stk[%d]: %s@%s:%d'.blue, inx, site.getFunctionName() || 'anonymous', relpath(site.getFileName()), site.getLineNumber()); });
    });
//playback(playlist.scheduled()); //play according to schedule
}


function playback(player)
{
    player.volume = 1.0;
    player
      .on('playlist.begin', function(err, info) { if (err) showerr("begin", err); else console.log("begin".green); })
      .on('song.start', function(err, info) { if (err) showerr("start", err); else status("start", info.current); })
      .on('song.progress', function(err, info) { if (err) showerr("progess", err); else status("progress", info.current); })
      .on('playlist.progress', function(err, info) { if (err) showerr("progess", err); else status("progress", info.current); })
//      .on('pause', function(err, info) { if (err) showerr("pause", err); else status("pause", info.current); })
//      .on('resume', function(err, info) { if (err) showerr("resume", err); else status("resume", info.current); })
      .on('song.stop', function(err, info) { if (err) showerr("stop", err); else status("stop", info.current); }) //, info.next); })
      .on('playlist.end', function(err, info) { if (err) showerr("end", err); else console.log("end".cyan); })
      .on('error', function(err) { if (err) showerr("end", err); })
      .emit('cmd', {loop: 10, }); //single: true, }); //{single: true, index: 1, }); //{loop: 2, single: true, index: 1});
//    setTimeout(function() { player.volume = 0.5; }, 2000);
//    setTimeout(function() { player.volume = 0.3; }, 3000);
//    setTimeout(function() { player.volume = 2.0; }, 6000);
//    setTimeout(function() { player.mute(); }, 16000);
//    setTimeout(function() { player.unmute(); }, 26000);
}

function status(when, current, next)
{
    var color = (when == "start")? 'green': (when.indexOf("next") != -1)? 'cyan': 'blue';
    console.log("%s song[%d] %s, duration %s, elapsed %s, played %d%%, buffered %d%%"[color], when, current.index, current.name, scaled(current.duration), current.elapsed.scaled(), 100*current.played/current.duration, 100*current.buffered/current.duration);
    if (next) status("  " + when + " next", next);
}

function showerr(when, err)
{
    console.log("%s ERROR: ".red, when, JSON.stringify(err));
}


//https://strongloop.com/strongblog/node-js-callback-hell-promises-generators/
//promises: http://www.html5rocks.com/en/tutorials/es6/promises/#toc-async
//https://github.com/kriskowal/q
//If a function cannot return a value or throw an exception without blocking, it can return a promise instead.
var Q = require('q'); //https://github.com/kriskowal/q

var fs = require('fs')
var path = require('path')
var Q = require('q')
var fs_readdir = Q.denodeify(fs.readdir) // [1]
var fs_stat = Q.denodeify(fs.stat)

//https://strongloop.com/strongblog/node-js-callback-hell-promises-generators/
function test4()
{
debugger;
findLargest(__dirname)
  .then(function (filename) {
    console.log('largest file was:', filename)
  })
  .catch(console.error)
}
function findLargest(dir) {
  return fs_readdir(dir)
    .then(function (files) {
      var promises = files.map(function (file) {
        return fs_stat(path.join(dir,file))
      })
      return Q.all(promises).then(function (stats) { // [2]
        return [files, stats] // [3]
      })
    })
    .then(function (data) { // [4]
      var files = data[0]
      var stats = data[1]
      var largest = stats
        .filter(function (stat) { return stat.isFile() })
        .reduce(function (prev, next) {
        if (prev.size > next.size) return prev
          return next
        })
      return files[stats.indexOf(largest)]
    })
}

/*
function test4()
{
    var thing = new AsyncPL(4)
        .then(function(okval)
        {
            console.log("ok val ".green, okval);
        })
        .progress(function(val)
        {
            console.log("progress: ", val);
        })
        .catch(function(errval)
        {
            console.log("err val ".red, errval)
        })
        .finally(function() { console.log("DONE"); })
        .done();
    console.log("result coming soon ..."); //guarantted to happen before promise call-backs
}


function AsyncPL(args)
{
    return Q.all([AsyncS(1.5), AsyncS(5), AsyncS(10), AsyncSlow(4)]);
//    return AsyncS(0)
//        .then(AsyncS(1))
//        .then(
}


function AsyncS(args)
{
    if (args <= 0) return Q.fcall(function() { throw new Error("bad value: " + args); });
    else return Q.fcall(function()
    {
        setTimeout(function() { return args; }, args * 1000);
    });
}


function AsyncSlow(len)
{
    return Q.Promise(function(resolve, reject, notify)
    {
        for (var i = 0; i <= len; ++i)
            setTimeout(function() { ((i == len)? resolve: notify)((100 * i / len) + '%'); }, i * 1000);
    });
}


var readFileP = Q.denodeify(fs.readFile);
var globP = Q.denodeify(glob);
function mp3len_cb(file, cb)
{
    fs.readFile(file, function(err, data)
    {
        process.nextTick(function() { cb(err, {path: file, len: mp3len(file), });
    });
}
var mp3lenP = Q.denodeify(mp3len_cb);

function Seq(opts)
{
    globP('my-projects/-**-/-*.mp3')
        .then(function (files)
        {
            var promises = files.map(function (file)
            {
                return {path: file, len: mp3lenP(file), };
            });
            return Q.all(promises)
                .then(function (filelens)
                {
                    var duration = 0;
                    filelens.forEach(function (filelen) { duration += filelen.len; });
                    return [duration, filelens];
                });
        });
    return seq;
}
*/


test2();
//test4();

//eof
