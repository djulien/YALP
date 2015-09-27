/* simplest example
//example mp3 player from https://gist.github.com/TooTallNate/3947591
//more info: https://jwarren.co.uk/blog/audio-on-the-raspberry-pi-with-node-js/

//this is impressively awesome - 6 lines of portable code!

var fs = require('fs');
var lame = require('lame');
var Speaker = require('speaker');

fs.createReadStream(process.argv[2]) //specify mp3 file on command line
    .pipe(new lame.Decoder())
    .on('format', function (format)
    {
        this.pipe(new Speaker(format));
    });
*/


require('colors');

//fancier example with events:
//https://www.npmjs.com/package/player
//NOTE: had to update lame + speaker deps in player:  "lame": "^1.2.2",   "speaker": "^0.2.5",

//var path = require('path');
var Player = require('player');
//var pkg = require('../package.json');
//var debug = require('debug')(pkg.name);
var glob = require("glob");

//var playlist = [];
console.log("looking in %s".green, __dirname + "/*.mp3"); //path.join(__dirname, "*.mp3"));
glob(__dirname + "/*.mp3", {}, function (err, files)
{
    if (err) console.log("error: ".red, err);
    console.log("files".blue, files);
//    playlist = files;
  new Player(files)
    .on('playing', function(song)
    {
//     var buf = ""; for (var i in song) buf += "," + i;
        console.log("now playing %s".green, song.src);
    })
    .on('playend', function(song)
    {
        console.log("finished %s, Switching to next one ...".green, song.src);
    })
    .on('error', function(err)
    {
        console.log('Opps...!'.red, err);
    })
    .play(function(err, player)
    {
        console.log('playend!');
    });
});


//player.play(); // play again
//player.next(); // play the next song, if any
//player.add('http://someurl.com/anothersong.mp3'); // add another song to playlist
//player.stop(); // stop playing


//eof
