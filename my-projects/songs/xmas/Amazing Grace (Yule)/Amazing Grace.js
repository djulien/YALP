//YALP Xmas Sequence - Amazing Grace
'use strict';

var Sequence = require('my-projects/songs/sequence'); //base class
var seq = module.exports = new Sequence({auto_collect: true, /*interval: 50,*/ dedupe: true, cache: false, });
//seq.name = 'Amazing';


//seq.addMedia('my-projects/songs/xmas/Amaz*/**/*.mp3');
//seq.timing = './tracks.txt'; //Audacity label file
//seq.cues = [];
seq
    .addCue({text: 'fx:init', })
    .addCue({from: .8, text: 'fx:one', })
    .addCue({from: 1.3, text: 'fx:two', })
    .addCue({from: 2.4, text: 'fx:three', })
    .addCue({from: 3.2, text: 'fx:four', });
//    .sortCues();


seq.models =
[
    'M-tree',
    'Gdoor',
    'Shepherd1',
    'Shepherd2',
];


//render frames on demand:
seq.render = function(cue)
{
    if (!this.buf) this.buf = new Buffer(16); //alloc buffer one time only
    switch (cue.text || '??')
    {
        case "fx:one": this.buf.fill(1); break;
        case "fx:two": this.buf.fill(2); break;
        case "fx:three": this.buf.fill(3); break;
        case "fx:four": this.buf.fill(4); break;
        case "fx:init": this.buf.fill(0); break; //initial state
        default: return null;
    }
    return {id: cue.text, data: this.buf, at: cue.from, };
}


//module.exports.debug();

//eof
