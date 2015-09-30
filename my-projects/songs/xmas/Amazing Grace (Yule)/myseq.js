//YALP custom sequence proxy; collects misc data and presents it as a sequence object to YALP

'use strict';

var seq = module.exports = require('my-projects/songs/sequence.js')({auto_collect: true});

//seq.name = 'Wookie';
//seq.path = './What Can You Get a Wookie for Christmas (Yulenog & Nathan Kuruna-trimmed).mp3';
//seq.tracks = './tracks.txt'; //Audacity label file
seq.models =
[
    'M-tree',
    'Gdoor',
    'Shepherd1',
    'Shepherd2',
];

//eof
