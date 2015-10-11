//YALP custom sequence proxy; collects misc data and presents it as a sequence object to YALP

'use strict';

var Sequence = require('my-projects/songs/sequence');

var seq = module.exports = new Sequence({auto_collect: true, interval: 50, dedupe: true});

//seq.addMedia('my-projects/songs/xmas/Amaz*/**/*.mp3');
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
