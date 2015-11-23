
'use strict';

var glob = require('glob');
var path = require('path');

//var models = require('my-projects/shared/my-models');
//var empty = require('my-projects/playlists/empty');
var xmas = require('my-projects/playlists/xmas2015');
//var song = require(require.resolve(glob.sync(path.join("my-projects/songs/xmas/Amaz*", '**', '!(*-bk).js'))[0]));
xmas.auto_play = false;

//var Model2D = require('my-projects/models/model-2d');

debugger;
//console.log("playlist ", xmas);
var frdata = xmas.songs[0].render(this.frtime);
console.log("fr[0] data", frdata);

//setTimeout(function() { console.log("handles", process._getActiveHandles()); }, 5000);

//eof
