
'use strict';

require('colors');
const fs = require('fs');
const path = require('path');
const inherits = require('inherits');
const Elapsed = require('my-plugins/utils/elapsed');
const clock = require('my-plugins/utils/clock');
//const unprintable = require('my-plugins/utils/unprintable');
const makenew = require('my-plugins/utils/makenew');
//const fs = require('my-plugins/streamers/DelayedCreateWriteStream');
const streamBuffer = require('stream-buffers'); //https://github.com/samcday/node-stream-buffer
const stmon = require('my-plugins/streamers/stmon').stmon;
const logger = require('my-plugins/utils/logger')();
var buffer = require('buffer');
buffer.INSPECT_MAX_BYTES = 150;
var Stream = require('stream');
var Duplex = Stream.Duplex || require('readable-stream').Duplex;
var Readable = Stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
var Writable = Stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html
var Transform = Stream.Transform || require('readable-stream').Transform;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Basic hardware port types:
//


//hardware port types:
const serial = require('serialport'); //https://github.com/voodootikigod/node-serialport


var serial_config =
{
    fps: 20,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
    baudrate: 242500,
    buffersize: Math.floor(this.baudrate / (1 + this.dataBits + this.stopBits + 1) / this.fps), //number of bytes that can be transferred each frame
//    if (typeof CFG.sport_hupcl != 'undefined') cfg.hupcl = CFG.sport_hupcl;
//    cfg..disconnectedCallback = TODO?
};


//derive from duplex stream
//code taken from serialport-stream
//API: .write, .on('data'), .open, .close
function MySerialPort(spath, options) //, openImmediately, callback)
{
    if (!(this instanceof MySerialPort)) return makenew(MySerialPort, arguments);
//    if (typeof CFG.sport_immed != 'undefined') openImmediately = CFG.sport_immed; //give caller time to change port
//    serial.SerialPort.apply(this, arguments);
//    serial.SerialPort.call(this, spath, options || CFG.def_sport, false); //openImmediately || false, callback); //false => don't open immediately (default = true)
    Duplex.call(this); //base class
//    port = port || '/dev/ttyS0'
//    baud = (baud | 0) || 115200
//    this._fd = null;
    var self = this;
    var m_sport = makenew(serial.SerialPort, [spath, options || serial_config, false]); //true, function open_cb(err, fd) //openImmediately || false, callback); //false => don't open immediately (nextTick, default = true)
    m_sport.setMaxListeners(5); //avoid mem leak warnings
//    m_sport.on('data', function ondata(data) { self.push(data); }); //redir incoming serial data to readable side of Duplex
//    this.close = function myclose() { return m_sport.close(); }
    m_sport.pipe(this); //same effect as above
//    PortBase.apply(this, arguments); //base class (was multiple inheritance, now just single)
    this.device = m_sport.path;
    stmon(m_sport, 'serial ' + this.device, true);
    m_sport.open(function open_cb(err, fd)
    {
        debugger;
//        if (err) return self.emit('error', err);
//        self._fd = fd;
//        self._readStream = fs.createReadStream(spath, { fd: fd, autoClose: false });
//        self._readStream.on('error', function (err) { self.emit('error', err) });
//        self._writeStream = fs.createWriteStream(spath, { fd: fd, autoClose: false });
//        self._writeStream.on('error', function (err) { self.emit('error', err) });
        self.emit('open');
    });
    this.pipe(m_sport);
/*
    this.on('readable', function onreadable() //.write() comes thru here
    {
        for (;;)
        {
            var chunk = this.read();
            if (chunk === null) break;
            console.log('read: ', chunk.toString());
            m_sport.write(chunk);
        }
    });
*/
//    this.ducktype(m_sport);
//    this.port = m_sport;
}
inherits(MySerialPort, Duplex);


/*
MySerialPort.prototype.whenOpen =
function whenOpen(self, cb)
{
    if (self._fd === null) self.once('open', cb);
    else cb.call(self);
}

MySerialPort.prototype._read =
function _read(size)
{
    this.whenOpen(this, function read_open()
    {
        var self = this;
        this._readStream.on('readable', function () { self.push(this.read(size)); });
    });
}

MySerialPort.prototype._write =
function _write(chunk, encoding, cb)
{
    this.whenOpen(this, function write_open()
    {
        this._writeStream.write(chunk, encoding, cb)
    });
}
*/

//MySerialPort.prototype.close =
//function close(cb)
//{
//    var self = this;
//    var fd = this._fd;
//    this._fd = this._writeStream = this._readStream = null;
//    this.writable = false;
//    fs.close(fd, function close(err)
//    {
//        if (err) self.emit('error', err);
//    });
//}


