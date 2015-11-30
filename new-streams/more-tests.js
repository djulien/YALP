
'use strict';

//concise summary of duplex vs. tranform vs. read + write streams: http://stackoverflow.com/questions/18096266/whats-the-difference-between-write-and-push-for-passthrough-streams

const fs = require('fs');
const path = require('path');
const Elapsed = require('my-plugins/utils/elapsed');
const logger = require('my-plugins/utils/logger')({detail: 99, filename: "zout.log"});
const hfmt = require('human-format');
function not_hfmt(val, scale) { return val; }
const bufferJSON = require('buffer-json'); //https://github.com/jprichardson/buffer-json
const stream = require('stream');
//var Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
//var Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html


function vix2json()
{
const files =
[
    'my-projects/songs/xmas/Amaz*/*Amaz*.vix',
    'my-projects/playlists/!(*RGB*).pro',
];
const outfile = "zout.json";

//var vix2prof = new require('my-plugins/streamers/vix2json').Profile(files[1]);
//var vix2seq = new require('my-plugins/streamers/vix2json').Sequence({filename: files[0], profile: vix2prof});

var outs = fs.createWriteStream(outfile)
    .on('open', function() { logger("outfile '%s' opened".green, outfile); })
    .on('data', function() { logger("outfile data".blue); })
    .on('close', function() { logger("outfile '%s' closed".green, outfile); })
    .on('error', function(err) { logger("outfile '%s' error: %j".red, outfile, err); });
//outs.write("["); //wrap in one large json array
//outs.svwrite = outs.write; outs.write = function(buf) { outs.svwrite(JSON.stringify(buf) + ',\n'); };
//vix2prof.toJSON(outs); //put channel + profile info in front of seq
//vix2seq.toJSON(outs);
//outs.write = outs.svwrite;
//outs.write(JSON.stringify("eof") + "]");
    require('my-plugins/streamers/vix2json').Vixen2json(outs, files[1], files[0]);
    outs.end(); //eof
logger("written".cyan);
return outs;
}
vix2json();
process.exit(0);

function hardwired2json()
{
const outfile = "zout.json";
var rows =
[
    {comment: "whatever"},
    {frame: 0, time: 0, buf: new Buffer([0, 1, 2, 3, 4]), buflen: 5, diff: [0, 5], nonzofs: 1},
    {frame: 1, time: 50, buf: new Buffer([1, 2, 3, 4, 5]), buflen: 5, diff: [0, 5], nonzofs: 0},
    {frame: 2, time: 100, buf: new Buffer([2, 3, 4, 5, 6]), buflen: 5, diff: [0, 5], nonzofs: 0},
    {frame: 3, time: 150, dup: true, nonzofs: 0},
    {frame: 4, time: 200, dup: true, nonzofs: 0},
    {frame: 5, time: 250, dup: true, nonzofs: 0},
    {frame: 6, time: 300, buf: new Buffer([3, 4, 5, 6, 7]), buflen: 5, diff: [0, 5], nonzofs: 0},
    {comment: "whatever"},
];
var outs = fs.createWriteStream(outfile)
    .on('open', function() { logger("outfile '%s' opened".green, outfile); })
    .on('data', function() { logger("outfile data".blue); })
    .on('close', function() { logger("outfile '%s' closed".green, outfile); })
    .on('error', function(err) { logger("outfile '%s' error: %j".red, outfile, err); });
//NO outs.write("["); //wrap in one large json array
outs.svwrite = outs.write; outs.write = function(buf) { outs.svwrite(JSON.stringify(buf) + '\n'); }; //,\n
rows.forEach(function(row) { outs.write(row); });
outs.write = outs.svwrite;
outs.write(JSON.stringify("eof")); //NO + "]");
outs.end(); //eof
}
//hardwired2json();


function vix2json_reader()
{
require('my-plugins/my-extensions/json-revival');
var split = require('split');
//can instantiate custom stream directly; see http://stackoverflow.com/questions/21491567/how-to-implement-a-writable-stream
var count = 0;
var echoStream = new stream.Writable({objectMode: true});
echoStream._write = function (chunk, encoding, done)
{
    var buf = JSON.parse(chunk, bufferJSON.reviver);
    console.log("json[%d]:", count++, buf);
    done();
};
echoStream.on('end', function() { console.log("%d json objects read", count); });
const infile = "./zout2.json";
fs.createReadStream(path.resolve(/*__dirname*/ process.cwd(), infile))
//    .pipe(echoStream)
  .pipe(split(JSON.parse))
  .on('data', function (obj) { //each chunk now is a js object
    console.log("json[%d]:", count++, obj.time || '(no time)', obj);
  })
  .on('error', function (err) { //syntax errors will land here; note, this ends the stream.
    console.log("error: ".red, err);
  })
    .on('end', function() { console.log("%d json objects read".green, count); });
}
//reader();


function chmodel_reader()
{
const models = require('my-projects/models/my-models').models;
//var entire = models.entire;

}
model_reader();


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// other
//


