
'use strict';

var colors = require('colors'); //require('colors/safe'); //https://www.npmjs.com/package/colors; http://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
//require('colors');
var fs = require('fs');
var glob = require('glob');
//var Q = require('q'); //https://github.com/kriskowal/q
var inherits = require('inherits');
var clock = require('my-plugins/utils/clock');
var bufdiff = require('my-plugins/utils/buf-diff');
var Elapsed = require('my-plugins/utils/elapsed');
//var stream = require('stream');
//var Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
//var Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html


var Vix2YalpSource = require('my-plugins/adapters/vixen2').Vixen2YalpSource;
Vix2YalpSource.DefaultOptions =
{
    dedup: true,
    want_stats: true,
    yalp2yalp: true,
    dedup: true,
    want_stats: true,
    want_strline: false && true,
};

/*
var demo = new Vix2YalpSource({folder: 'my-projects/songs/xmas/Amaz*', xspeed: true});
console.log("got %s frames", demo.frames.length);
//demo.rewind(); //force sort
//Array.prototype.splice.call(demo.frames, 5, demo.frames.length + 1);
//demo.dirty = true;
//demo.rewind();
//console.log("now %s frames", demo.frames.length, demo.frames);
*/


/*
var YalpXform = require('my-plugins/streamers/YalpStream').YalpXform;
var xform = new YalpXform({want_strline: true});

var num_fr = 0;
xform.onFrame = function(frdata)
{
    if (frdata !== null) ++num_fr;
    else console.log("saw %s of %s frames", num_fr, demo.frames.length);
    return frdata;
    if ((frdata !== null) && Buffer.isBuffer(frdata.data))
    {
        var ofs = bufdiff(frdata.data, null);
        if (!ofs) frdata.data = "all zeroes";
        else
        {
            var ofs2 = bufdiff.reverse(frdata.data, null);
            --ofs; --ofs2; //adjust to actual ofs
            if (ofs || (ofs2 != frdata.data.length & ~3)) //trim
            {
                var newdata = frdata.data.slice(ofs, ofs2 + 4); //just keep the part that changed
//                if (frdata.data[0] || frdata.data[1] || frdata.data[2] || frdata.data[3]) console.error("first quad on frtime %s", frdata.frtime);
                frdata.ltrim = ofs;
                frdata.rtrim = ofs2;
                frdata.origlen = frdata.data.length;
                console.log("trim frtime %s ofs %s..%s, %s/%s remains", frdata.frtime, ofs, ofs2, newdata.length, frdata.data.length);
                frdata.data = newdata;
            }
        }
    }
//    console.log("notrim frtime %s", (frdata !== null)? frdata.frtime: '(eof)');
    return frdata;
}
*/


/*
var YalpSplitter = require('my-plugins/streamers/YalpStream').YalpSplitter;
YalpSplitter.DefaultOptions = { want_strline: true, dedup: true};
var splitter = new YalpSplitter({firstch: 0, xaltch: 3, numch: 10});
splitter.warn = function(msg)
{
    if (isNaN(++this.stats.warnings)) this.stats.warnings = 1;
    var args = Array.from(arguments);
    args[0] = colors.yellow("warning: " + args[0]);
    console.error.apply(null, args);
}
*/


/*
demo
    .once('my-end', function() { console.error("timing perf:".blue, JSON.stringify(demo.timing_perf)); }) //NOTE: need to do this on Yalp, not stdout
//    .pipe(xform)
//    .pipe(splitter)
//    .pipe(process.stdout); //echo to stdout
    .pipe(fs.createWriteStream('zout.txt', {encoding: 'utf-8'})); //capture to file
console.log("pipe ends at zout.txt");
*/

/*
var YalpSource = require('my-plugins/streamers/YalpStream').YalpSource;
YalpSource.DefaultOptions = { want_strline: true, dedup: true});
var demo = new YalpSource({xspeed: true});
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
*/


var YalpSource = require('my-plugins/streamers/YalpStream').YalpSource;
YalpSource.DefaultOptions = {dedup: true, want_strbuf: true, want_strline: true, want_stats: true};
var timing_test = new YalpSource({delay: 1000, speed: true});
timing_test.frames =
[
    {frtime: 0, data: new Buffer("0 sec")},
    {frtime: 50, data: new Buffer(".05 sec")},
    {frtime: 100, data: new Buffer(".1 sec")},
    {frtime: 150, data: new Buffer(".15 sec")},
    {frtime: 200, data: new Buffer(".2 sec")},
    {frtime: 250, data: new Buffer(".25 sec")},
    {frtime: 1000, data: new Buffer("1 sec")},
    {frtime: 10000, data: new Buffer("10 sec")},
    {frtime: 11000, data: new Buffer("11 sec")},
    {frtime: 12000, data: new Buffer("11 sec")},
    {frtime: 13000, data: new Buffer("11 sec")},
    {frtime: 14000, data: new Buffer("11 sec")},
    {frtime: 15000, data: new Buffer("11 sec")},
    {frtime: 16000, data: new Buffer("11 sec")},
    {frtime: 17000, data: new Buffer("17 sec")},
    {frtime: 18000, data: new Buffer("17 sec")},
    {frtime: 19000, data: new Buffer("17 sec")},
    {frtime: 20000, data: new Buffer("20 sec")},
    {frtime: 25000, data: "25 sec"},
//    {frtime: 30000, data: "30 sec"},
//    {frtime: 35000, data: "35 sec"},
//    {frtime: 40000, data: "40 sec"},
//    {frtime: 45000, data: "45 sec"},
//    {frtime: 50000, data: "50 sec"},
];
//console.log("#demo frames: %d", demo.frames.length);
//console.log("#test frames: %d", timing_test.frames.length);


//can instantiate custom stream directly; see http://stackoverflow.com/questions/21491567/how-to-implement-a-writable-stream
//var echoStream = new stream.Writable({objectMode: true});
//echoStream._write = function (chunk, encoding, done)
//{
//  console.log(chunk.toString());
//  done();
//};


timing_test
    .once('my-end', function() { console.log("timing perf:".blue, JSON.stringify(timing_test.timing_perf)); }) //NOTE: need to do this on Yalp, not stdout
//    .pipe(process.stdout) //echo to stdout
//    .once('end', function() { console.log("timing perf:".blue, timing_test.timing_perf); });
//demo.pipe(process.stdout); //echo to stdout
    .pipe(fs.createWriteStream('zout.txt', {encoding: 'utf-8'})); //capture to file
//demo.pipe(echoStream);

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
