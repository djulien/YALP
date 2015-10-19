'use strict';

require('colors'); //var colors = require('colors/safe'); //https://www.npmjs.com/package/colors; http://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
var Q = require('q');
var glob = require('glob');
var Canvas = require('term-canvas'); //https://github.com/tj/term-canvas
var Vixen2 = require('my-projects/songs/vixen2');
var timescale = require('my-plugins/utils/time-scale');
var elapsed = require('my-plugins/utils/elapsed');
var sprintf = require('sprintf-js').sprintf;

var vixready = Q.promise(function(resolve, reject)
{
    glob('my-projects/Hween2015/GhostBusters/SEQ-GHOSTBUST.vix', function(err, files)
    {
        if (err) reject(err); //throw "ERROR: " + err;
        if (files.length != 1) reject("Non-unique file (" + files.length + " matches)");
        var filename = files[0];
        var seq = Vixen2(filename);
        console.log("loaded '%s'".green, filename);
        console.log("duration %s, interval %s, #fr %d, #ch %d".cyan, timescale(seq.duration), timescale(seq.interval), seq.numfr, seq.numch);
        resolve(seq);
    });
});


//wait for console output from above before doing graphics
vixready.then(function(seq)
{
    glob('my-projects/Hween2015/GhostBusters/SEQ-GHOSTBUST.mp3', function(err, files)
    {
        if (err) throw "ERROR: " + err;
        if (files.length != 1) throw "Non-unique file (" + files.length + " matches)";
        var filename = files[0];
        mp3player(filename, function()
        {
            seq.frnum = 0; //rewind
            seq.elapsed = new elapsed();
            render(seq);
        });
    });
});


//example mp3 player from https://gist.github.com/TooTallNate/3947591
//more info: https://jwarren.co.uk/blog/audio-on-the-raspberry-pi-with-node-js/
//this is impressively awesome - 6 lines of portable code!
function mp3player(filename, cb)
{
    var fs = require('fs');
    var lame = require('lame');
    var Speaker = require('speaker');
    var mp3len = require('my-plugins/utils/mp3len')(filename);

    fs.createReadStream(filename) //process.argv[2]) //specify mp3 file on command line
        .pipe(new lame.Decoder())
        .on('format', function(format)
        {
            this.pipe(new Speaker(format));
            console.log("mp3 '%s' %s started".green, filename, timescale(mp3len * 1000));
            cb();
        })
        .on('end', function() { console.log("done!".yellow); });
}


var ctx = new Canvas(50, 100).getContext('2d');
var svreset = ctx.reset;

ctx.reset = function(want_clear)
{
  if (want_clear !== false) this.clear();
  this.showCursor();
  this.moveTo(0, 22);
  this.resetState();
  if (want_clear === false) console.log("\n\n");
}.bind(ctx);

ctx.text = function()
{
    this.moveTo(0, 22);
    this.resetState();
}.bind(ctx);
ctx.reset();


function render(seq)
{
    var colors = require('colors/safe'); //https://www.npmjs.com/package/colors; http://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
    var CLUMP = 1; //graphics render can't go faster than 50 msec; text is okay at 10 msec
    if (!seq.isVixen) throw "bad seq";
    if (!seq.frnum) seq.frnum = 0;
    if (seq.numch > 16) throw "too many channels: " + seq.numch;
    var buf = "";
    for (var ch = 0; ch < seq.numch; ++ch)
    {
        var chval = 0;
        for (var f = 0; f < CLUMP; ++f) chval += seq.channel(seq.frnum + f, ch);
        chval = Math.round(chval / CLUMP);
        var color = (chval < 0x20)? 'black': //simulate approx brightness with primary colors
                    (chval < 0x40)? 'blue':
                    (chval < 0x60)? 'magenta':
                    (chval < 0x80)? 'green':
                    (chval < 0xA0)? 'yellow':
                    (chval < 0xC0)? 'red':
                    (chval < 0xE0)? 'cyan': 'white';
        if (!colors[color]) throw "color " + color + " is missing";
        box(ch, color); //seq.channel(seq.frnum, ch));
//        buf += colors[color]("X ");
//        buf += chval.toString(16) + " ";
    }
    ctx.text();
//    buf += "    ";
    buf += sprintf("fr# %d %s, ", seq.frnum, timescale(seq.frnum * seq.interval));
    var minlen = 20; //218;
    while (buf.length < minlen) buf += ' ';
    buf += "elapsed " + seq.elapsed.scaled() + "    ";
    console.log(buf);
    seq.frnum += CLUMP;
    if (seq.frnum < seq.numfr) setTimeout(render, seq.frnum * seq.interval - seq.elapsed.now, seq);
}


function box(n, color)
{
    if (!box.prev) box.prev = ',,,,,,,,,,,,,,,'.split(',');
    if (color == box.prev[n]) return;
    box.prev[n] = color;
    var x = n % 4, y = Math.floor(n / 4);
    ctx.fillStyle = color; //'red';
    ctx.fillRect(5 + x * (10 + 2), 1 + y * (4 + 1), 10, 4);
//    console.log("x %d, y %d, w %d, h %d, color %s", 5 + x * (10 + 2), 5 + y * (5 + 2), 10, 5, color);
}

/*
setTimeout(function() { box(1, 'red'); box(2, 'white'); box(3, 'blue'); }, 1000);
setTimeout(function() { box(1, 'black'); }, 1500);
setTimeout(function() { box(1, 'blue'); }, 2000);
setTimeout(function() { box(3, 'red'); }, 3000);
setTimeout(function() { ctx.reset(false); }, 4000);

//if (false)
for (var b = 0; b < 16; ++b)
    setTimeout(function(b) { box(b, "red"); }, 500 * b, b);
setTimeout(function() { ctx.reset(false); }, 10000);
*/

/*
    for (var chofs = 0; chofs < chvals.length; chofs += numch)
    {
        var buf = "", nonnull = false;
        for (var ch = 0; ch < numch; ++ch)
        {
            var chval = chvals.charCodeAt(chofs + ch); //chvals[chofs + ch];
            if (chval) nonnull = true;
            buf += ", " + chval;
        }
        if (nonnull) console.log("frame [%d/%d]: " + buf.substr(2), chofs / numch, numfr);
    }
*/

//eof
