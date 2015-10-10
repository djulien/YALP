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

//for example see https://strongloop.com/strongblog/practical-examples-of-the-new-node-js-streams-api/
var xform = require('stream').Transform || require('readable-stream').Transform; //poly-fill for older node.js
var outhw = new xform({ objectMode: true, });
outhw._transform = function (chunk, encoding, done)
{
    console.log("outhw: in ".blue, JSON.stringify(chunk));
    done();
}
outhw._flush = function (done)
{
    console.log("outhw: eof".cyan);
    done();
}


function test1()
{
var fs = require('fs');
var glob = {sync: function(pattern) { console.log("glob(%s)".blue, pattern); return require('glob').sync(pattern); }, };
var relpath = require('my-plugins/utils/relpath');
var elapsed = require('my-plugins/utils/elapsed');
var PoolStream = require('pool_stream');
var MuteStream = require('mute-stream')
var Speaker = require('speaker');
var lame = require('lame');
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
    var playlist = require('my-projects/playlists/xmas2015');
//    playlist.play(); return; //do this once to load cache
//    playlist.pipe(outhw); //NOTE: starts playback

//    setTimeout(test, 21000); //give async scan time to run and cache time to write

//    return;
//    console.log("%s duration: %s, #songs %d, scheduled? %d", playlist.name, scaled(playlist.duration), playlist.songs.length, !!playlist.scheduler);
    playback(playlist); //.play()); //play once
//playback(playlist.scheduled()); //play according to schedule
}


function playback(player)
{
    player
      .on('begin', function(err, info) { if (err) showerr("begin", err); else console.log("begin".green); })
      .on('start', function(err, info) { if (err) showerr("start", err); else status("start", info.current); })
      .on('progress', function(err, info) { if (err) showerr("progess", err); else status("progress", info.current); })
//      .on('pause', function(err, info) { if (err) showerr("pause", err); else status("pause", info.current); })
//      .on('resume', function(err, info) { if (err) showerr("resume", err); else status("resume", info.current); })
      .on('stop', function(err, info) { if (err) showerr("stop", err); else status("stop", info.current, info.next); })
      .on('end', function(err, info) { if (err) showerr("end", err); else console.log("end".cyan); })
      .on('error', function(err) { if (err) showerr("end", err); })
      .play({loop: 2, single: true, index: 1});
}

function status(when, current, next)
{
    var color = (when == "start")? 'green': (when.indexOf("next") != -1)? 'cyan': 'blue';
    console.log("%s song[%d] %s, duration %s, played %d%%, buffered %d%%"[color], when, current.index, current.name, scaled(current.duration), 100*current.played/current.duration, 100*current.buffered/current.duration);
    if (next) status("  " + when + " next", next);
}

function showerr(when, err)
{
    console.log("%s ERROR: ".red, when, JSON.stringify(err));
}

test2();

//eof
