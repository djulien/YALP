//basic functionality tests
'use strict';

require('colors');
var util = require('util');
var sprintf = require('sprintf');
var elapsed = require('my-plugins/utils/elapsed');
//var timescale = require('my-plugins/utils/time-scale');
var xform = require('stream').Transform ||
    require('readable-stream').Transform; //poly-fill for older node.js
//var stream = require('through'); //https://github.com/dominictarr/through

//https://strongloop.com/strongblog/practical-examples-of-the-new-node-js-streams-api/
//http://codewinds.com/blog/2013-08-20-nodejs-transform-streams.html
//http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
//see https://github.com/substack/stream-handbook
//https://nodejs.org/api/stream.html#stream_class_stream_passthrough
//fs.readFile(__dirname + '/data.txt', function (err, data) { send_dest(data); });
//vs
//var stream = fs.createReadStream(__dirname + '/data.txt');
//stream.pipe(dest);


/*
//from https://strongloop.com/strongblog/practical-examples-of-the-new-node-js-streams-api/
var liner = new xform({ objectMode: true, });
liner._transform = function (chunk, encoding, done)
{
    var data = chunk.toString();
    if (this._lastLineData) data = this._lastLineData + data;

    var lines = data.split('\n');
    this._lastLineData = lines.splice(lines.length - 1, 1)[0];

    lines.forEach(this.push.bind(this));
    done();
}
liner._flush = function (done)
{
    if (this._lastLineData) this.push(this._lastLineData);
    this._lastLineData = null;
    done();
}
*/


/*
//from http://codewinds.com/blog/2013-08-20-nodejs-transform-streams.html
function Upper(options) //factory
{
    if (!(this instanceof Upper)) return new Upper(options);

    xform.call(this, options);
}
util.inherits(Upper, xform);

Upper.prototype._transform = function (chunk, enc, cb)
{
    var upperChunk = chunk.toString().toUpperCase();
    this.push(upperChunk);
    cb();
};
var upper = new Upper();
var upper2 = new xform({ objectMode: true, });
upper2._transform = function (chunk, enc, cb)
{
    var upperChunk = chunk.toString().toUpperCase();
    this.push(upperChunk);
    cb();
};
// try it out
upper.pipe(process.stdout); // output to stdout
upper.write('hello world\n'); // input line 1
upper.write('another line');  // input line 2
upper.end();  // finish
*/


function MyStream(name, opts) //factory, not ctor
{
    if (!MyStream.elapsed) MyStream.elapsed = new elapsed();
//    if (!this instanceof MyStream)) return new MyStream(opts);
    if (this instanceof MyStream) throw "Don't use \"new\" with MyStream";
    opts = Object.assign(opts || {}, {objectMode: true, }); //allow binary data
//    xform.call(this, opts);
    var stream = Object.assign(new xform(opts),
    {
        _transform: function(chunk, encoding, done)
        {
            chunk.age = (chunk.age || 0) + 1;
//            chunk.seenby = chunk.seenby || {};
//            if (chunk.seenby[name]) { done(); return; } //don't re-circulate past messages
            if (chunk.seenby == name) { done(); return; } //don't re-circulate past messages
            if (!chunk.seenby) chunk.seenby = name;
//            chunk.seenby[name] = true;
            if (chunk.age < 2) console.log("%s @%s: ".blue, name, MyStream.elapsed.scaled(), JSON.stringify(chunk));
//            setTimeout(function()
//            {
                stream.safepush(chunk); //propagate thru chain
//            }, 200);
            done();
        },
        _flush: function(done)
        {
            console.log("%s: eof".yellow, name);
            done();
        },
        quit: function() //signal eof
        {
//            console.log("%s: send eof".red, name);
            stream.safepush(null);
        },
        safepush: function(msg)
        {
            if (stream.eof) return; //avoid throwing exception if stream already closed
            if (msg !== null)
            {
                if (typeof msg !== 'object') msg = {data: msg}; //turn it into object so props can be attached
                msg.type = msg.type || name;
            }
            stream.push(msg);
        },
    })
//        .on('data', function(chunk) {}) //old read or write way
//        .on('end', function() {}) //old way
        .on('finish', function() { stream.eof = true; })
        .on('close', function() { stream.eof = true; })
        .on('error', function(err) { console.log("ERROR: %s".red, err); })
        .on('readable', function ()
        {
            for (;;)
            {
                var chunk = !stream.eof? stream.read(): null;
                if (chunk === null) break; //eof
                console.dir("%s got: ".blue, name, chunk);
            }
        });
    return stream; //factory retval
}
//util.inherits(MyStream, xform);
//MyStream.prototype._read = function () {


