
'use strict';

//concise summary of duplex vs. tranform vs. read + write streams: http://stackoverflow.com/questions/18096266/whats-the-difference-between-write-and-push-for-passthrough-streams

const fs = require('fs');
const path = require('path');
const Elapsed = require('my-plugins/utils/elapsed');
const logger = require('my-plugins/utils/logger')({detail: 99, filename: "zout.log"});
const hfmt = require('human-format');
function not_hfmt(val, scale) { return val; }
const bufferJSON = require('buffer-json'); //https://github.com/jprichardson/buffer-json
const stmon = require('my-plugins/streamers/stmon').not_stmon;
const isStream = require('is-stream');
const stream = require('stream');
//var Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
//var Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html
const PassThrough = stream.PassThrough || require('readable-stream').PassThrough;
const split = require('split');
const zlib = require('zlib');


//rd('zout.json').pipe(zlib.createGzip()).pipe(wr('zout.json.gz')); //compress
//rd('zout.json.gz'.pipe(zlib.createGunzip()).pipe(wr('zout-rt.json')); //uncompress
//rd('zout2.json').pipe(process.stdout); //cat


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// 1. Vix to json:
//

const outfile = "Amaz.json"; //"zout.json";
function vix2(seq, cb)
{
//const outfile = "zout.json";
const profile = 'my-projects/playlists/!(*RGB*).pro';
const sequence = 'my-projects/songs/xmas/Amaz*/*Amaz*.vix';
if (typeof seq == 'function') { cb = seq; seq = null; }
return require('my-plugins/streamers/vix2json').Vixen2Stream(profile, seq || sequence, cb);
//outs.end(); //eof
}
//vix2(function(data) { console.log(data); }); //.pipe(process.stdout);
//vix2().pipe(process.stdout);
//vix2().pipe(stmon(fs.createWriteStream(outfile), "vix2 outfile '" + outfile + "'"));


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// 2. playback:
//

function playback(infile)
{
//const infile = "./zout.json"; //(process.argv.length >= 3)? process.argv[process.argv.length - 1]: "./zout.json";

//NO; clogs up   var data = hardwired();
//NO    var data = vix2();
    var data = stmon(fs.createReadStream(path.resolve(/*__dirname*/ process.cwd(), infile)), "infile '" + infile + "'")
//    var models = require('my-projects/models/my-models').models; //kludge: models must tick before ports, so load them first
    const FxPlayback = require('my-plugins/streamers/fxstream');
    var myfx = new FxPlayback(); myfx.opts.speed = 0;
//    myfx.FxPlayback(data);
    process.nextTick(function() //kludge: can't use models until next tick
    {
        logger("TICK");
//        models.ic1.port.open();
        data.pipe(split()).pipe(myfx); //NOTE: need split() to go from text to object stream
    });
//NO    data.end(); //close pipe after data all read??
}
////setTimeout(function() { playback('./Amaz.json'); }, 1000);
playback('./Amaz.json');


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// 3. analyze comm + firmware integrity:
//


//function my_unstringify(str)
//{
//    return str.replace(/([A-Z0-9$@_]+):/gi, "\"$1\":").replace(/ /g, '').replace(/\n/g, '\\n');
//}

