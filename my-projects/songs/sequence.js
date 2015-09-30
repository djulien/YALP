'use strict';
//base class behavior for sequenced songs

//var fileio = require('fileio'); //'../plugins/services/fileio');
var glob = require('glob');
var path = require('path');
var Player = require('player');

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


module.exports = Sequence; //commonjs; returns new sequence object to caller

//var YALP = YALP || {}; //namespace
///*YALP.*/ sequence = function(path, name) //ctor
//YALP.Sequence.prototype.load = function()

function Sequence(opts) //ctor/factory
{
    if (typeof this !== 'object') { console.log(typeof this); return new Sequence(opts); } //make "new" optional; make sure "this" is set
    if (!opts) opts = {};

    this.isSequence = true;
    this.cues = [];
    this.models = [];
    this.paths = []; //opts.path || '';

    if (opts.auto_collect)
    {
        var files = glob.sync(module.parent.__dirname + "/!(*-bk).mp3"); //, {}, function (err, files)
        console.log("SEQ: auto-collect got %d mp3 files", files.length);
        this.paths = files;
    }
    if (opts.paths) this.paths.push(opts.path);
    if (this.paths.length > 1) throw "too many paths (" + this.paths.length + "), first was: '" + this.paths[0] + "'"; //TODO: support multiple media files?
    this.name = opts.name || path.basename(this.paths[0], path.extname(this.paths[0])) || 'NONE';
    this.paths.forEach(function (path, inx) { player.add(path); });

//the duration of MP3 files is recorded as an ID3 tag in the file header
    this.duration = 10; //TBD

//pass-thru methods to shared player object:
    this.play = player.play;
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
