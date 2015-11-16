//YALP custom sequence proxy; collects misc data and presents it as a sequence object to YALP

'use strict';

var Sequence = require('my-projects/shared/my-custom').Sequence; //sequence'); //base class
var wookie = module.exports = /*new*/ Sequence({use_media_len: true, audio: false, folder: __dirname}); //{auto_collect: true, interval: 50, }); //comonjs
wookie.name = 'Wookie';
//Wookie.path = './What Can You Get a Wookie for Christmas (Yulenog & Nathan Kuruna-trimmed).mp3';
//Wookie.tracks = './tracks.txt'; //Audacity label file

//wookie.cues = [];
//wookie
//    .addFixedFrames(50);
//    .sortCues();

//var Model = require('my-projects/models.js'); //base class
//var Model =
//var Fx =


//wookie.models =
//[
//    'M-tree',
//    'Gdoor',
//    'Shepherd1',
//    'Shepherd2',
//];

//wookie
//    .addMedia() //__dirname + '**/*.mp3');
//none    .addVixen2({audio: false, cues: true});

//render frames on demand:
/*
wookie.render = function(frtime, buf)
{
//    if (!this.buf) this.buf = new Buffer(8); //alloc buffer one time only
//    if (cue.name != "frames") return null;
//    this.buf.fill(cue.text); //frame#
//    return {id: 'fr#' + cue.text, data: this.buf, at: cue.from, };
    var frdata = Sequence.prototype.render(frtime, buf);
    return frdata; //{frnext: frtime + .500, port#: buf};
}
*/


//module.exports.debug();

//eof
