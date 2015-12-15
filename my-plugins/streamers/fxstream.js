
'use strict';

const inherits = require('inherits');
const makenew = require('my-plugins/utils/makenew');
const logger = require('my-plugins/utils/logger')();
const Elapsed = require('my-plugins/utils/elapsed');
//var buf = models.entire.imgdata();
//require('my-plugins/my-extensions/json-revival');
const bufferJSON = require('buffer-json'); //https://github.com/jprichardson/buffer-json
const stmon = require('my-plugins/streamers/stmon').not_stmon;
//var split = require('split'); //https://github.com/dominictarr/split
const stream = require('stream');
//const Duplex = stream.Duplex || require('readable-stream').Duplex; //for example see http://codewinds.com/blog/2013-08-31-nodejs-duplex-streams.html
//var Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
const Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html
//const PassThrough = stream.PassThrough || require('readable-stream').PassThrough;

const CatchMissing = true; //true => throw exc, false => log message, null => ignore

//const Model2D = require('my-projects/models/model-2d');
const ports = require('my-projects/models/my-ports').all;
const models_byname = require('my-projects/models/my-models').models;
var models_byzord = [];
models_byname.forEach(function(model) { models_byzord.push(model); });
models_byzord.sort(function(lhs, rhs) { return (lhs.zorder || 0) - (rhs.zorder || 0); }); //overlapping models need to be rendered in the correct z-order
//const vix2chlist = require('my-projects/models/my-models').vix2chlist;

//debugger;
//module.exports = MyFx;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// effects stream processor
//

//writable effects stream:
//this is the main fx interpreter
//responsible for interpreting fx and sending out all hardware updates at the correct time
//incoming stream is processed at full speed then timers are used to throttle output (backpressure will limit memory consumption)
//runs ~ 1 frame ahead to eliminate fx render latency and reduce timing jitter
function FxPlayback(opts)
{
    if (!(this instanceof FxPlayback)) return makenew(FxPlayback, arguments);
    this.objectMode = true; //requires source text stream to be split
    Writable.apply(this, arguments); //base class
    this.opts = {}; //TODO

//NOTE: can instantiate custom stream directly; see http://stackoverflow.com/questions/21491567/how-to-implement-a-writable-stream
//however, we use derivation in order to allow multiple instances
//    this.on('end', function() { console.log("%d json objects read", count); });
    stmon(this, "FxStream");
    this.stats = {fxcalls: {}, withfx: 0, without: 0, unkn: 0, errors: 0, delay_buckets: {}, render_count: 0, render_delay: 0, render_premature: 0};
    ports.forEach(function(port) { port.dirty = false; }); //if (port.want_listen) port.want_listen(this); }.bind(this)); //reset(); }); //clear port I/O buffers
//    models_byname.forEach(function(model) { if (model.want_listen) model.want_listen(this); }.bind(this));

    this.on('data', function fxstream_ondata(data) //NOTE: evt is explicitly generated to resemble readable stream api even tho this is a writable stream
    {
//debugger;
        if (!(this instanceof FxPlayback)) throw "wrong this";
        var has_time = (typeof data.time != 'undefined'); //frames with timestamp are synced
        if (has_time && (typeof this.elapsed == 'undefined')) this.elapsed = new Elapsed(data.time); //sync playback timer to first frame, then subsequent frames to timer; //start elapsed time counter when first frame is received; header frames come before first data frame to stay in sync even with setup or pre-render
//            FxDispatch(data);
//            console.log("in data", data);
        if (typeof data.fx == 'undefined') { ++this.stats.without; return; } //no effect to process
        logger(100, "fx json[%d]: time %s vs. elapsed %s, has buf? %s, data", this.stats.withfx++, has_time? data.time: '(no time)', (this.elapsed || {}).now, Buffer.isBuffer(data.buf), data);
        if (!++this.stats.fxcalls[data.fx] /*isNaN*/) this.stats.fxcalls[data.fx] = 1;
//        if (FxPlayback.myfx.MyFx.ismine(data.fx)) FxPlayback.myfx.MyFx[data.fx](data); //apply fx
//        if (data.fx && /*(data.fx in this) &&*/ (typeof this[fxname] == 'function'); //.prototype;
debugger;
//        (FxPlayback.myfx.MyFx[data.fx] || this.nofx)(data); //apply fx; TODO: bind?
//JS broken!        (models_byname[data.target || 'entire'].fx[data.fx] || this.nofx)(data); //apply fx to whole-house if target model not specified
        var target = models_byname[data.target || 'entire'];
        var model = target;
//        console.log("looking for fx '%s' in target '%s'", data.fx, target.name, target.fx);
        ('MyFx.' + data.fx).split('.').forEach(function(name) { if (target) target = target[name]; });
        if (typeof target == 'function') target.call(model, data); //apply fx to whole-house if target model not specified
        else this.nofx(data);
        if (!has_time) return; //don't need to refresh hardware on this frame
debugger;
//        FxPlayback.myfx.MyFx.render(data.time);
//NOTE: render runs about 1 frame ahead so port flush will be on time
//models can have free-running animation/effects, but a timed frame must occur in stream in other to update/render model updates
        models_byzord.forEach(function(model) { model.render(); }); //copy node data from canvas to port output buffer; protocol will populate port output buffers
        this.flush_ports(data.time); //send bytes to hardware at the correct time
    }.bind(this));
    this.on('error', function (err) //syntax errors will land here; note, this ends the stream.
    {
        ++m_errors;
        logger("error: ".red, err);
    }.bind(this))
    .on('finish', function()
    {
        logger("FxPlayback frames: %d with fx, %d without, %d unknown fx, %d errors".cyan, this.stats.withfx, this.stats.without, this.stats.unkn, this.stats.errors);
        var buf = '';
        this.stats.delay_buckets.forEach(function fxcall_enum(count, key) { buf += ', ' + key + ' = ' + count; });
        logger("FxPlayback render: %d count %d, delay %d, premature %d, buckets: %s".cyan, this.stats.render_count, this.stats.render_delay, this.stats.render_premature, buf.substr(2)); //this.stats.delay_buckets.toString());
        var buf = '';
        this.stats.fxcalls.forEach(function fxcall_enum(count, key) { buf += ', ' + key + ' = ' + count; });
        logger("fx calls: %s", buf.substr(2)); //this.stats.fxcalls.toString());
        ports.forEach(function(port) { if (port.onfinish) port.onfinish(); });
        models_byname.forEach(function(model) { if (model.onfinish) model.onfinish(); });
    }.bind(this));
}
inherits(FxPlayback, Writable);
module.exports /*.FxPlayback*/ = FxPlayback;