function analyze(infile)
{
    var data = fs.createReadStream(path.resolve(/*__dirname*/ process.cwd(), infile));

    var parser = new stream.Writable();
    parser.objectMode = true;
    parser._write = function (chunk, encoding, done)
    {
debugger;
        if (!++this.lines)
        {
            this.lines = 1;
            this.num_raw = this.total_rawlen = this.max_rawlen = 0;
            this.num_out = this.total_outlen = 0;
            this.num_loopbk = this.total_loopbklen = 0;
            this.seq_fifo = []; //{length: 0};
            this.num_wrerr = this.num_drerr = this.num_drokay = 0;
        }
////        console.log(chunk.toString(encoding));
//        console.log("line %s enc: %s, is buf? %s", this.lines, encoding, Buffer.isBuffer(chunk));
////        chunk = my_unstringify(chunk.toString()); //encoding));
////        console.log("line %s enc: %s, is buf? %s", this.lines, encoding, Buffer.isBuffer(chunk));
        if (!chunk || !chunk.length) { console.log("no chunk line %s".red, this.lines); done(); return; }
//        var svchunk = chunk;
//        try{
        if (Buffer.isBuffer(chunk)) chunk = JSON.parse(chunk, bufferJSON.reviver);
//        }catch(exc) { console.log("ERROR line %s len %s:".red, this.lines, chunk.length, exc.message || exc); done(); return; }
//        console.log("chunk:", typeof chunk, chunk); //my_unstringify(chunk.toString()));
////        var data = chunk.type? JSON.parse(chunk, bufferJSON.reviver): chunk;
////        console.log("data:", typeof data, data); //my_unstringify(chunk.toString()));
        if (chunk.rawbuf)
        {
            if (chunk.rawbuf.length != chunk.buflen) throw "Bad len line# " + this.lines;
            ++this.num_raw; this.total_rawlen += chunk.buflen;
            if (chunk.buflen > this.max_rawlen) this.max_rawlen = chunk.buflen;
        }
        else if (chunk.wrerr) ++this.num_wrerr;
        else if (chunk.drerr) ++this.num_drerr;
        else if (chunk.drokay) ++this.num_drokay;
        else if (chunk.numsync && chunk.adrs && (chunk.src === "out"))
        {
            this.seq_fifo.push(chunk);
            ++this.num_out;
            this.total_outlen += chunk.numsync + 1 + chunk.litlen + chunk.datalen;
            console.log(chunk.numsync, chunk.litlen, chunk.datalen, chunk.lit);
        }
        else throw "unrecog entry on line " + this.lines + ": " + chunk;
//        console.log("data:", data);
//        process.exit();
        done();
    };
//    parser.on('error', function(err) { console.log("ERROR:".red, err.message || err); });
    parser.on('finish', function()
    {
        console.log("%s lines found", this.lines);
        console.log("#raw: %s, total len: %s, avg len %s, max len %s", this.num_raw, this.total_rawlen, this.num_raw? Math.round(this.total_rawlen / this.num_raw): 0, this.max_rawlen);
        console.log("#out: %s, total len: %s, avg len %s, unacct raw: %s", this.num_out, this.total_outlen, this.num_out? Math.round(this.total_outlen / this.num_out): 0, this.total_rawlen - this.total_outlen);
        console.log("#wrerr: %s, #drerr: %s, #drokay: %s", this.num_wrerr, this.num_drerr, this.num_drokay);
    }.bind(parser));
    data.pipe(split()).pipe(parser); //NOTE: need split() to go from text to object stream
//NO    data.end(); //close pipe after data all read??
}
//analyze('./ttyUSB3-out.log');


