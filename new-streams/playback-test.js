
'use strict';

require('colors');
var fs = require('fs');
var glob = require('glob');
var Q = require('q'); //https://github.com/kriskowal/q
var Elapsed = require('my-plugins/utils/elapsed');


/*
//example mp3 player from https://gist.github.com/TooTallNate/3947591
//more info: https://jwarren.co.uk/blog/audio-on-the-raspberry-pi-with-node-js/
//this is impressively awesome - 6 lines of portable code!
function mp3player()
{
var fs = require('fs');
var lame = require('lame');
var Speaker = require('speaker');

fs.createReadStream(process.argv[2]) //specify mp3 file on command line
    .pipe(new lame.Decoder())
    .on('format', function (format)
    {
        this.pipe(new Speaker(format));
    });
}
*/



//var fmt_sync = Q.defer();
//Q.fcall(promisedStep1)

var elapsed = new Elapsed();
var media_pattern = 'my-projects/songs/xmas/**/!(*-bk).mp3';

//find media files:
var songs = [];
Q.promise(function(resolve, reject, warn)
{
    glob(media_pattern, function(err, files)
    {
        songs = files;
        console.log("found %d media files @%d msec".blue, (files || []).length, elapsed.now);
        switch (err? -1: files.length)
        {
            case -1: reject(err); break;
            case 0: reject("no matches for " + media_pattern); break;
            case 1: resolve(0); break;
//            default: warn/*reject*/("too many matches for " + media_pattern + ": " + files.length); resolve(0); break;
            default: resolve(0); break;
        }
    });
})
//.fail(function(error) {})
/*Q(999)*/.then(function(which) { return playback(which, 3); })
.catch(function(error) { console.log("media search collection @%d msec: %j".red, elapsed.now, error); })
.fin(function() { console.log("finished @%d msec".cyan, elapsed.now); })
.done();


//open media file and start decoding:
function playback(selected, loop)
{
    var pbelapsed = new Elapsed();
//    var next = Q.defer();
    if (selected >= songs.length) { selected = 0; if (!loop || ((loop !== true) && !--loop)) return; }
//    /*return*/ Q.fcall(function() { return songs[selected]; })
    Q(songs[selected])
//BROKEN            .pipe(pool) //does this make much difference?
//        .pipe(new MuteStream()) //mute) //TODO
.then(function(filename)
{
//TODO: send progress
    console.log("selected media[%s] loop[%s] %s @%d msec".blue, selected, loop, filename, pbelapsed.now);
var lame = require('lame');
    return fs.createReadStream(filename)
        .once('open', function() { console.log("media opened @%d msec".green, pbelapsed.now); }) //this.pbelapsed.scaled());
//!occur        .once('flush', function() { console.log("media flushed @%d msec".blue, pbelapsed.now); })
        .once('close', function() { console.log("media closed @%d msec".green, pbelapsed.now); })
        .on('error', function(err) { console.log('error @%s: %j'.red, pbelapsed.now, err); })
        .pipe(/*this.decoder =*/ new lame.Decoder());
})
//.fail(function(error) {})

//wait for decoded format then send to speaker:
.then(function(decoder)
{
    var wait = Q.defer();
var Speaker = require('speaker');
    decoder
//!occur        .once('open', function() { console.log("decoder opened @%d msec".green, pbelapsed.now); }) //this.pbelapsed.scaled());
//!occur        .once('flush', function() { console.log("decoder flushed @%d msec".blue, pbelapsed.now); })
//!occur        .once('close', function() { console.log("decoder closed @%d msec".green, pbelapsed.now); })
        .on('error', function(err) { console.log('error @%s: %j'.red, pbelapsed.now, err); })
        .once('format', function(format)
        {
//            this.volume = svvol; //restore stashed value
            console.log("decoder fmt @%d msec: raw_encoding %d, sampleRate %d, channels %d, signed? %d, float? %d, ulaw? %d, alaw? %d, bitDepth %d".blue, pbelapsed.now, format.raw_encoding, format.sampleRate, format.channels, format.signed, format.float, format.ulaw, format.alaw, format.bitDepth);
            wait.resolve(decoder.pipe(/*this.speaker =*/ new Speaker(format)));
        });
    return wait.promise;
})
//.fail(function(error) {})

//wait for sound to finish:
.then(function(speaker)
{
    speaker
        .once('open', function() { console.log("speaker opened @%d msec".green, pbelapsed.now); }) //this.pbelapsed.scaled());
        .once('flush', function() { console.log("speaker flushed @%d msec".blue, pbelapsed.now); })
        .once('close', function() { console.log("speaker closed @%d msec".green, pbelapsed.now); if (loop || (selected + 1 < songs.length)) process.nextTick(function() { playback(selected + 1, loop); }); })
        .on('error', function(err) { console.log('error @%s: %j'.red, pbelapsed.now, err); });
    return 0;
})
//.fail(function(error) {})

//generate error trap:
.catch(function(error)
{
    console.log("error @%d msec: %j".red, pbelapsed.now, error);
})

//finish off processing:
.fin(function()
{
    console.log("finished @%d msec".cyan, pbelapsed.now);
})
.done();
console.log("eof @%d msec".blue, pbelapsed.now);
//    return next.promise;
}


//eof

