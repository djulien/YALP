//YALP custom sequence proxy; collects misc data and presents it as a sequence object to YALP

'use strict';

var seq /*_promise*/ = module.exports = require('my-projects/songs/sequence.js')({auto_collect: true});
//.then(function(seq)
//{
//seq.name = 'C';
//seq.path = './**/*.mp3';
//seq.tracks = './tracks.txt'; //Audacity label file


seq.cues = [];
seq
    .addCue({text: 'lit:1', from: 1, })
    .addCue({text: 'lit:2', from: 2, })
    .addCue({text: 'lit:3', from: 3, });
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

module.exports.debug();
//});

//eof