function analyze2(infile)
{
    var data = fs.createReadStream(path.resolve(/*__dirname*/ process.cwd(), infile));

    var parser = new stream.Writable();
    parser.objectMode = true;
    console.log("hwm", parser.highWaterMark);
    parser._write = function (chunk, encoding, done)
    {
debugger;
        if (!++this.lines)
        {
            this.lines = 1;
            this.max_fifo = this.total_fifo = 0;
            this.num_pkt_in = this.num_pkt_out = this.num_pkt_unkn = 0;
            this.num_raw = this.total_rawlen = this.max_rawlen = 0;
//            this.num_out = this.total_outlen = 0;
//            this.num_loopbk = this.total_loopbklen = 0;
            this.fifo = {length: 0};
            this.pkts = {length: 0};
//            this.num_wrerr = this.num_drerr = this.num_drokay = 0;
        }
        if (chunk === null) { done(); return; }
        if (!chunk || !chunk.length) { console.log("no chunk @line %s".red, this.lines); done(); return; }
        if (Buffer.isBuffer(chunk)) chunk = JSON.parse(chunk, bufferJSON.reviver);
        console.log("read line ", this.lines, chunk.src);
        if (chunk.src == 'out')
        {
            if ((chunk.adrs < 1) || (chunk.adrs >= 0x7d)) console.log("bad adrs out: %s, pkt %s, line %d".red, chunk.adrs, chunk.pktnum, this.lines);
            ++this.num_pkt_out;
            ++this.num_raw;
            this.total_rawlen += (chunk.lit || []).length;
            this.max_rawlen = Math.max(this.max_rawlen, (chunk.lit || []).length);
            chunk.line = this.lines;
            if (!++this.pkts[chunk.pktnum]) { this.pkts[chunk.pktnum] = 1; ++this.pkts.length; }
            if (this.fifo[chunk.pktnum]) throw "dupl pkt# " + chunk.pktnum + " @line " + this.lines;
            this.fifo[chunk.pktnum] = chunk; //.push(chunk);
            this.total_fifo += ++this.fifo.length;
            if (this.fifo.length > this.max_fifo) this.max_fifo = this.fifo.length;
        }
        else if (chunk.src == 'in')
        {
            if ((chunk.adrs < 0x81) || (chunk.adrs >= 0xfd)) console.log("bad adrs in: %s, pkt %s, line %d".red, chunk.adrs, chunk.pktnum, this.lines);
            ++this.num_pkt_in;
            chunk.line = this.lines;
            if (!++this.pkts[chunk.pktnum]) { this.pkts[chunk.pktnum] = 1; ++this.pkts.length; }
            var buf = '', other = this.fifo[chunk.pktnum]; //[0];
            if (!other) throw "pkt# " + chunk.pktnum + " @line " + this.line + " not found";
            for (var i in chunk)
            {
                if ((i == 'src') || (i == 'elapsed') || (i == 'line')) continue;
                if (chunk[i] == other[i]) continue;
                if ((i == 'adrs') && ((chunk.adrs ^ other.adrs) == 0x80)) continue;
                buf += ', ' + i + ' = ' + chunk[i] + ' vs. ' + other[i] + ' (line#s ' + other.line + ', ' + chunk.line + ')';
            }
            if (!buf) { delete this.fifo[chunk.pktnum]; this.total_fifo += --this.fifo.length; done(); return; }
            console.log("mismatch: " + buf.substr(2));
        }
        else __this.num_pkt_unkn; //throw "unrecog entry on line " + this.lines + ": " + chunk;
        done();
    };
    parser.on('finish', function()
    {
        console.log("%s lines found", this.lines);
        console.log("#raw: %s, total len: %s, avg len %s, max len %s", this.num_raw, this.total_rawlen, this.num_raw? Math.round(this.total_rawlen / this.num_raw): 0, this.max_rawlen);
        console.log("#out: %s, #in %s, #unkn %s, #uniq pkt#s %s, max fifo %s, avg fifo %s", this.num_pkt_out, this.num_pkt_in, this.num_pkt_unkn, this.pkts.length, this.max_fifo, Math.round(this.total_fifo / (this.num_pkt_in + this.num_pkt_out)));
//        console.log("#wrerr: %s, #drerr: %s, #drokay: %s", this.num_wrerr, this.num_drerr, this.num_drokay);
    }.bind(parser));
    data.pipe(split()).pipe(parser); //NOTE: need split() to go from text to object stream
//NO    data.end(); //close pipe after data all read??
}
//analyze2('./out.log');


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// port test:
//

function port_test()
{
    var ff = 0;
    var models = require('my-projects/models/my-models').models;
    process.nextTick(function() { logger("TICK open"); models.ic1.port.open(); /*send()*/; }); //kludge: can't use models until next tick
    var timer = setInterval(function()
    {
        send();
//        setTimeout(function() { models.ic1.port.close(); }, 2000);
//        clearInterval(timer);
    }, 1000); //kludge: serial port needs ~ .6 - .7 sec to open

    function send()
    {
debugger;
        if (ff++ & 1)
        {
            console.log("off");
            models.ic1.fill('#000000'); //.render();
            models.ic2.fill('#000000'); //.render();
            models.ic3.fill('#000000'); //.render();
            models.ic4.fill('#000000'); //.render();
            models.ic5.fill('#000000'); //.render();
        }
        else
        {
            console.log("on");
            models.ic1.fill('#ff00ff'); //.render();
            models.ic2.fill('#ff0000'); //.render();
            models.ic3.fill('#00ff00'); //.render();
            models.ic4.fill('#0000ff'); //.render();
            models.ic5.fill('#00ffff'); //.render();
        }
        models.forEach(function(model) { model.render(); });
        models.ic5.port.flush();
        if (ff > 10) clearInterval(timer);
    }
/*
test_strip
    .fill(0xFF0000)
    .wait(1000)
    .fill(0x0000FF)
    .wait(1000)
    .pixel(0, 0x111111)
    .pixel(1, 0x222222)
    .pixel(2, 0x333333)
    .pixel(3, 0x444444)
    .wait(500)
    .save('../tmp/stream2.yalp')
    .playback({persist: true, loop: 2});
*/
}
//port_test();


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// others:
//