//TODO: ethernet? (E1.31, etc)


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// mixins/wrappers:
//

//const PortBase = module.exports /*.Ports*/ =
function PortBase(args)
{
    if (!(this instanceof PortBase)) return makenew(PortBase, arguments);

    this.inbuf = new streamBuffer.WritableStreamBuffer(); //default size 8K; should be enough, but is growable anyway
    this.outbuf = new streamBuffer.WritableStreamBuffer(); //default size 8K; should be enough, but is growable anyway
}


/*not needed
//duck type a wrapper object in lieu of inheritance:
PortBase.prototype.ducktype =
function ducktype(port, desc)
{
//set up pass-thru methods so this object can be used as a stream:
    ['on', 'once', 'open', 'emit', 'write', 'drain', 'close'].forEach(function passthru_each(method)
    {
        this[method] = port[method].bind(port);
    }.bind(this));
    process.nextTick(function inbuf_piped() { port.pipe(this.inbuf); }.bind(this)); //give caller a chance to intercept before connecting pipes
    stmon(port, desc, true); //debug, no functional purpose
}
*/


//CAUTION: conflicts with ??.flush method
//write+drain:
PortBase.prototype.flush =
function myflush(seqnum)
{
    var data = this.outbuf.getContents(); //slice(0, outlen); //CAUTION: need to copy data here because buf will be reused; kludge: no len param to write(), so trim buffer instead
debugger;
    this.write(data, function write_done(err, results)
    {
        if (err) { this.iostats.push({wrerr: err.message || "some kind of write error", seqnum: seqnum, port: this.name || this.device, time: elapsed.now}); return; } //console.log('write "%s" seq# %s err after %s: '.red, this.name, iorec.seqnum, elapsed.scaled(), err); return; } //cb(err); }
        logger(10, 'wrote "%s" seq# %s %s bytes ok after %s; results %s: %j'.green, this.name, seqnum, data.length, elapsed.scaled(), results.length, results);
        this.drain(function drain_done(err)
        {
            if (err) { this.iostats.push({drerr: err.message || "some kind of drain error", seqnum: seqnum, timer: elapsed.now}); return; } //console.log('drain %s err '.red + err, iorec.seqnum); return; } // cb(err); }
            logger(10, "drain '%s' seq# %s len %d completed after %s".green, this.name, seqnum, data.length, elapsed.scaled());
            this.iostats.push({drokay: "wr+dr len # okay".replace(/#/, data.length), seqnum: seqnum, time: elapsed.now});
        }.bind(this));
    }.bind(this));
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// protocol handlers:
//

const RenXt = require('my-plugins/hw/RenXt');

/*
function RenXtProtocol(port)
{
    if (!(this instanceof RenXtPort)) return makenew(RenXtPort, arguments);
    this.port = port;
    port.duck_type(this);
}
*/
//stream.constructor.name + " port '" + (sthis.name || this.device) + "'"


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// ports:
//

function named(obj, name)
{
    obj.name = obj.name || name || '(unnamed)'; //makes debug easier
    return obj;
}


const hex = require('my-projects/models/color-fx').hex;
const int24 = require('int24');

function mkbuf(color, asstring)
{
    var data = new Buffer(125), ofs = 0;
    for (var adrs = 1; adrs <= 5; ++ adrs)
    {
        data[ofs++] = RenXt.RENARD_SYNC; data[ofs++] = adrs;
        data[ofs++] = RenXt.SETPAL(1); int24.writeUInt24BE(data, ofs, color >>> 0); ofs += 3; //data[ofs++] = 0x10; data[ofs++] = 0; data[ofs++] = 0;
        data[ofs++] = RenXt.SETALL(0); //for (var i = 0; i < 15; ++i) data[ofs++] = RenXt.NOOP;
    }
    for (var adrs = 1; adrs <= 5; ++ adrs)
    {
        data[ofs++] = RenXt.RENARD_SYNC; data[ofs++] = adrs;
        data[ofs++] = RenXt.NODEFLUSH;
    }
    data[ofs++] = RenXt.RENARD_SYNC;
    console.log("outbuf %s", hex(color, 6), data.slice(0, ofs));
    data = data.slice(0, ofs); //binary data; needs objectMode on recipient
    if (asstring) data = JSON.stringify(data, buf_replacer) + '\n';
    return data;
}

function buf_replacer(key, value)
{
    return value;
    if (Buffer.isBuffer(this[key])) //this[key] instanceof Date){
    {
//        var date = this[key];
//        return date.getDay() + "/" + date.getMonth() + "/" + date.getYear();
        return buf_inspector.call(this[key]);
    }
    return value;
}

function buf_inspector(depth, opts) //make debug easier
{
    const GROUPW = 1; //4;
    var buf = '';
    for (var ofs = 0, limit = /*retval*/ this.length /*numch*/; ofs < limit; ofs += GROUPW)
    {
//            if (ofs >= buffer.INSPECT_MAX_BYTES) { buf += ' ... ' + (limit - ofs) / GROUPW + ' '; break; }
        buf += ' ' + this[ofs].toString(16); //hex(this.readUInt32BE(ofs), 8); //toRGBA(/*retval*/ this.data[ofs], /*retval*/ this.data[ofs + 1], /*retval*/ this.data[ofs + 2], /*retval*/ this.data[ofs + 3])); //uint32view[ofs]); //retval.data.readUInt32BE(ofs));
    }
    return '<buf-hex ' + (limit / GROUPW) + ': ' + buf + '>';
}

var fmtter = RenXt.RenXtLoopback;

//var myport = new RenXtPort(named(new MySerialPort('/dev/ttyUSB0'), 'FTDI-W'));
debugger;
//var myport = stmon(named(new MySerialPort('/dev/ttyUSB0'), 'FTDI-W'), "ser port", true);
var myport = new serial.SerialPort('/dev/ttyUSB0', serial_config, false); //true, function open_cb(err, fd) //openImmediately || false, callback); //false => don't open immediately (nextTick, default = true)
myport = stmon(myport, "ser port", true);
myport.setMaxListeners(5); //avoid mem leak warnings
myport.end = myport.close;
myport.open(function(err, fd)
{
    console.log("open err", err, "fd", fd);
});
myport.on('data', function ondata(data)
{
    console.log("got data", data);
});

//myport.port.open();
function test2()
{
//debugger;
    var recorded = fs.createWriteStream('in.log'); //, "port '" + this.name + "' input");
    recorded.write(mkbuf(0x100000));
    recorded.write(mkbuf(0x001000));
    recorded.write(mkbuf(0x000010));
    recorded.end();
debugger;
//    myport.write(buf.slice(0, ofs));
//    setTimeout(function() { myport.close(); }, 1000);
//    console.log("handles", process._getActiveHandles());
}
const bufferJSON = require('buffer-json'); //https://github.com/jprichardson/buffer-json
function test1()
{
    myport.end = myport.close; //kludge: fix up method names for use with pipes
    var trace = fs.createWriteStream('out.log'); //, "port '" + this.name + "' input");
    var recorded = fs.createReadStream('in.log'); //, "port '" + this.name + "' input");
//without stringify:    recorded.pipe(myport).pipe(trace);
//    recorded.pipe(myport).pipe(trace);
    myport.pipe(trace);
    var lineReader = require('readline').createInterface({input: recorded});
    lineReader.on('line', function online(line)
    {
//        console.log('Line from file:', line);
//        recorded.pipe(myport).pipe(trace);
        var data = JSON.parse(line, bufferJSON.reviver); //repair buffers; see https://github.com/jprichardson/buffer-json
//        console.log("data", data);
        myport.write(data);
    });
//stream = stream.pipe(ReadlineStream());
}

function test3()
{
    var trace = fs.createWriteStream('out.log'); //, "port '" + this.name + "' input");
    trace = stmon(trace, "trace", true);
//    trace.end = trace.close;
    var fmtin = new fmtter({/*objectMode: true,*/ tag: 'in', dest: trace}); //writableObjectMode: false, readableObjectMode: true});
    fmtin = stmon(fmtin, "fmt in", true);
    var fmtout = new fmtter({/*objectMode: true,*/ tag: 'out', dest: trace}); //writableObjectMode: false, readableObjectMode: true});
    fmtout = stmon(fmtout, "fmt out", true);
    var str = new streamBuffer.ReadableStreamBuffer();
trace.setMaxListeners(5); //avoid mem leak warnings
    str = stmon(str, "str", true);
    str.write = str.put;
    str.close = str.stop;
//    var str = fs.createReadStream('in.log');
    str.pipe(fmtout); //.pipe(trace);
    str.pipe(myport).pipe(fmtin); //.pipe(trace);

//    var recorded = fs.createWriteStream('in.log'); //, "port '" + this.name + "' input");
    str.write(mkbuf(0x100000));
    str.write(mkbuf(0x001000));
    str.write(mkbuf(0x000010));
    setTimeout(function() { str.close(); }, 2000);
}
setTimeout(function() { test3(); }, 1000);

//eof
