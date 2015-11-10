//YALP Xmas Sequence - Amazing Grace
'use strict';

var Sequence = require('my-projects/shared/sequence'); //base class
var seq = module.exports = new Sequence({use_media_len: false, xaudio: false, xcues: true}); //{auto_collect: true, interval: 50, dedupe: true, cache: false, });
//seq.name = 'Amazing';
//seq.timing = './tracks.txt'; //Audacity label file
//seq.cues = [];

seq
//no    .addVixen2({audio: false, cues: true})
    .addMedia() //__dirname + '**/*.mp3')
//    .addCue({text: 'fx:init', })
//    .addCue({from: .8, text: 'fx:one', })
//    .addCue({from: 1.3, text: 'fx:two', })
//    .addCue({from: 2.4, text: 'fx:three', })
//    .addCue({from: 3.2, text: 'fx:four', });


//seq.models =
//[
//    'M-tree',
//    'Gdoor',
//    'Shepherd1',
//    'Shepherd2',
//];
//TODO
//seq.fx = function(frtime, buf)
//{
//}


//render frames on demand:
/*
seq.render = function(frtime, buf)
{
    var frdata = Sequence.prototype.render.call(seq, frtime, buf); //{frtime, frnext, dirty, rawbuf}
//    port1[0] = frdata.rawbuf[0];
//TODO
//    if (!buf) buf = this.buf = new Buffer(16); //alloc buffer one time only
    var cue = this.findcue(frtime);
    switch (cue.text || '??')
    {
        case "fx:one": buf.fill(1); break;
        case "fx:two": buf.fill(2); break;
        case "fx:three": buf.fill(3); break;
        case "fx:four": buf.fill(4); break;
        case "fx:init": buf.fill(0); break; //initial state
        default: return null;
    }
//    return {id: cue.text, data: this.buf, at: cue.from, };
    var frdata = {frnext: frtime + .500}, used = 0;
    for (var i = 0; i < 4; ++i)
    {
        var len = Math.floor((buf.byteLength - used) * Math.random()); //TODO
        var portbuf = buf.slice(used, len); used += len;
//        portbuf.fill(0x11 * (i + 1)); //TODO: port ch remap
        frdata['port' + i] = portbuf;
    }
    return frdata; //{frnext: frtime + .500, port#: buf};
}
*/


//module.exports.debug();

//eof
