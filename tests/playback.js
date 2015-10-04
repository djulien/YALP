'use strict';

require('colors');
require('my-plugins/my-extensions'); //load custom language extensions
var path = require('path');
var require_glob = require('node-glob-loader').load; //https://www.npmjs.com/package/node-glob-loader
var timescale = require('my-plugins/utils/time-scale');
var glob = require('glob');

//var playlist = [];

var files = glob.sync('my-projects/songs/**/!(*-bk).js');
console.log("candidate files: ".blue, files);

//var ROOTDIR = path.dirname(require.main.filename); //__dirname
//require_glob(ROOTDIR + '/my-plugins/ui/*[!-bk].js', {strict: true, noself: true}, function(exported, filename)
console.log("pattern %s".blue, path.normalize(__dirname + '/../my-projects/songs/**/!(*-bk).js'));

var numseq = 0;

//require_glob(path.normalize(__dirname + '../my-projects/songs/**/!(*-bk).js'), {strict: true}, function(exported, filename)
require_glob('my-projects/songs/**/!(*-bk).js', {strict: true}, function(exported, filename)
{
    var relpath = path.relative(__dirname, filename);
//        console.log("route", filename, __filename);
//        if (path.basename(filename) == path.basename(__filename)) return; //skip self
    if (/*typeof exported !== 'Sequence'*/ !exported.isSequence) { console.log("not a seq: %s".red, relpath); return; }
    console.log("found seq '%s'".green, relpath); //, exported);
    console.log("duration %s".blue, timescale(exported.duration));
    exported
        .on('playing', function(song) { console.log("PB: now playing %s".green, song.src); })
        .on('playend', function(song) { console.log("PB: finished %s, Switching to next one ...".green, song.src); })
        .on('error', function(err) { console.log('PB: Opps...!'.red, err); });
//        .play(5000);
    if (!numseq++) exported.play(); //(2000); //play first one; will auto-play remaining songs in playlist then stop at end
})./*done*/ then(function() { console.log("PB: seq found: %d".green, numseq); });


//eof
