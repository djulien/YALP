
'use strict';

require('colors');
var fs = require('fs');
var glob = require('glob');
//var Q = require('q'); //https://github.com/kriskowal/q
var inherits = require('inherits');
var clock = require('my-plugins/utils/clock');
var Elapsed = require('my-plugins/utils/elapsed');
//var stream = require('stream');
//var Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
//var Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html


var Vix2YalpSource = require('my-plugins/adapters/vixen2').Vixen2YalpSource;
var YalpXform = require('my-plugins/streamers/YalpXform').YalpXform;

var demo = new Vix2YalpSource({folder: 'my-projects/songs/xmas/Amaz*', want_strline: false && true, speed: true});
console.log("got %s frames", demo.frames.length);
demo.rewind(); //force sort
Array.prototype.splice.call(demo.frames, 5, demo.frames.length + 1);
//demo.dirty = true;
//demo.rewind();
//console.log("now %s frames", demo.frames.length, demo.frames);

/*
var xform = new YalpXform();
xform._transform = function(frdata, encoding, done)
{
    if (frdata.frtime >= 0)
    {
        ++this.processed;
        frdata.inbuflen = frdata.data.length;
        frdata.outbuflen = 3;
        frdata.data = frdata.data.slice(0, 3);
    }
    else ++this.passthru;
    this.push(frdata);
    done();
}
xform._flush = function(done)
{
    console.error("xform: %s records processed, %s skipped", this.processed || 'NO', this.passthru || 'NO');
    done();
}
xform.on('readable', function()
{
     var line
     while (null !== (line = xform.read())) {
          // do something with line
     }
});
*/

var stream = require('stream')
var xform = new stream.Transform( { objectMode: true } )

xform._transform = function (chunk, encoding, done)
{
//     var data = chunk.toString()
//     if (this._lastLineData) data = this._lastLineData + data
//     var lines = data.split('\n')
//     this._lastLineData = lines.splice(lines.length-1,1)[0]
//     lines.forEach(this.push.bind(this))
//    var buf = new Buffer(chunk, encoding);
    if (isNaN(++this.processed)) this.processed = 1;
    var frdata = JSON.parse(chunk); //NOTE: incoming data had to be serialized, so it must be deserialized here
    var had_newline = (chunk.slice(-1) === '\n')? '\n': '';
    if (frdata.data) //try to reconstruct data/buffer; format varies
    {
//TODO: replace this with JSON reviver?
        switch (frdata.data.type || '(none)')
        {
            case 'Buffer':
//                console.log("try rebuild buf", JSON.stringify(frdata.data).slice(0, 100));
                var rebuilt = new Buffer(frdata.data, encoding);
//                console.log("rebuilt buf", rebuilt);
                frdata.data = rebuilt;
                break;
            case '(none)':
//                console.log("no type, leave as-is", JSON.stringify(frdata.data).slice(0, 100));
                break;
            default:
//                console.log("unhandled data type: %s", frdata.data.type);
//                console.log("try rebuild ", frdata.data.type, JSON.stringify(frdata.data).slice(0, 100));
                var rebuilt = JSON.parse(frdata.data);
//                console.log("rebuilt %s", frdata.data.type, rebuilt);
                frdata.data = rebuilt;
                break;
        }
    }
//    var buffer = !Buffer.isBuffer(chunk)? new Buffer(chunk, encoding): chunk;
//    console.log("buffer#" + this.processed, buffer);
//    chunk.toString();
//    var buf = '';
//    for (var i in frdata.data) buf += ', ' + typeof frdata.data[i] + ' ' + i;
//        if (buf && !isdef(buf.length)) buf.length = buf.data.length; //kludge: repair buffer (type changed somewhere along the way, maybe during socketio)
    console.error("processed rec# %s, enc %s, frtime %s, frnext %s, data ", this.processed, encoding, !isNaN(frdata.frtime)? frdata.frtime: 'huh?', !isNaN(frdata.frnext)? frdata.frnext: 'huh?', Buffer.isBuffer(frdata.data)? 'buffer len ' + frdata.data.length: frdata.data? (typeof frdata.data) + ' ' + frdata.data: '(no data per se)'); //buf.data? buf.data.length: 'none'); //typeof chunk, chunk.slice(0, 180), "frtime ", chunk.frtime || 'huh?');
//    console.error(typeof buf, buf, buf.frtime || 'huh?');
    if (Buffer.isBuffer(frdata.data)) { frdata.data = frdata.data.slice(0, 10); frdata.trunc = true; chunk = JSON.stringify(frdata); }
    this.push(chunk + '\n'); //buf); //"chunk#" + this.processed + "\n");
     done()
}
xform._flush = function (done) {
//     if (this._lastLineData) this.push(this._lastLineData)
//     this._lastLineData = null
    console.error("processed %d recs", this.processed || 'none');
     done()
}