function hardwired()
{
//const outfile = "zout.json";
var rows =
[
    {comment: "whatever"},
    {frame: 0, time: 0, fx: 'rawbuf', buf: new Buffer([0, 1, 2, 3, 4]), buflen: 5, diff: [0, 5], nonzofs: 1},
    {frame: 1, time: 50, fx: 'rawbuf', buf: new Buffer([1, 2, 3, 4, 5]), buflen: 5, diff: [0, 5], nonzofs: 0},
    {frame: 2, time: 100, fx: 'rawbuf', buf: new Buffer([2, 3, 4, 5, 6]), buflen: 5, diff: [0, 5], nonzofs: 0},
    {frame: 3, time: 150, fx: 'rawbuf', dup: true, nonzofs: 0},
    {frame: 4, time: 200, fx: 'rawbuf', dup: true, nonzofs: 0},
    {frame: 5, time: 250, fx: 'rawbuf', dup: true, nonzofs: 0},
    {frame: 6, time: 300, fx: 'rawbuf', buf: new Buffer([3, 4, 5, 6, 7]), buflen: 5, diff: [0, 5], nonzofs: 0},
    {comment: "whatever"},
];
const rdwr = require('my-plugins/streamers/stmon').rdwr;
//var outs = stmon(fs.createWriteStream(outfile), "hardwired outfile '" + outfile + "'");
var outs = rdwr('hard-wired in-out');
//NO outs.write("["); //wrap in one large json array
//outs.svwrite = outs.write; outs.write = function(buf) { outs.svwrite(JSON.stringify(buf) + '\n'); }; //,\n
if (true)
process.nextTick(function() //NOTE: this will clog up memory
{
    logger("TICK");
//    rows.forEach(function(row) { outs.write(JSON.stringify(row) + '\n'); });
    for (var inx = 0; inx < rows.length; ++inx) outs.write(JSON.stringify(rows[inx]) + '\n');
    logger("%d hardwired frames written".cyan, rows.length);
//outs.write = outs.svwrite;
//outs.write(JSON.stringify("eof")); //NO + "]");
    outs.end(); //eof
});
else process.nextTick(function() { logger("TICK"); send_next(0); }); //throttle writes to match destination
return outs; //fluent (pipes)

function send_next(inx)
{
    if (!inx) send_next.elapsed = new Elapsed();
    if (inx < rows.length)
    {
        outs.write(JSON.stringify(rows[inx]) + '\n');
        setTimeout(function() { send_next(inx + 1); }, 50 * (inx + 1) - send_next.elapsed.now); //use cumulative time to reduce drift
        return;
    }
    logger("%d hardwired frames written".cyan, rows.length);
    outs.end(); //eof
}
}
//hardwired().pipe(process.stdout);
//hardwired().pipe(stmon(fs.createWriteStream(outfile), "hardwired outfile '" + outfile + "'"));


function canv_test()
{
    const Canvas = require('canvas');
    var canvas = new Canvas(3, 3);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = 'blue';
    ctx.clearRect(0, 0, 3, 3);
    ctx.fillRect(0, 0, 2, 2);
    var data = ctx.getImageData(0, 0, 3, 3);
    console.log("img data %j", data);
}
//canv_test();


function model_test()
{
    const Model2D = require('my-projects/models/model-2d');
    const ports = require('my-projects/models/my-ports').all;

    var amodel = new Model2D({name: 'amodel', w: 4, h: 5, zinit: false, order: Model2D.prototype.R2L_T2B}); //output: 'RGB'});
    amodel.port = ports[0];
    console.log("amodel node list", amodel.nodelist);
    amodel.fill('#FFCCDDEE'); //argb  0xCCDDEEFF);
    amodel //NOTE: context2D here wants RGBA or RGB, not ARGB
        .pixel(0, 3, '#112233').pixel(1, 3, '#444444').pixel(2, 3, '#888888').pixel(3, 3, '#CC4444')
//        .pixel(0, 2, '#445566').pixel(1, 2, '#333333').pixel(2, 2, '#777777').pixel(3, 2, '#DD3333')
//        .pixel(0, 1, '#778899').pixel(1, 1, '#222222').pixel(2, 1, '#666666').pixel(3, 1, '#EE2222')
//        .pixel(0, 0, '#AABBCC').pixel(1, 0, '#111111').pixel(2, 0, '#555555').pixel(3, 0, '#FF1111');
        .pixel(0, 2, '#CC0044');
    var data = amodel.imgdata();
    console.log("amodel node buf", data);
    amodel.render();
    ports[0].flush(0);
//        this.MyFx.column.call(this, br, brcolor);
}
//model_test();


