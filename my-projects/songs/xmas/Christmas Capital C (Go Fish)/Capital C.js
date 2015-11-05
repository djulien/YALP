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
var seq = module.exports = new Sequence({auto_collect: true, /*interval: 50,*/ dedupe: true, cache: false, });
//.then(function(seq)
//{
//seq.name = 'C';
//seq.path = './**/*.mp3';
//seq.tracks = './tracks.txt'; //Audacity label file


seq.cues =
[
    {text: 'lit:1', from: 1, },
    {text: 'lit:2', from: 2, },
    {text: 'lit:3', from: 3, },
];
//    .addFixedFrames(50);
//    .sortCues();


//render frames on demand:
seq.render = function(cue)
{
    if (!this.buf) this.buf = new Buffer(2); //alloc buffer one time only
//    this.buf.write(cue.from);
    this.buf.writeUIntBE(Math.floor(cue.from / 1000), 0, 2);
    return {id: cue.text, data: this.buf, at: cue.from, };
}


seq.models =
[
    'M-tree',
    'Gdoor',
    'Shepherd1',
    'Shepherd2',
];

//module.exports.debug();

//eof
