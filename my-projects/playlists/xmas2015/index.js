//xmas2015 YALP playlist
'use strict';

var Playlist = require('my-projects/playlists/playlist');

var playlist = module.exports = new Playlist();

playlist.addSong('my-projects/songs/xmas/Amaz*');
playlist.addSong('my-projects/songs/xmas/*Capital*');
playlist.addSong('my-projects/songs/xmas/*Wookie*');

//TODO: playlist.scheduler
//playlist.schedule = {};

//eof