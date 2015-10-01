'use strict';
//base class behavior for sequenced songs

//var fileio = require('fileio'); //'../plugins/services/fileio');
var glob = require('glob');
var path = require('path');
var Player = require('player');
var stack = require('callsite'); //https://www.npmjs.com/package/callsite
//var mm = require('musicmetadata'); //https://github.com/leetreveil/musicmetadata
//var fs = require('fs');

//use same player object for all songs (to make a playlist)
var player = new Player()
    .on('downloading', function(song)
    {
        console.log("SEQ: downloading %s".green, song.src);
    })
    .on('playing', function(song)
    {
//     var buf = ""; for (var i in song) buf += "," + i;
        console.log("SEQ: now playing %s for 5 sec".green, song.src);
        setTimeout(function(){ player.next(); }, 5000); //only first 5 sec
    })
    .on('playend', function(song)
    {
        console.log("SEQ: finished %s, Switching to next one ...".green, song.src);
    })
    .on('error', function(err)
    {
        console.log('SEQ: ERROR'.red, err);
    });
player.playlistlen = 0; //remember how many songs are queued

module.exports = Sequence; //commonjs; returns new sequence object to caller

//var YALP = YALP || {}; //namespace
///*YALP.*/ sequence = function(path, name) //ctor
//YALP.Sequence.prototype.load = function()

function Sequence(opts) //ctor/factory
{
    if (!(this instanceof Sequence)) { console.log(typeof this); return new Sequence(opts); } //make "new" optional; make sure "this" is set
    opts = Object.assign({auto_collect: true, reqd: true, limit: 1}, opts);

    this.isSequence = true;
    this.cues = [];
    this.models = [];
    this.paths = []; //opts.path || '';

    var callerdir = path.dirname(stack()[2].getFileName()); //start searches relative to actual sequence folder
    if (opts.auto_collect)
    {
        console.log("caller: " + callerdir);
        var files = glob.sync(callerdir + "/!(*-bk).mp3"); //look for any mp3 files in same dir
        console.log("SEQ: auto-collect got %d mp3 files from %s".blue, files.length, callerdir + "/!(*-bk).mp3");
        this.paths = files;
    }
    if (opts.path)
        if (opts.path.length) this.paths.push.apply(this.paths, opts.path); //this.paths.splice(this.paths.length, 0, this.paths);
        else this.paths.push(opts.path);
    if (opts.reqd && (this.paths.length < 1)) throw "missing media file(s) in " + callerdir;
    if (this.paths.length > opts.limit) throw "too many media files (" + this.paths.length + " vs. " + opts.limit + "), last was: '" + path.relative(callerdir, this.paths[this.paths.length - 1]) + "'"; //TODO: support multiple media files?
    this.name = opts.name || (this.paths.length && path.basename(this.paths[0], path.extname(this.paths[0]))) || 'NONE';
//    player.add(this.paths);
    this.duration = 0;
    this.paths.forEach(function (filename, inx)
    {
        console.log("player add %s".blue, filename);
//the duration of MP3 files is recorded as an ID3 tag in the file header
        var relpath = path.relative(__dirname, filename);
//        console.log("stat:", fs.statSync(filename));
//        mp3dat.stat({stream: fs.createReadStream(filename), size: fs.statSync(filename).size}, function (data)
//        var duration = 0;
//        var parser = mm(fs.createReadStream(filename), function (err, metadata)
//        {
//            if (err) console.log("mp3 data err: ".red, err);
//            else { console.log("mp3 dat for '%s': ".green, relpath, metadata.duration); duration = metadata.duration; }
//        });
//        parser.on('TLEN', function (result) { console.log("TLEN: ", result); duration = result; });
TODO: https://github.com/nikhilm/node-taglib
        this.duration += fs.statSync(filename).size; //TBD
        player.add(filename);
    });
    this.plinx = this.paths.length? player.playlistlen: -1;
    player.playlistlen += this.paths.length;

    this.play = function (duration) //player.play;
    {
        player.stop();
        if (player.timer) { clearTimeout(player.timer); player.timer = 0; }
        if ((duration !== 'undefined') && (duration < this.duration)) //partial only
        {
            player.timer = setTimeout(function() { player.stop(); player.timer = null; }, duration);
        }
        if (this.plinx != -1) player.play(this.plinx);
        else player.next();
    };
//pass-thru methods to shared player object:
    this.stop = player.stop;
    this.next = player.next;
    this.on = player.on;

    return this;
};


//for js oop intro see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Introduction_to_Object-Oriented_JavaScript
/*not needed
function Wookie(path, name) //ctor
{
    base.call(this, arguments); //parent ctor
    this.cues =
    [
    ];
    this.models =
    [
    ];
    return this;
};
Wookie.prototype = Object.create(base.prototype); //inherit from base class
Wookie.prototype.constructor = Wookie; //set ctor back to child class
*/

//eof
