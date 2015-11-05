//YALP custom sequence proxy; collects misc data and presents it as a sequence object to YALP

'use strict';

//TODO var Sequence = require('my-projects/shared/sequence'); //base class
var Sequence = function(opts) //temp shim
{
    if (!(this instanceof Sequence)) return new (Sequence.bind.apply(Sequence, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    this.debug = function() { debugger; }
    this.addCue = function() { return this; } //fluent
    this.duration = 5; //TODO
    this.opts = opts || {};
}
//var Model = require('my-projects/models.js'); //base class
//var Model =
//var Fx =

var wookie = module.exports = /*new*/ Sequence({auto_collect: true, interval: 50, }); //comonjs
wookie.name = 'Wookie';
//Wookie.path = './What Can You Get a Wookie for Christmas (Yulenog & Nathan Kuruna-trimmed).mp3';
//Wookie.tracks = './tracks.txt'; //Audacity label file

//wookie.cues = [];
//wookie
//    .addFixedFrames(50);
//    .sortCues();


wookie.models =
[
    'M-tree',
    'Gdoor',
    'Shepherd1',
    'Shepherd2',
];

//render frames on demand:
wookie.render = function(cue)
{
    if (!this.buf) this.buf = new Buffer(8); //alloc buffer one time only
    if (cue.name != "frames") return null;
    this.buf.fill(cue.text); //frame#
    return {id: 'fr#' + cue.text, data: this.buf, at: cue.from, };
}


//module.exports.debug();

//eof