demo
    .once('my-end', function() { console.error("timing perf:".blue, JSON.stringify(demo.timing_perf)); }) //NOTE: need to do this on Yalp, not stdout
    .pipe(xform)
//    .pipe(process.stdout); //echo to stdout
    .pipe(fs.createWriteStream('zout.txt', {encoding: 'utf-8'})); //capture to file


/*
var YalpSource = require('my-plugins/streamers/YalpSource').YalpSource;
var demo = new YalpSource({want_strbuf: true, want_strline: true, xspeed: true});
demo.frames =
[
//red/white marque:
    {frtime: 13033, data: ['#f00', '#000', '#f00', '#000']},
    {frtime: 13038, data: ['#000', '#f00', '#000', '#f00']},
    {frtime: 13043, data: ['#f00', '#000', '#f00', '#000']},
    {frtime: 13048, data: ['#000', '#f00', '#000', '#f00']},
//other:
    {frtime: 0, data: [0, '#f00', 0xffffff, 'blue']},
    {frtime: 50, data: [0xffaa55, 0xffaa55, 0xffaa55, 0xffaa55]},
//all off:
    {frtime: 4100, data: [0, 0, 0, 0]},
];
console.log("#demo frames: %d", demo.frames.length);


var timing_test = new YalpSource({want_strbuf: true, want_strline: true, delay: 1000, speed: true, want_stats: true});
timing_test.frames =
[
    {frtime: 0, data: 0},
    {frtime: 5000, data: "5 sec"},
    {frtime: 10000, data: "10 sec"},
//    {frtime: 15000, data: "15 sec"},
//    {frtime: 20000, data: "20 sec"},
//    {frtime: 25000, data: "25 sec"},
//    {frtime: 30000, data: "30 sec"},
//    {frtime: 35000, data: "35 sec"},
//    {frtime: 40000, data: "40 sec"},
//    {frtime: 45000, data: "45 sec"},
//    {frtime: 50000, data: "50 sec"},
];
//console.log("#demo frames: %d", demo.frames.length);
//console.log("#test frames: %d", timing_test.frames.length);


//can instantiate custom stream directly; see http://stackoverflow.com/questions/21491567/how-to-implement-a-writable-stream
var echoStream = new stream.Writable({objectMode: true});
echoStream._write = function (chunk, encoding, done)
{
  console.log(chunk.toString());
  done();
};


timing_test
    .once('my-end', function() { console.log("timing perf:".blue, JSON.stringify(timing_test.timing_perf)); }) //NOTE: need to do this on Yalp, not stdout
    .pipe(process.stdout); //echo to stdout
//    .once('end', function() { console.log("timing perf:".blue, timing_test.timing_perf); });
//demo.pipe(process.stdout); //echo to stdout
//demo.pipe(fs.createWriteStream('myOutput.txt', {encoding: 'utf-8'})); //capture to file
//demo.pipe(echoStream);
*/
//or
/*
demo
    .on('end', function() { processor.finish(); })
//    .on('data', function(chunk) {}) //old style; use .pause() and .resume() for flow-control
    .on('readable', function() //new style; data is available to read
    {
        for (;;)
        {
            var chunk = readStream.read();
            if (chunk == null) break;
            processor.update(chunk);
        }
    })
*/


/*
playback(n)
{
    return fs.createReadStream(filename[n])
        .on('close', playback(n + 1))
        .pipe(output)
}
    .pipe(split()) // split input into lines
    .pipe(new ProblemStream()) // transform lines into problem data structures
    .pipe(new SolutionStream()) // solve each problem
    .pipe(new FormatStream()) // format the solutions for output
    .pipe(process.stdout); // write solution to stdout
*/


//eof
//====================================================================================================

//http://stackoverflow.com/questions/4631774/coordinating-parallel-execution-in-node-js

/*
//http://stackoverflow.com/questions/19553837/node-js-piping-the-same-stream-into-multiple-writable-targets
//key ideas: back pressure buffers, can't pipe after eof, streams take different amounts of time
a = spawn('head', ['-c', '200K', '/dev/urandom']);.
a.stdout.pipe(b);
count = 0;
b.on('data', function(chunk) { count += chunk.length; });
b.on('end', function() { console.log(count); c.pipe(process.stdout); });

spawn = require('child_process').spawn;
pass = require('stream').PassThrough;
streamz = require('streamz').PassThrough;
var Promise = require('bluebird');
a = spawn('echo', ['hi user']);
b = new pass;
c = new pass;
a.stdout.pipe(streamz(combineStreamOperations));
function combineStreamOperations(data, next){
  Promise.join(b, c, function(b, c){ //perform n operations on the same data
  next(); //request more
}
count = 0;
b.on('data', function(chunk) { count += chunk.length; });
b.on('end', function() { console.log(count); c.pipe(process.stdout); });
*/


//eof
