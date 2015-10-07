//YALP streamer plug-in for mp3 + h/w control data
'use strict';

var fs = require('fs');
var glob = require('glob');

var playlist = require('my-projects/playlists/xmas2015");
playlist.play();

var mp3files = glob.sync(path.normalize(__dirname + "/../../tests/!(*-bk).mp3"); //look for any mp3 files in dir


//based on example from https://www.npmjs.com/package/pool_stream
function playmp3(src, 
var PoolStream = require('pool_stream');

var readable = fs.createReadStream('a_file');
var pool = new PoolStream();
var writable = fs.createWriteStream('b_file');

readable.pipe(pool).pipe(writable);

// following events will tell you why need pool.
readable.on('end', function () {
  console.log('readable end time is: %s', new Date());
});
pool.on('end', function () {
  console.log('pool end time is: %s', new Date());
});
pool.on('finish', function () {
  console.log('pool finish time is: %s', new Date());
});
writable.on('finish', function () {
  console.log('writable finish time is: %s', new Date());
});