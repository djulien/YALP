#!/usr/bin/env node  --expose-gc
//#!/usr/local/bin/node --expose-gc
//start YALP components

'use strict'; //catch errors more easily

require('colors');
var child = require('child_process');

var playlist = watch('Playlist', child.spawn('./playlist.js', [], { stdio: 'inherit', detached: true }));
var player = watch('Player', child.spawn('./player.js', [], { stdio: 'inherit', detached: true }));
var iomon = watch('I/O monitor', child.spawn('./iomon.js', [], { stdio: 'inherit', detached: true }));


function watch(name, child)
{
    child.on('close', function(code) { console.log("%s closed, exit code: %d".red, name, code); });
    child.stdout.on('data', function(data) { console.log("%s stdout: %s".yellow, name, data); });
    child.stderr.on('data', function(data) { console.log("%s stderr: %s".red, name, data); });
}

//eof

/*
//example from http://krasimirtsonev.com/blog/article/Nodejs-managing-child-processes-starting-stopping-exec-spawn
var exec = require('child_process').exec;
var child = exec('node'); // ./commands/server.js');
child.stdout.on('data', function(data) {
    console.log('stdout: ' + data);
});
child.stderr.on('data', function(data) {
    console.log('stdout: ' + data);
});
child.on('close', function(code) {
    console.log('closing code: ' + code);
});
*/

/*
//example from https://docs.nodejitsu.com/articles/advanced/streams/how-to-use-stream-pipe
 var child = require('child_process');
 var fs = require('fs');
 var myREPL = child.spawn('node');
 var myFile = fs.createWriteStream('myOutput.txt');

 myREPL.stdout.pipe(process.stdout, { end: false });
 myREPL.stdout.pipe(myFile);

 process.stdin.resume();

 process.stdin.pipe(myREPL.stdin, { end: false });
 process.stdin.pipe(myFile);

 myREPL.stdin.on("end", function()
 {
   process.stdout.write("REPL stream ended.");
 });
 myREPL.on('exit', function (code) {
   process.exit(code);
 });
*/