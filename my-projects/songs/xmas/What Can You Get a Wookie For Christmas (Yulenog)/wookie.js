//YALP custom sequence proxy; collects misc data and presents it as a sequence object to YALP

'use strict';

var Sequence = require('my-projects/songs/sequence.js'); //base class
//var Model = require('my-projects/models.js'); //base class
//var Model =
//var Fx =

var wookie /*_promise*/ = module.exports = /*new*/ Sequence({auto_collect: true, interval: 50, }); //comonjs
//.then(function(wookie)
//{
wookie.name = 'Wookie';
//Wookie.path = './What Can You Get a Wookie for Christmas (Yulenog & Nathan Kuruna-trimmed).mp3';
//Wookie.tracks = './tracks.txt'; //Audacity label file

//wookie.cues = [];
//wookie
//    .addFixedFrames(50);
//    .sortCues();


//render frames on demand:
wookie.render = function(cue)
{
    if (!this.buf) this.buf = new Buffer(8); //alloc buffer one time only
    if (cue.name != "frames") return null;
    this.buf.fill(cue.text); //frame#
    return {id: 'fr#' + cue.text, data: this.buf, at: cue.from, };
}


wookie.models =
[
    'M-tree',
    'Gdoor',
    'Shepherd1',
    'Shepherd2',
];

module.exports.debug();
//});

//eof