/*
//test:
var feedback = MyStream("feedback");
var motion = MyStream("motion");
var uictls = MyStream("uictls");
var scheduler = MyStream("scheduler");
var once = MyStream("once");
var playlist = MyStream("playlist");
var outhw = MyStream("outhw");
var viewer3d = MyStream("viewer3d");
var iostats = MyStream("iostats");
var trace = MyStream("trace");

setTimeout(function() { motion.safepush(1); }, 1500);
setTimeout(function() { playlist.quit(); }, 3000);
*/


//=============================================================================
// Input sensors/triggers
//
// Sensors and UI controls generate triggers which are sent down stream
//

//var motion = //require('my-plugins/triggers/motion');
//    new stream.Readable({ objectMode: true }); //allow binary data
var motion = MyStream("motion");

//simulate someone passing by:
setTimeout(function() { motion.safepush("zone1"); }, 5000);
setTimeout(function() { motion.safepush("zone2"); }, 6000);
setTimeout(function() { motion.safepush("zone3"); }, 7000);
setTimeout(function() { motion.safepush("zone4"); }, 8000);
setTimeout(function() { motion.safepush("zone5"); }, 9000);

//simulate someone walking by and stopping to watch:
setTimeout(function() { motion.safepush("zone1"); }, 15000);
setTimeout(function() { motion.safepush("zone2"); }, 16000);
setTimeout(function() { motion.safepush("zone3"); }, 17000);

//simulate random artifact:
setTimeout(function() { motion.safepush("zone2"); }, 20000);


//var uictls = //require('my-plugins/preview/ui-controls');
//    new stream.Readable({ objectMode: true }); //allow binary data
var uictls = MyStream("uictls");

//simulate user clicking play + pause buttons:
setTimeout(function() { uictls.safepush({btn: "play"}); }, 19000);
setTimeout(function() { uictls.safepush({btn: "pause"}); }, 25000);
setTimeout(function() { uictls.safepush({btn: "play"}); }, 27000);


//allow selective results to influence subsequent data:
var feedback = MyStream("feedback");


/*
//chain only has one top, so combine all inputs (readable-only streams) into one trigger stream:
var triggers = require('combined-stream2').create(); //http://stackoverflow.com/questions/16431163/concatenate-two-or-n-streams
triggers.append(motion);
triggers.append(uictls);
*/


//=============================================================================
// Scheduler
//
// This stream generates playback + stop controls for the playlist
// This is a transform stream so other inputs (triggers, above) can override scheduling
//

//var scheduler = //require('my-plugins/scheduler');
//    new stream.PassThrough();
var scheduler = MyStream("scheduler");

//simulate start + stop schedule:
setTimeout(function() { scheduler.safepush({btn: "play"}); }, 33000);
setTimeout(function() { scheduler.safepush({btn: "stop"}); }, 37000);


//=============================================================================
// Playlist
//
// This stream "tranforms" input triggers into playback data
//

var playlist = //require('my-projects/playlists/xmas2015a');
{
//NO   frnum: 0, //keep playlist stateless so object can be shared
    get interval() { return 50; }, //msec, read-only, optional (can use variable frame rate)
//timestamps vs frame#s:
//0 = fr#1 pre-fetched, (0..1] = fr#1, (1..2] = fr#2, ..., (n-1..eos..n] = fr#n
    fr2msec: function(frnum) { return frnum * this.interval; },
    msec2fr: function(msec) { return Math.ceil(msec / this.interval); },
    exists: function(frnum) { return frnum <= this.numframes; },
//    islast: function(frinx) { return !this.exists(frinx + 1); },
    get duration() { return 26 * 50 - 10; }, //msec; EXAMPLE ONLY
    get numframes() { return this.msec2fr(this.duration); },
    getFrame: function(frnum)
    {
        var data = this.frame(frnum);
        return {frnum: frnum || 1, time: this.fr2msec(frnum), next: this.exists(frnum + 1)? this.fr2msec(frnum + 1): -1, datalen: data.length, data: data};
    },
    frame: function(frnum) //raw data only
    {
        if (!this.exists(frnum)) throw "Frame# " + frnum + " not in range [1.." + this.numframes + "]";
        return String.fromCharCode('A'.charCodeAt(0) + (frnum? frnum - 1: 0)); //TODO: pull from cache or generate on demand
    },
 //TODO: use https://github.com/dominictarr/from?
    playback: function(outs, frnum)
    {
//        if (arguments.length < 2) { outs = frnum; frnum = 0; } //pre-playback; no frame# passed
        frnum = frnum || 0; //optional param during pre-playback
        if (frnum)
        {
            var now = outs.elapsed.now(), expected = this.msec2fr(now);
            if (frnum != expected) outs.emit('warning', sprintf("playback out of sync: at %s should be frame# %d, but frame# %d was requested", outs.elapsed.scaled(), expected, frnum));
        }
        var data = this.getFrame(frnum); //just send what caller requested (no timing correction)
        if (frnum && (Math.abs(data.time - outs.elapsed.now()) > this.interval / 10)) outs.emit('warning', sprintf("playback timing is off: at frame# %d now %s, target %s", frnum, outs.elapsed.scaled(), outs.elapsed.scaled(data.time))); //allow 10% mistiming
        outs.write(data); //send requested data down stream; no timing correction
        if (!this.exists(frnum + 1)) return -1; //outs.push(); //caller decides whether to rewind or terminate
        if (frnum) //prefetch next frame
        {
            data = this.getFrame(frnum + 1); //pre-load or generate on demand
            var this_playlist = this; //save context for setTimeout()
            setTimeout(function() { this_playlist.playback(outs, frnum + 1); }, data.time - outs.elapsed.now()); //use relative time to auto-correct timing errors
        }
        return frnum + 1; //tell caller next frame#
    },
};

