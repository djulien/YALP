'use strict';

var path = require('path');
var require_glob = require('node-glob-loader').load; //https://www.npmjs.com/package/node-glob-loader
var timescale = require('my-plugins/utils/time-scale');
var glob = require('glob');

//var playlist = [];

var files = glob.sync('my-projects/songs/**/*[!-bk].js');
console.log("candidate files: ", files);

//var ROOTDIR = path.dirname(require.main.filename); //__dirname
//require_glob(ROOTDIR + '/my-plugins/ui/*[!-bk].js', {strict: true, noself: true}, function(exported, filename)
console.log("pattern " + __dirname + '/../my-projects/songs/**/*[!-bk]');

require_glob(__dirname + '../my-projects/songs/**/*[!-bk].js', {strict: true}, function(exported, filename)
{
    var relpath = path.relative(__dirname, filename);
//        console.log("route", filename, __filename);
//        if (path.basename(filename) == path.basename(__filename)) return; //skip self
    if (/*typeof exported !== 'Sequence'*/ !exported.isSequence) { console.log("not a seq: " + relpath); return; }
    console.log("found song '%s'".blue, relpath); //, exported);
    console.log("duration %s".blue, timescale(elapsed(exported.duration)));
    exported
        .on('PB: playing', function(song) { console.log("now playing %s".green, song.src); })
        .on('PB: playend', function(song) { console.log("finished %s, Switching to next one ...".green, song.src); })
        .on('PB: error', function(err) { console.log('Opps...!'.red, err); })
        .play(5000);
})./*done*/ then(function() { console.log("ui-plugins found: %d".green, numfiles); });


//eof
