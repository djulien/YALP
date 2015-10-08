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


var playlist = require('my-projects/playlists/xmas2015');
console.log("%s duration: %s, #songs %d, scheduled? %d", playlist.name, scaled(playlist.duration), playlist.songs.length, !!playlist.scheduler);

playlist.pipe(outhw);
playback(playlist.play()); //play once
//playback(playlist.scheduled()); //play according to schedule


function playback(player)
{
    player
      .on('begin', function(err, info) { if (err) showerr("begin", err); else console.log("begin".green); })
      .on('start', function(err, info) { if (err) showerr("start", err); else status("start", info.current); })
      .on('progress', function(err, info) { if (err) showerr("progess", err); else status("progress", info.current); })
      .on('pause', function(err, info) { if (err) showerr("pause", err); else status("pause", info.current); })
      .on('resume', function(err, info) { if (err) showerr("resume", err); else status("resume", info.current); })
      .on('stop', function(err, info) { if (err) showerr("stop", err); else status("stop", info.current, info.next); })
      .on('end', function(err, info) { if (err) showerr("end", err); else console.log("end".cyan); })
}

function status(when, current, next)
{
    var color = (when == "start")? 'green': (when.indexOf("next") != -1)? 'cyan': 'blue';
    console.log("%s song[%d/%d] %s, duration %s, played %d%%, buffered %d%%"[color], when, current.index, playlist.songs.length, current.name, scaled(current.duration), 100*current.played/current.duration, 100*current.buffered/current.duration);
    if (next) status("  " + when + " next", next);
}

function showerr(when, err)
{
    console.log("%s ERROR: ".red, when, JSON.stringify(err));
}

//eof
