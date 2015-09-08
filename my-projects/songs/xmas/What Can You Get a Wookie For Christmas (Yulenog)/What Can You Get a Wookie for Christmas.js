'use strict';

console.log("wookie load ...");
console.timeStamp(); //shows time in FF, adds event to timeline in Chrome

var Sequence = require('../../sequence.js');
var Model = require('../../mode
//var Model =
//var Fx =

var Wookie = new Sequence();

Wookie.path = './What Can You Get a Wookie for Christmas (Yulenog & Nathan Kuruna-trimmed).mp3';
Wookie.name = 'wookie';
Wookie.tracks = './tracks.txt'; //Audacity label file
Wookie.models =
[
    'M-tree',
    'Gdoor',
    'Shepherd1',
    'Shepherd2',
];

//module.exports = THIS; //commonjs; not needed by top-level plug-ins
//global['plst_' + __filename.replace(/^.*\//, "")] = THIS;

console.timeStamp(); //shows time in FF, adds event to timeline in Chrome
console.log("... wookie loaded");

//eof
