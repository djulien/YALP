var colors = require('colors');
var glob = require("glob");
var path = require('path');
//var pkg = require('../package.json');
//var debug = require('debug')(pkg.name);
var fs = require('fs');

//example1();
example2();
//example3();


//example mp3 player from https://gist.github.com/TooTallNate/3947591
//more info: https://jwarren.co.uk/blog/audio-on-the-raspberry-pi-with-node-js/
//this is impressively awesome - 6 lines of portable code!
function example1()
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


//fancier example with events:
//https://www.npmjs.com/package/player
//NOTE: had to update lame + speaker deps in player:  "lame": "^1.2.2",   "speaker": "^0.2.5",
function example2()
{
//var path = require('path');
var Player = require('player');
//var pkg = require('../package.json');
//var debug = require('debug')(pkg.name);

//console.log("mp3dat", mp3dat);

//var playlist = [];
console.log("looking in %s".green, __dirname + "/*.mp3"); //path.join(__dirname, "*.mp3"));
glob(__dirname + "/*.mp3", {}, function (err, files)
{
    var played = 0;
    if (err) console.log("error: ".red, err);
    console.log("files".blue, files);
//    playlist = files;
//var mp3dat = require('mp3dat');
    var fs = require('fs');
//http://blog.kaiserapps.com/2014/01/nodejs-id3-tag-libraries-which-is-best.html
//    var mm = require('musicmetadata');
TODO: https://github.com/nikhilm/node-taglib
    files.forEach(function (filename)
    {
        var relpath = path.relative(__dirname, filename);
        console.log("stat:", fs.statSync(filename));
//        mp3dat.stat({stream: fs.createReadStream(filename), size: fs.statSync(filename).size}, function (data)
        var parser = mm(fs.createReadStream(filename), function (err, metadata)
        {
            if (err) console.log("mp3 data err: ".red, err);
            else console.log("mp3 dat for '%s': ".green, relpath, metadata);
        });
        parser.on('TLEN', function (result) { console.log("TLEN: ", result); });
    });
//    files.push(''); //kludge: allow last song to be interrupted
  new Player(files)
    .on('downloading', function(song)
    {
        console.log("downloading %s".green, song.src);
    })
    .on('playing', function(song)
    {
        var player = this;
//     var buf = ""; for (var i in song) buf += "," + i;
        console.log("now playing 5 sec of %s".green, song.src);
        setTimeout(function(){ if (++played < files.length) player.next(); else player.stop(); }, 5000); //only first 5 sec
    })
    .on('playend', function(song)
    {
        console.log("finished %s, Switching to next one ...".yellow, song.src);
    })
    .on('error', function(err)
    {
        console.log('ERROR:'.red, err);
    })
    .play();
});
//player.play(); // play again
//player.next(); // play the next song, if any
//player.add('http://someurl.com/anothersong.mp3'); // add another song to playlist
//player.stop(); // stop playing
}


