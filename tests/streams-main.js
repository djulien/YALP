//basic functionality tests
'use strict';

//if (!global.has_ext)
//{
//    global.has_ext = require('my-plugins/my-extensions/');
//    delete require.cache[require.resolve(__filename)];
//    require(__filename); //re-load myself with language extensions enabled
//}
//else { ... }
console.log("START UP");

require('colors');
var fs = require('fs');
var util = require('util');
//var sprintf = require('sprintf-js').sprintf;
/*var vsprintf =*/ require("sprintf.js"); //.vsprintf;
var sizeof = require('object-sizeof');
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


//function MyMsg(data) //ctor
//{
//}

//simplified stream:
//instances should:
//- override onmsg() to receive/propagate messages; response can transform message as desired; respond with null to eat the message (no propagation)
//- override onevt() to listen for events; these cannot be eaten; they are informational only
//- use send to send a new message downstream or null to close all downstream listeners
function MyStream(name, opts) //factory, not ctor
{
    if (!name) throw "MyStream needs a name param";
    if (!MyStream.elapsed) MyStream.elapsed = new elapsed(); //static var
//    if (!this instanceof MyStream)) return new MyStream(opts);
    if (this instanceof MyStream) throw "Don't use \"new\" with MyStream";
    opts = asObject(opts /*|| {}*/, {objectMode: true}); //.assign(opts || {}, {objectMode: true, }); //allow binary data
//    xform.call(this, opts);
    var stream = Object.assign(new xform(opts),
    {
        _transform: function(chunk, encoding, done) //in binary mode, each chunk is a separate message; overrides default stream method
        {
            chunk = asObject(chunk, {'?age': 0, '?seenby': name, '?seenat': MyStream.elapsed.now, '?sentby': "unknown", }); //tomsg(chunk, in);
            if (chunk.sentby == name) { done(); return; } //don't re-circulate my past messages
            if (++chunk.age > 10) { this.sendevt("expired", chunk); done(); return; } //message has been circulating too long; drop it
//            chunk.seenby = chunk.seenby || {};
//            if (chunk.seenby[name]) { done(); return; } //don't re-circulate past messages
//            if (chunk.seenby == name) { done(); return; } //don't re-circulate past messages
//            if (!chunk.seenby) chunk.seenby = name;
//            chunk.seenby[name] = true;
//            var reply = this.onmsg(chunk);
//            setTimeout(function() //use this for delayed propagation
//            {
//                if (reply) this.send(reply); //propagate thru chain
//            }, 200);
            this.send(this.onmsg(chunk)); //give parent a chance to alter or cancel
            done();
        },
        _flush: function(done) //overrides default stream method
        {
//            console.log("%s @%s: eof".yellow, name, MyStream.elapsed.scaled());
            this.sendevt("eof");
            done();
        },
//custom convenience functions and wrappers around default stream methods:
        /*safepush*/ send: function(data) //in binary mode, each chunk is a separate message
        {
            if (data === null) return; //only allow quit() to close pipe
            if (this.sendbusy) { console.log("recursion %s".red, name); return; } //kludge: avoid infinite loops from callbacks
            this.sendbusy = true;
            if (this.eof) { this.sendevt("eofwrite", data); return; } //avoid throwing exception if stream already closed
            this.push(asObject(data, {'?sentby': name, '?sentat': MyStream.elapsed.now, })); //this.push(tomsg(data, out));
            this.sendbusy = false;
//            return data; //allow it to be passed to onevt as well
        },
//        push_debug(msg)
//        {
//            console.log("%s push: ", name, msg || "(null)");
//            stream.push(msg);
//        },
        sendevt: function(type, data)
        {
//            if (this.evtbusy) { console.log("recursion %s".red, name); return; } //kludge: avoid infinite loop during error or readable
            var msg = asObject(data, {evt: type, sentby: name, sentat: MyStream.elapsed.now, }); //tomsg(data, in); msg.evt = type;
    console.log("SENDEVT %s: ", name, JSON.stringify(msg));
//            this.evtbusy = true;
            if (!this.eof) //avoid infinite loop or exception on sending to closed pipe
                this.send(this.onmsg(msg)); //give parent the option of propagating it
            this.onevt(msg); //make parent aware of evt
//            this.evtbusy = false;
        },
        quit: function(why) //allow external process to request eof
        {
            this.isquitting = true;
            console.log("%s: eof %s".magenta, name, why || '');
//NO            stream.onevt({evt: "eof", }); //redundant
//????????            this.sendevt("eof", {why: why});
            console.log("%s sent eof".magenta, name);
            this.push(null); //.send(null); //close pipe; should generate flush callback
            console.log("%s complete? %d".magenta, name, this.eof);
        },
        warn: function(msg, args)
        {
//            if (typeof chunk !== 'object') { chunk = null;
            if (arguments.length > 1) msg = sprintf.apply(null, arguments); //Array.from/*prototype.slice.call*/(arguments));
        //    outs.emit('warning', msg);
//            if (this.eof) //return; //avoid infinite loop
//                console.log("%s WARN: ".yellow, name, msg);
//            else this.sendevt(asObject(chunk, {warn: msg, })); //send it downstream to catch by monitoring stage
            this.sendevt("warn", msg);
        },
//event handlers (intended to be overridden by parent):
        onmsg: function(data) //return response (maybe transformed) to propagate or null to hold back
        {
            if (!data.reported) //data.age || 0 <= 1) //only show new messages once
            {
                console.log("%s MSG@%s: ".blue, name, MyStream.elapsed.scaled(), JSON.stringify(data)); //NOTE: console.dir doesn't work for this?
                data.reported = true;
            }
            return data; //propagate as-is
        },
        onevt: function(data) //, propagate) //informational only; no response needed
        {
            console.log("%s EVT@%s: %s".cyan, name, MyStream.elapsed.scaled(), JSON.stringify(data));
        },
    })
//        .on('data', function(chunk) {}) //old read or write way
//        .on('end', function() {}) //old way
        .on('finish', function() { stream.eof = true; console.log("finish %s", name); }) //all data has been flushed (downstream transformations complete)
        .on('close', function() { stream.eof = true; console.log("close %s", name); })
        .on('error', function(err) { stream.sendevt("error", err); })
        .on('readable', function () //NOTE: this event occurs after a .push(); only get this if there are no other stream readers?
        {
            for (;;)
            {
                if (stream.eof) break;
                var chunk = stream.read(); //in binary mode, each chunk is a separate message
                if (chunk === null) break; //eof
//                if ((chunk.sentby || '') == name) { console.log("SKIP MINE".red); continue; } //kludge: skip stuff I created
//                stream.sendevt("readable", chunk);
                console.log("ignore readable %s".magenta, name);
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

setTimeout(function() { motion.send(1); }, 1500);
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
setTimeout(function() { motion.send("zone1"); }, 5000); //1500);
setTimeout(function() { motion.send("zone2"); }, 6000); //1800);
setTimeout(function() { motion.send("zone3"); }, 7000); //1900);
setTimeout(function() { motion.send("zone4"); }, 8000); //2000);
setTimeout(function() { motion.send("zone5"); }, 9000); //2100);

//simulate someone walking by and stopping to watch:
setTimeout(function() { motion.send("zone1"); }, 15000); //3000);
setTimeout(function() { motion.send("zone2"); }, 16000); //3100);
setTimeout(function() { motion.send("zone3"); }, 17000); //3200);

//simulate random artifact:
setTimeout(function() { motion.send("zone2"); }, 20000); //9000);


//var uictls = //require('my-plugins/preview/ui-controls');
//    new stream.Readable({ objectMode: true }); //allow binary data
var uictls = MyStream("uictls");

//simulate user clicking play + pause buttons:
setTimeout(function() { uictls.send({cmd: "play"}); }, 19000); //5000);
setTimeout(function() { uictls.send({cmd: "pause"}); }, 25000); //7000);
setTimeout(function() { uictls.send({cmd: "play"}); }, 27000); //8000);


//allow selective results to influence subsequent data:
var feedback = MyStream("feedback");

//setTimeout(function() { feedback.end(); }, 45000); //stop after 45 sec
feedback.onmsg = function(msg)
{
    if (feedback.timeout) { clearTimeout(feedback.timeout); feedback.timeout = null; }
    if (!feedback.isquitting) feedback.timeout = setTimeout(function() { feedback.quit("inactive 10 sec"); }, 10000); //close pipeline if no activity after 10 sec; NOTE: need to use anon func here
    else console.log("ignore feedback > quit", JSON.stringify(msg));
    return !feedback.isquitting? msg: null; //propagate all
}


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
setTimeout(function() { scheduler.send({cmd: "play"}); }, 33000); //12000);
setTimeout(function() { scheduler.send({cmd: "stop"}); }, 37000); //15000);


//=============================================================================
// Playlist
//
// This stream "tranforms" input triggers into playback data
//

var playlist = //require('my-projects/playlists/xmas2015a');
{
//NO   frnum: 0, //keep playlist stateless so object can be shared
    get INTERVAL() { return 50; }, //msec, read-only, optional (can use variable frame rate)
    get MAXERR() { return 0.10; }, //allow max 10% timing error
//timestamps vs frame#s:
//0 = fr#1 pre-fetched, (0..1] = fr#1, (1..2] = fr#2, ..., (n-1..eos..n] = fr#n
    fr2msec: function(frnum) { return frnum * this.INTERVAL; },
    msec2fr: function(msec) { return Math.ceil(msec / this.INTERVAL); },
    exists: function(frnum) { return frnum <= this.numframes; },
//    islast: function(frinx) { return !this.exists(frinx + 1); },
    get duration() { return 26 * 50 - 10; }, //msec; EXAMPLE ONLY
    get numframes() { return this.msec2fr(this.duration); },
    getFrame: function(frnum, outs)
    {
        var data = this.frame(frnum);
        return {frnum: frnum /*|| 1*/, actual: outs.elapsed.now, scheduled: this.fr2msec(frnum), next: this.exists(frnum + 1)? this.fr2msec(frnum + 1): -1, datalen: data.length, data: data};
    },
    frame: function(frnum) //raw data only
    {
        if (!this.exists(frnum)) throw "Frame# " + frnum + " not in range [1.." + this.numframes + "]";
        var rndlen = 1; //Math.floor(Math.random() * 1024);
        return frnum? str_repeat(String.fromCharCode('A'.charCodeAt(0) + frnum), rndlen): ''; //TODO: pull from cache or generate on demand
    },
 //TODO: use https://github.com/dominictarr/from?
    playback: function(outs, frnum)
    {
//        if (arguments.length < 2) { outs = frnum; frnum = 0; } //pre-playback; no frame# passed
        frnum = frnum || 0; //optional param during pre-playback
        if (frnum)
        {
            var now = outs.elapsed.now, expected = [this.msec2fr(now * (1 - this.MAXERR)), this.msec2fr(now * (1 + this.MAXERR))];
            if ((frnum < expected[0]) || (frnum > expected[1])) outs.warn("playback out of sync: at %s should be frame# [%d..%d], but frame# %d was requested", outs.elapsed.scaled(), expected[0], expected[1], frnum);
        }
        var data = this.getFrame(frnum, outs); //just send what caller requested (no timing correction)
        if (frnum)
        {
            if (Math.abs(data.time - outs.elapsed.now) > this.INTERVAL * this.MAXERR) outs.warn("playback timing is off: at frame# %d now %s, target %s", frnum, outs.elapsed.scaled(), outs.elapsed.scaled(data.time)); //allow 10% mistiming
//            outs.write(data); //send requested data down stream; no timing correction; NOTE: write goes to self, push goes to next
            outs.send(data); //send requested data down stream; no timing correction; NOTE: write goes to self, push goes to next
        }
        if (!this.exists(frnum + 1)) return -1; //outs.push(); //caller decides whether to rewind or terminate at eof
        if (frnum) //prefetch next frame
        {
            data = this.getFrame(frnum + 1, outs); //pre-load or generate on demand
            var this_playlist = this; //save context for setTimeout()
            setTimeout(function() { this_playlist.playback(outs, frnum + 1); }, data.time - outs.elapsed.now); //use relative time to auto-correct timing errors
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
    /*if (frnum)*/ outs.elapsed = new elapsed(playlist.playlist.fr2msec(frnum)); //elapsed time tracking from start of playback
//        outs.elapsed.scaled = function(msec) { return ((typeof msec === 'undefined')? outs.elapsed.now: msec) + ''; };
//        console.log("playback %s @%s".cyan, outs.elapsed.scaled(), MyStream.elapsed.scaled());
//        }
    return playlist.playlist.playback(outs, frnum);
};
//playlist.on('warning', function(msg)
//{
//    console.log("WARNING: %s".red, msg);
//});
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

iostats.onmsg = function(msg)
{
//    console.dir("trace: %s got: ".cyan, name, buf);
    if (!this.all) this.all = {msg: 0, evt: 0, cmd: 0};
    if (msg.evt) ++this.all.evt;
    else if (msg.cmd) ++this.all.cmd;
    else ++this.all.msg;
    if (msg.sentby == "playlist")
    {
        var stats = this.playlist || {count: 0, data_min: msg.datalen || 0, data_max: 0, data_total: 0, hdr_total: 0};
        ++stats.count;
        stats.data_min = Math.min(stats.data_min, msg.datalen || 0);
        stats.data_max = Math.max(stats.data_max || 0, msg.datalen || 0);
        stats.data_total += msg.datalen || 0;
        stats.hdr_total += sizeof(msg) - (msg.datalen || 0); //CAUTION: sizeof() can be expensive since it's not a native function
        this.playlist = stats;
        return null; //eat this msg
    }
    return msg; //propagate this msg as-is
}
iostats.onevt = function(msg) //, propagate)
{
    console.log("iostats.evt".red, msg);
    switch (msg.evt)
    {
        case "evt":
            console.log("iostats evt: ".yellow, msg);
            break;
        case "eof":
            var stats = this.playlist
            if (!stats) console.log("iostats playlist: NONE".magenta);
            else console.log("iostats playlist: #msg %d, avg data size %d (min %d, max %d), avg msg overhead %d".cyan,
                stats.count, stats.data_total / stats.count, stats.data_min, stats.data_max, stats.hdr_total / stats.count);
            break;
        default:
            console.log("iostats evt: ".magenta, msg);
            break;
    }
}


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

trace.logfile = fs.createWriteStream('yalp-trace.log'); //TODO: use SQLite database instead?
trace.on('close', function() { this.logfile.end(); });
trace.onmsg = function(msg)
{
//    console.log("trace: ".cyan, msg); //console.dir doesn't handle objects?
    this.logfile.write("msg: " + JSON.stringify(msg) + '\n');
    return msg; //propagate all
}
trace.onevt = function(evt) //, propagate)
{
    this.logfile.write("evt: " + JSON.stringify(evt) + '\n');
//    if (evt.evt == "eof") this.logfile.end();
}


//=============================================================================
// Main logic
//
// There's actually no real logic here, just various processing stages connected together in a loop
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
console.log("motion -> uictls -> scheduler -> playlist -> outhw -> viewer3d -> iostats -> trace -> feedback -> @%s".cyan, MyStream.elapsed.scaled());
//TODO: is it better for outhw to pull data or playlist to push data? (where is the master timing maintained)
//since the playlist is streaming the audio, it's probably better for it to also coordinate the outhw timing


//process.stdout.on('error', process.exit); //SIGPIPE handler when reader doesn't want any more data
process.on('exit', function (code) //reader doesn't want any more data
{
    console.error("\nprocess.exit %d @%s".red, code, MyStream.elapsed.scaled());
});


//force value to object, add (optionally) props:
function asObject(thing, more)
{
    if (thing === null) thing = {};
//    {
//        if (more) throw "Can't add props to null";
//        return null; //preserve null-ness
//    }
    else if (typeof thing === 'undefined') thing = {};
    else if (typeof thing !== 'object') thing = {data: thing}; //turn it into object so props can be attached
//    return more? Object.assign(thing, more): thing;
//    if (more)
        for (var prop in more)
            if (prop.charAt(0) != '?') thing[prop] = more[prop];
            else if (!thing[prop.substr(1)]) thing[prop.substr(1)] = more[prop];
    return thing;
}

//TODO: use https://www.npmjs.com/package/string?
function str_repeat(ch, len)
{
    var retval = ch || ' ';
    while (retval.length < len) retval += retval;
    return retval.substr(0, len);
}

//eof
