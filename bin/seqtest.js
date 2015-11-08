
'use strict';

var path = require('path');
var glob = require('glob');
var clock = require('my-plugins/utils/clock');
var Elapsed = require('my-plugins/utils/elapsed');
//glob.debug = function(pattern)
//{
//    var retval = glob.sync(pattern);
//    console.log("glob(%s) %d matches: %j".yellow, pattern, retval.length, retval);
//    return retval;
//}
const SEQ = "my-projects/songs/xmas/Amaz*"; ///!(*-bk).vix"; //path.join(__dirname, "../my-projects/songs/xmas/Amaz*/!(*-bk).pro");
var filename = glob.sync(SEQ)[0];
if (!filename) { console.log("seq file not found"); process.exit(1); }
var seq = require(require.resolve(filename));
if (!seq) { console.log("seq failed to load"); process.exit(1); }

var frtime;
var elapsed; //= new Elapsed();
var buffers = [], ff = 0;
for (var i = 0; i < 2; ++i) buffers.push(new Buffer(100)); //4096));

var auto_loop; //= true;
setTimeout(function() { next_frame(); }, 1000); //allow async load to complete


function next_frame()
{
    debugger;
    if (!frtime) frtime = 0;
//NOTE: prep frame data even if no subscribers; this allows on-demand fx to be pre-rendered and cached for better playback performance
//NOTE: timing does not need to be precise here because we are doing read-ahead for downstream player; however, we don't want to stray too far off, so use auto-correcting cumulative timing
    if (!frtime) elapsed = new Elapsed(); //used to help maintain cumulative timing accuracy
    var frdata = seq.render(frtime, buffers[ff ^= 1]); //{frnext, ports}; //alternating buffers; current buffer is still needed until data is actually sent
//    frdata.song = 0;
    frdata.frtime = frtime;
    if (!frdata.frnext) frdata.frnext = seq.duration;
//    var dirty = !frtime || bufdiff(buffers[0], buffers[1]);
    console.log("rendered frdata: %j", frdata);
    if (!frtime) console.log("prep[@%s] frtime[%d/%d], delay next %d", clock.Now.asString(), frtime, seq.duration, frdata.frnext - elapsed.now);
//    if (frdata.dirty) sendall(frdata);

    if ((frtime = frdata.frnext) >= seq.duration) //advance to next frame, wrap at end
    {
        frtime = 0;
        console.log("media change: %s", seq.media); //load new media in player
        if (!auto_loop) return;
    }

//    console.log("delay next %d", frdata.next - elapsed.now);
    setTimeout(function() { next_frame(); }, frdata.frnext - elapsed.now); //auto-correct cumulative timing; //frdata.curtime); //NOTE: timing is approx
}

//eof
