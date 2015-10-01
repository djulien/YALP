//YALP custom sequence proxy; collects misc data and presents it as a sequence object to YALP

'use strict';

var Sequence = require('my-projects/songs/sequence.js'); //base class
//var Model = require('my-projects/models.js'); //base class
//var Model =
//var Fx =

var Wookie = module.exports = /*new*/ Sequence({auto_collect: true}); //comonjs

Wookie.name = 'Wookie';
//Wookie.path = './What Can You Get a Wookie for Christmas (Yulenog & Nathan Kuruna-trimmed).mp3';
//Wookie.tracks = './tracks.txt'; //Audacity label file
Wookie.models =
[
    'M-tree',
    'Gdoor',
    'Shepherd1',
    'Shepherd2',
];

//eof

