
'use strict';

const inherits = require('inherits');
const makenew = require('my-plugins/utils/makenew');
const logger = require('my-plugins/utils/logger')();
var split = require('split'); //https://github.com/dominictarr/split
//const stream = require('stream');
//const Duplex = stream.Duplex || require('readable-stream').Duplex; //for example see http://codewinds.com/blog/2013-08-31-nodejs-duplex-streams.html
//require('my-plugins/my-extensions/json-revival');
//var buf = models.entire.imgdata();
const bufferJSON = require('buffer-json'); //https://github.com/jprichardson/buffer-json

debugger;
module.exports = MyFx;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// process embedded effects in stream:
//

/*
function FxStream(opts)
{
    if (!(this instanceof FxStream)) return makenew(FxStream, arguments);
    this.
    Duplex.apply(this, arguments); //base class
}
inherits(FxStream, Duplex);

FxStream.prototype._write = function writer(chunk, encoding, done)
{
    console.log('write: ', chunk.toString(encoding));
    done();
}

FxStream.prototype._read = function reader(size_ignored)
{
    this.push(data);
    this.push(null); //eof
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


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// base class for custom effects:
//

function MyFx(data)
{
    if (!(this instanceof MyFx)) return makenew(MyFx, arguments);
//TODO: initialization?
}


MyFx.prototype.ismine = function ismine(fxname)
{
    return fxname && (fxname in this) && (typeof this[fxname] == 'function'); //.prototype;
}


MyFx.prototype.FxPlayback = function FxPlayback(rdstr)
{
    this.busy = true;
    this.opcodes = {};
    var withfx = 0, without = 0, unkn = 0, errors = 0;
    rdstr
//    .pipe(echoStream)
        .pipe(split(JSON.parse, bufferJSON.reviver)) //repair buffers; see https://github.com/jprichardson/buffer-json
        .on('data', function (data) //each chunk now is an object
        {
            if (typeof data.fx == 'undefined') { ++without; return; } //no effect to process
            console.log("json[%d]: time %s, data %j", withfx++, data.time || '(no time)', data);
            if (isNaN(++this.opcodes[data.fx])) this.opcodes[data.fx] = 1;
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
            logger("opcodes: %j", this.opcodes);
            this.busy = false;
        }.bind(this));
    return rdstr; //fluent
}


//special-purpose pseudo-effects:

MyFx.prototype.rawbuf = function rawbuf(data)
{
//TODO: save raw data
}


MyFx.prototype.vix2json = {}; //namespace

MyFx.prototype.vix2json.Profile = function vix2json_prof(data)
{
    this.prof_info = Object.assign(this.prof_info || {}, data); //just store profile props for access later
}


MyFx.prototype.vix2json.Sequence = function vix2json_seq(data)
{
    this.seq_info = Object.assign(this.seq_info || {}, data); //just store sequence props for access later
}


//define custom effects:
//NOTE: nested namespaces are supported


MyFx.myfx = new MyFx(); //create a global, shared instance but allow caller to create others

//eof