function test6_json_stream_parse()
{
//var makeSource = require("stream-json");
//var source = makeSource();
var Combo   = require("stream-json/Combo");
var Emitter = require("stream-json/Emitter");
var combo    = new Combo({packKeys: true, packStrings: true, packNumbers: true}),
    emitter  = new Emitter();

//combo.pipe(emitter);
emitter.on("startObject", function(){ ++emitterCounter.objects; });
emitter.on("keyValue",    function(){ ++emitterCounter.keys; });
emitter.on("startArray",  function(){ ++emitterCounter.arrays; });
emitter.on("nullValue",   function(){ ++emitterCounter.nulls; });
emitter.on("trueValue",   function(){ ++emitterCounter.trues; });
emitter.on("falseValue",  function(){ ++emitterCounter.falses; });
emitter.on("numberValue", function(){ ++emitterCounter.numbers; });
emitter.on("stringValue", function(){ ++emitterCounter.strings; });
emitter.on("finish", function(){
//eval(t.TEST("t.unify(plainCounter, emitterCounter)"));
//async.done();
    console.log("combo stats: ", emitterCounter);
})

//var objectCounter = 0;
//source.on("startObject", function(){ ++objectCounter; });
//source.on("end", function(){
//    console.log("Found ", objectCounter, " objects.");

//fs.createReadStream(path.resolve(__dirname, "./sample.json.gz")).
//        pipe(zlib.createGunzip()).pipe(combo);

return combo;
}
//var combo = test6_json_stream_parse();
//fs.createReadStream("zout.json").pipe(combo);



function test0_hardcoded_stream_data()
{
var outfile = "zout.json";
var frags = //progressive frame rendering
[
    {time: 0, target: 'port1', data: [0, '#f00', 0xffffff, 'blue'], ofs: 10, interleave: 2},
//red/white marque:
    {time: 13033, data: ['#f00', '#000', '#f00', '#000']},
    {time: 13038, data: ['#000', '#f00', '#000', '#f00']},
    {time: 13043, data: ['#f00', '#000', '#f00', '#000']},
    {time: 13048, data: ['#000', '#f00', '#000', '#f00']},
//other:
    {time: 50, data: [0xffaa55, 0xffaa55, 0xffaa55, 0xffaa55]},
//all off:
    {time: 4100, data: [0, 0, 0, 0]},
];
var outs = fs.createWriteStream(outfile)
    .on('open', function() { logger("outfile '%s' opened".green, outfile); })
    .on('data', function() { logger("outfile data".blue); })
    .on('close', function() { logger("outfile '%s' closed".green, outfile); })
    .on('error', function(err) { logger("outfile '%s' error: %j".red, outfile, err); });
frags.forEach(function(frag)
{
    if (frag.data)
        for (var i in outs.sticky)
            if (!frag.data[i]) frg.data[i] = outs.sticky[i];
    outs.write(JSON.stringify(frag) + '\n');
    outs.sticky = Object.assign(outs.sticky || {}, {target: frag.target, ofs: frag.ofs, interleave: frag.interleave});
});
outs.end(); //eof
logger("%d frames written".cyan, frags.length);
}


function test3_serial_streams() //duplex stream wrapper around serial port
{
    var SerialStream = require('my-plugins/streamers/serialport-stream');
    var sp = new SerialStream('/dev/ttyUSB0', 115200, '8N1');
    sp.on('open', function()
    {
        sp.write('hello');
        sp.write('bye');
        sp.read(2, function(data) { console.log("got-1 %d chars: ".yellow, data.length, data); });
        sp.read(2, function(data) { console.log("got-2 %d chars: ".yellow, data.length, data); });
        sp.read(2, function(data) { console.log("got-3 %d chars: ".yellow, data.length, data); });
        sp.read(2, function(data) { console.log("got-4 %d chars: ".yellow, data.length, data); });
    });
    setTimeout(function() { sp.close(); }, 10000);
}


function test2_stdin_to_stream() //handles write and end evts from stdin
{
var stream = require('stream');
var Stream = stream.Stream;
var ws = new Stream;
ws.writable = true;
ws.write = function(data) { console.log("input=".blue + typeof data + " " + (data + '').replace(/\n/gm, "\\n")); }
ws.end = function(data) { console.log("bye".red); }
process.stdin.pipe(ws);
}


function test1_json_to_text_stream()
{
var frames =
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
logger("write to file".cyan);
var outfile = fs.createWriteStream('zout.txt');
outfile.on('open', function() { logger("outfile zout.txt opened".green); });
outfile.on('data', function() { logger("outfile data".blue); });
outfile.once('close', function() { logger("outfile zout.txt closed".green); });
outfile.on('error', function(err) { logger("outfile zout.txt error: %j".red, err); });
frames.forEach(function(frame) { outfile.write(JSON.stringify(frame) + '\n'); });
logger("%d frames written".cyan, frames.length);
outfile.end(); //eof
}

//eof