//var outs = new stream.Writable({ objectMode: true }); //allow binary data
var outs = MyStream("playlist");
//outs.elapsed = new elapsed(); //allow elapsed time tracking from start of playback

//NOPE outs._read = function(size) //reader requested more data
//player needs to push timely data, not rely on hardware to pull it
playlist = Object.assign(outs, {playlist: playlist});
playlist.playback = function(frnum)
{
    if (frnum) {outs.elapsed = new elapsed(playlist.playlist.fr2msec(frnum)); //elapsed time tracking from start of playback
        outs.elapsed.scaled = function(msec) { return ((typeof msec === 'undefined')? outs.elapsed.now(): msec) + ''; }; }
    return playlist.playlist.playback(outs, frnum);
};
playlist.on('warning', function(msg)
{
    console.log("WARNING: %s".red, msg);
});
//console.log(util.inspect(playlist));
playlist.playback(); //prefetch first frame
//do other stuff here
setTimeout(function() { playlist.playback(1); }, 40000); //start real playback timing here


//=============================================================================
// Hardware output
//
// This stream actually sends output to the controllers
// additional performance data is generated and sent down stream for monitoring/analysis
//

//var outhw = //require('my-plugins/preview/iostats');
//    new stream.PassThrough();
var outhw = MyStream("outhw");

//=============================================================================
// I/O monitoring
//
// This stream allows real-time monitoring of sequence playback
//

//var iostats = //require('my-plugins/preview/iostats');
//    new stream.PassThrough();
var iostats = MyStream("iostats");

//=============================================================================
// 3D preview
//
// Visualizer renders sequence data on-screen for use as a preview
//

//var viewer3d = //require('my-plugins/preview/viewer3d');
//    new stream.PassThrough();
var viewer3d = MyStream("viewer3d");

//=============================================================================
// Trace
//
// All upstream data is saved to a log so it can be further analyzed
//

//var trace = //require('my-plugins/preview/trace');
//    new stream.PassThrough();
var trace = MyStream("trace");
trace.on('readable', function ()
{
    for (;;)
    {
        var buf = !trace.eof? trace.read(): null;
        if (buf === null) break; //eof
        console.dir("%s got: ".cyan, name, buf);
    }
});


//=============================================================================
// Main logic
//
// NOTE: ALL streams are pipeline-style transforms (pass-through or filters)
// so they can be hooked together into more complex chains (even feedback loops)

feedback
    .pipe(motion)
    .pipe(uictls)
    .pipe(scheduler)
//    .schedule() //remove this to play immediately
//    .once() //remove this for playback loop
    .pipe(playlist)
    .pipe(outhw) //put this one first since it maintains timing
    .pipe(viewer3d)
    .pipe(iostats)
    .pipe(trace)
    .pipe(feedback);
//TODO: is it better for outhw to pull data or playlist to push data? (where is the master timing maintained)
//since the playlist is streaming the audio, it's probably better for it to also coordinate the outhw timing


//process.stdout.on('error', process.exit); //SIGPIPE handler when reader doesn't want any more data
process.on('exit', function (code) //reader doesn't want any more data
{
    console.error("\nprocess.exit %d @%s".red, code, MyStream.elapsed.scaled());
});


//eof