//https://www.npmjs.com/package/audio5
//"modern" example using HTML5 audio; gives play/pause, volume and seek functions, can_play method, progress events, etc
//also supports more formats:
//mp3 - check for audio/mpeg; codecs="mp3". Example - Audio5js.can_play('mp3')
//vorbis - check for audio/ogg; codecs="vorbis". Example - Audio5js.can_play('vorbis')
//opus - check for audio/ogg; codecs="opus". Example - Audio5js.can_play('opus')
//webm - check for audio/webm; codecs="vorbis". Example - Audio5js.can_play('webm')
//mp4 - check for audio/mp4; codecs="mp4a.40.5". Example - Audio5js.can_play('mp4')
//wav - check for audio/wav; codecs="1". Example - Audio5js.can_play('wav')
//TODO: how to use this outside a browser?
function example3()
{
console.log("looking in %s".green, __dirname + "/*.mp3"); //path.join(__dirname, "*.mp3"));
glob(__dirname + "/*.mp3", {}, function (err, files)
{
    if (err) console.log("error: ".red, err);
    console.log("files".blue, colors.blue(files));

    var Audio5js = require('audio5');
    var audio5js = new Audio5js(
    {
        ready: function (player)
        {
//will output {engine:'html', codec: 'mp3'} in browsers that support MP3 playback.
// will output {engine:'flash', codec: 'mp3'} otherwise
            console.log("audio ready: ".green, player);

            player.on('canplay', function() //triggered when the audio has been loaded can can be played. Analogue to HTML5 Audio canplay event. Note that Firefox will trigger this event after seeking as well - If you're listening to this event, we recommend you use the one('canplay',callback) event listener binding, instead of the on('canplay',callback).
            { console.log("EVT: canplay %d, playing %d, dur %d, pos %d, ld%% %d, seek %d".blue, arguments.length, player.playing, player.duration, player.position, player.load_percent, player.seekable); });
            player.on('play', function() //triggered when the audio begins playing. Analogue to HTML5 Audio play event.
            { console.log("EVT: play %d, playing %d, dur %d, pos %d, ld%% %d, seek %d".blue, arguments.length, player.playing, player.duration, player.position, player.load_percent, player.seekable); });
            player.on('pause', function() //triggered when the audio is paused. Analogue to HTML5 Audio pause event.
            { console.log("EVT: pause %d, playing %d, dur %d, pos %d, ld%% %d, seek %d".blue, arguments.length, player.playing, player.duration, player.position, player.load_percent, player.seekable); });
            player.on('ended', function() //triggered when the audio playback has ended. Analogue to HTML5 Audio ended event.
            { console.log("EVT: ended %d, playing %d, dur %d, pos %d, ld%% %d, seek %d".blue, arguments.length, player.playing, player.duration, player.position, player.load_percent, player.seekable); });
            player.on('error', function() //triggered when the audio load error occurred. Analogue to HTML5 Audio error event.
            { console.log("EVT: error %d, playing %d, dur %d, pos %d, ld%% %d, seek %d".blue, arguments.length, player.playing, player.duration, player.position, player.load_percent, player.seekable); });
            player.on('timeupdate', function() //triggered when the audio playhead position changes (during playback). Analogue to HTML5 Audio timeupdate event.
            { console.log("EVT: timeupdate %d, playing %d, dur %d, pos %d, ld%% %d, seek %d".blue, arguments.length, player.playing, player.duration, player.position, player.load_percent, player.seekable); });
            player.on('progress', function() //triggered while audio file is being downloaded by the browser. Analogue to HTML5 Audio progress event.
            { console.log("EVT: progress %d, playing %d, dur %d, pos %d, ld%% %d, seek %d".blue, arguments.length, player.playing, player.duration, player.position, player.load_percent, player.seekable); });
            player.on('seeking', function() //audio is seeking to a new position (in seconds)
            { console.log("EVT: seeking %d, playing %d, dur %d, pos %d, ld%% %d, seek %d".blue, arguments.length, player.playing, player.duration, player.position, player.load_percent, player.seekable); });
            player.on('seeked', function() //audio has been seeked successfully to new position
            { console.log("EVT: seeked %d, playing %d, dur %d, pos %d, ld%% %d, seek %d".blue, arguments.length, player.playing, player.duration, player.position, player.load_percent, player.seekable); });
            player.on('loadedmetadata', function() //MP3 meta-data has been loaded (works with MP3 files only)
            { console.log("EVT: loadmeta %d, playing %d, dur %d, pos %d, ld%% %d, seek %d".blue, arguments.length, player.playing, player.duration, player.position, player.load_percent, player.seekable); });

            player.load(files[0]);
            player.play();
        }
    });
});
//playing - boolean flag indicating whether audio is playing (true) or paused (false).
//duration - audio duration in seconds.
//position - audio playhead position in seconds.
//load_percent - audio file download percentage (ranges 0 - 100).
//seekable - audio is seekable (download) or not (streaming).
}

//eof
