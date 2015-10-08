//xmas2015 YALP playlist
'use strict';

var Playlist = require('my-projects/playlists/playlist'); //base class

var playlist = module.exports = new Playlist();

playlist.addSong('my-projects/songs/xmas/Amaz*');
playlist.addSong('my-projects/songs/xmas/*Capital*');
playlist.addSong('my-projects/songs/xmas/*Wookie*');
//Xmas.songs =
//[
//    "Hippo",
//    "Capital C",
//];

//playlist.name = 'Xmas';
var AM = 0, PM = 1200;
playlist.schedule =
{
    day_from: 1124, //mmdd
    day_to: 1228, //mmdd
    time_from: 530 +PM, //hhmm
    time_to: [ 1100 +PM, 930 +PM, 930 +PM, 930 +PM, 930 +PM, 1100 +PM, 1100 +PM, ], //hhmm
};
playlist.opener = "thx"; //TODO
playlist.closer = "goodnight"; //TODO


//eof