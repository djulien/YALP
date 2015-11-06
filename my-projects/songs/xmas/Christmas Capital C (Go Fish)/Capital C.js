//YALP custom sequence proxy; collects misc data and presents it as a sequence object to YALP

'use strict';

var Sequence = require('my-projects/shared/sequence'); //base class
var seq = module.exports = new Sequence(); //{auto_collect: true, interval: 50, dedupe: true, cache: false, });
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

seq
    .addMedia() //__dirname + '**/*.mp3');
    .addVixen2({audio: false, cues: true});

//render frames on demand:
seq.render = function(frtime, buf)
{
//    if (!this.buf) this.buf = new Buffer(2); //alloc buffer one time only
//    this.buf.write(cue.from);
//    this.buf.writeUIntBE(Math.floor(cue.from / 1000), 0, 2);
//    return {id: cue.text, data: this.buf, at: cue.from, };
    var frdata = Sequence.prototype.render(frtime, buf);
    return frdata; //{frnext: frtime + .500, port#: buf};
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