debugger;
function pwm_test()
{
    const Model2D = require('my-projects/models/model-2d');
    const ports = require('my-projects/models/my-ports').all;
    const RENXt = require('my-plugins/hw/RenXt');

    var amodel = new Model2D({name: 'chplex', w: 4, h: 2, zinit: false, nodetype: RENXt.PWM(RENXt.ACTIVE_LOW), order: Model2D.prototype.L2R_T2B, output: 'mono'}); //'RGBW'});
    amodel.port = ports[0];
    console.log("amodel node list", amodel.nodelist);
    amodel //mono
        .pixel(0, 1, '#DDEEFF')
        .pixel(0, 0, '#112233').pixel(1, 0, '#445566').pixel(2, 0, '#778899').pixel(3, 0, '#AABBCC');
    var data = amodel.imgdata();
    console.log("amodel node buf", data);
    amodel.render();
    ports[0].flush(0);
}
//pwm_test();


function chplex_test()
{
    const Model2D = require('my-projects/models/model-2d');
    const ports = require('my-projects/models/my-ports').all;
    const RENXt = require('my-plugins/hw/RenXt');

//    RENXt.PWM(polarity)
    logger("starting");
    var amodel = new Model2D({name: 'chplex', w: 7, h: 8, zinit: false, nodetype: RENXt.CHPLEX(RENXt.ACTIVE_HIGH), order: Model2D.prototype.T2B_L2R, output: 'mono', port: ports[0]});
//    console.log("amodel node list %j", amodel.nodelist);
    logger("model created, node list: %s", amodel.nodelist.toString());
    amodel //NOTE: context2D here wants RGBA or RGB, not ARGB
        .pixel(0, 0, '#000011').pixel(1, 0, '#000012').pixel(2, 0, '#000013').pixel(3, 0, '#000014').pixel(4, 0, '#000015').pixel(5, 0, '#000016').pixel(6, 0, '#000017')
        .pixel(0, 2, '#000081').pixel(1, 2, '#000082').pixel(2, 3, '#000083').pixel(3, 3, '#000084').pixel(4, 3, '#000085').pixel(5, 3, '#000086').pixel(6, 3, '#000087')
        .pixel(0, 3, '#000081')
        .pixel(0, 4, '#000081')
        .pixel(0, 5, '#000081')
        .pixel(0, 6, '#000081')
        .pixel(0, 7, '#000088');
    var imgdata = amodel.imgdata();
    logger("amodel node buf: %s", imgdata.data); //JSON.stringify(imgdata)); //.data.toString());
setTimeout(function()
{
    amodel.render().flush();
    amodel.fill(0).render().flush();
    amodel.fill('#AABBCC').render().flush();
}, 1000); //allow serial port some time to open
//    setTimeout(function() { ports[0].verify(true); }, 1000); //final loopback data check
//        this.MyFx.column.call(this, br, brcolor);
}
//chplex_test();
//setTimeout(function trailer() { console.log(process._getActiveHandles()); }, 5000);


function model_reader()
{
const models = require('my-projects/models/my-models').models;
//var entire = models.entire;
}
//model_reader();


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// other
//


function vix2json_obsolete()
{
const outfile = "zout.json";
const profile = 'my-projects/playlists/!(*RGB*).pro';
const sequence = 'my-projects/songs/xmas/Amaz*/*Amaz*.vix';

//var vix2prof = new require('my-plugins/streamers/vix2json').Profile(profile);
//var vix2seq = new require('my-plugins/streamers/vix2json').Sequence({filename: sequence, profile: vix2prof});
var outs = stmon.wr(outfile, "vix2 outfile"); //fs.createWriteStream(outfile);
//var outs = stmon.rdwr("vix2 in/outfile");
//outs.pipe(process.stdout);
//outs.pipe(zlib.createGzip()).pipe(stmon.wr('zout.json.gz')); //compress

//outs.write("["); //wrap in one large json array
//outs.svwrite = outs.write; outs.write = function(buf) { outs.svwrite(JSON.stringify(buf) + ',\n'); };
//vix2prof.toJSON(outs); //put channel + profile info in front of seq
//vix2seq.toJSON(outs);
//outs.write = outs.svwrite;
//outs.write(JSON.stringify("eof") + "]");
    require('my-plugins/streamers/vix2json').Vixen2json(outs, profile, sequence);
    outs.end(); //eof
//logger("written".cyan);
//return outs;
}
//vix2json();
//NO process.exit(0); //DO NOT DO THIS; async stream not written yet!


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
