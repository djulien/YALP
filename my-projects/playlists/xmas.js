'use strict';

var Playlist = require('my-projects/playlists/playlist.js'); //base class

var Xmas = module.exports = new Playlist(); //comonjs

Xmas.name = 'Xmas';
var AM = 0, PM = 1200;
Xmas.schedule =
{
    day_from: 1124, //mmdd
    day_to: 1228, //mmdd
    time_from: 530 +PM, //hhmm
    time_to: [ 1100 +PM, 930 +PM, 930 +PM, 930 +PM, 930 +PM, 1100 +PM, 1100 +PM, ], //hhmm
};
Xmas.songs =
[
    "Hippo",
    "Capital C",
];
Xmas.opener = "thx";
Xmas.closer = "goodnight";


//eof