//complain about missing fx function:
FxPlayback.prototype.nofx = function nofx(data)
{
//    console.log("this", this);
//    if (!(this instanceof FxPlayback)) throw "wrong this";
    var msg = sprintf("unknown effect for model '%s': '%s'".red, data.target || 'entire', data.fx || '(none)');
    debugger;
    ++this.stats.unkn;
    switch (CatchMissing) //true => throw exc, false => log message, null => ignore
    {
        case true: throw new Error(msg); break;
        case false: logger(msg); break;
        case null: break;
    }
}


FxPlayback.prototype._write = function writer(chunk, encoding, done)
{
//debugger;
    logger(100, "got chunk len %s", chunk.length, chunk.toString('utf8').substr(0, 100));
    if (chunk.length) //not eof
    {
        var buf = JSON.parse(chunk, bufferJSON.reviver);
//    console.log('write: ', chunk.length, encoding, typeof chunk, typeof buf, chunk.toString()); //(encoding));
        this.emit('data', buf); //kludge: force on() to see data (makes interface a little more consistent)
//    this.onfxdata(buf);
    }
    done();
}


//controls timing of port output:
FxPlayback.prototype.flush_ports = function flush_ports(frtime, retry)
{
    var delay = frtime - this.elapsed.now; //always compare to start in order to minimize cumulative timing error
    if (this.opts.speed === 0) delay = 0; //no throttling
    this.stats.render_delay += Math.abs(delay); //use abs() so premature events won't decrease apparent problems
    var delay_bucket = buckets(delay, 3);
    if (!++this.stats.delay_buckets[delay_bucket] /*isNaN*/) this.stats.delay_buckets[delay_bucket] = 1;
    ++this.stats.render_count;
    if (this.opts.speed === 0); //no throttling
    else if (delay < -2.5) logger("frame %s is overdue by %s".red, frtime, delay);
    else if (delay < +2.5) logger("frame %s is more-or-less on time: delay %s".yellow, frtime, delay);
    else
    {
        logger("frame %s is pre-mature after %s: wait %s".blue, delay, retry? "retry": "pre-render", frtime);
        setTimeout(function() { this.flush_ports(frtime, true); }.bind(this), delay);
        return;
    }
    /*models.*/ ports.forEach(function(port) { port.flush(frtime); });
}


function buckets(val, size)
{
    return (val < 0)? -size * Math.floor((size - 1 - val) / size): size * Math.floor((size - 1 + val) / size);
}


/*
FxStream.prototype._read = function reader(size_ignored)
{
    this.push(data);
    this.push(null); //eof
}
*/


/*
MyFx.prototype.FxPlayback = function FxPlayback(rd)
{
    this.busy = true;
    this.fxcalls = {};
    var withfx = 0, without = 0, unkn = 0, errors = 0;
    rd
//    .pipe(echoStream)
//        .pipe(split(JSON.parse)) //repair buffers; see https://github.com/jprichardson/buffer-json
//        .pipe(process.stdout)
        .on('data', function (data) //each chunk now is an object
        {
//            FxDispatch(data);
//            console.log("in data", data);
            if (typeof data.fx == 'undefined') { ++without; return; } //no effect to process
            console.log("json[%d]: time %s, data %j", withfx++, (typeof data.time != 'undefined')? data.time: '(no time)', data);
            if (!++this.fxcalls[data.fx] /-*isNaN*-/) this.fxcalls[data.fx] = 1;
            if (MyFx.myfx.ismine(data.fx)) MyFx.myfx[data.fx](data);
            else { ++unkn; logger("unknown effect: '%s' (ignored)".red, data.fx || '(none)'); }
        }.bind(this))
        .on('error', function (err) //syntax errors will land here; note, this ends the stream.
        {
            ++errors;
            logger("error: ".red, err);
            this.busy = false;
        }.bind(this))
        .on('end', function()
        {
            logger("FxPlayback: %d with fx, %d without, %d unknown fx, %d errors".cyan, withfx, without, unkn, errors);
            logger("fx calls: %j", this.fxcalls);
            this.busy = false;
        }.bind(this));
    return rd; //fluent
}
*/


/*
function example_consumer()
{
    var duplex = new FxStream();
    duplex.on('readable', function ()
    {
        for (;;)
        {
            var chunk = duplex.read();
            if (chunk === null) break;
            console.log('read: ', chunk.toString());
        }
    });
    duplex.write('Hello \n');
    duplex.write('World');
    duplex.end();
}
*/


//eof
