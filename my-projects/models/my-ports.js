
'use strict';

require('colors');
const fs = require('fs');
const inherits = require('inherits');
const Elapsed = require('my-plugins/utils/elapsed');
const clock = require('my-plugins/utils/clock');
const makenew = require('my-plugins/utils/makenew');
const streamBuffer = require('stream-buffers'); //https://github.com/samcday/node-stream-buffer
const logger = require('my-plugins/utils/logger')();


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Port (physical device) base class for defining output buffer and attaching models
//

//port base class:
//only used to hold port and model collections currently
//also defines an I/O buffer (stream)
function PortBase(args)
{
//no    if (!(this instanceof PortBase)) return makenew(PortBase, arguments);
//    streamBuffers.WritableStreamBuffer.apply(this, args);

    this.models = [];
//    this.dirty = false;
//    var m_outbufs = [new Buffer(4096), new Buffer(4096)], m_ff = 0; //double buffered for dedup
    this.inbuf = new streamBuffer.WritableStreamBuffer(); //default size 8K; should be enough, but is growable anyway
//    this.verbuf = new streamBuffer.WritableStreamBuffer(); //default size 8K; should be enough, but is growable anyway
    this.outbuf = new streamBuffer.WritableStreamBuffer(); //default size 8K; should be enough, but is growable anyway
    this.ioverify = [];
    Object.defineProperty(this, 'dirty',
    {
        get() { return this.outbuf.size(); }, //this will automatically be reset after outbuf.getContents()
        set(newval)
        {
            if (newval && !this.dirty) throw "PortBase: dirty flag can only be set indirectly by writing data";
//            this.reset();
            if (!newval) this.outbuf.getContents(); //clear current contents
        },
    });
    PortBase.all.push(this); //allows easier enum over all instances
}
//inherits(PortBase, streamBuffers.WritableStreamBuffer);
//module.exports.ChannelPools = ChannelPools;
module.exports /*.Ports*/ = PortBase;
PortBase.all = [];


//clear current port buffer:
//PortBase.prototype.reset = function reset()
//{
//    this.outbuf.getContents(); //clear current contents
//}


PortBase.prototype.assign = function(model)
{
    logger("assigned model '%s' to port '%s'".blue, model.name, this.name || this.device);
    this.models.push(model);
//no; already done        model.port = this;
}


//dump current buffer contents (for debug):
//PortBase.prototype.dump = function dump(filename)
//{
//    var stream = fs.createWriteStream(process.cwd() + '/' + this.name + '-frame.data', {flags: 'w', objectMode: true});
//    stream.write(buf);
//    stream.end();
//}


//send current port contents immediately:
//caller controls timing
PortBase.prototype.flush = function reset(seqnum)
{
    console.log("port '%s' flush: dirty? %s, size %s", this.name || this.device, !!this.dirty, this.outbuf.size());
    if (!this.dirty) return;
debugger;
    logger("write %d to port '%s':", this.outbuf.size(), this.name, "tbd");
//    throw "TODO: write to port";
//    this.encode();
    var data = this.outbuf.getContents(); //slice(0, outlen); //kludge: no len param to write(), so trim buffer instead
    var iorec = {seqnum: seqnum || 0, data: data, len: data.length, sendtime: clock.Now(), sendtime_str: clock.Now.asString()};
//    this.verbuf.write(data);
    this.ioverify.push(iorec);
    var elapsed = new Elapsed();
    this.write(data, function(err, results)
    {
//        console.log(typeof outbuf);
//        var outdesc = outbuf.length + ':"' + ((typeof outbuf === 'string')? outbuf: (outbuf.toString('utf8').substr(0, 20) + '...')).replace(/\n/g, "\\n") + '"';
        if (err) { iorec.err = err; iorec.errtime = elapsed.now; console.log('write seq# "%s" err after %s: '.red, seqnum, elapsed.scaled(), err); return; } //cb(err); }
        console.log('write seq# "%s" ok after %s; results %d:'.green, seqnum, elapsed.scaled(), results.length, results);
        iorec.writetime = elapsed.now;
        this.drain(function(err)
        {
            if (err) { iorec.errtime = elapsed.now; console.log('drain %s err '.red + err, seqnum); return; } // cb(err); }
            console.log("drain seq# %s completed after %s".green, seqnum, elapsed.scaled());
            iorec.draintime = elapsed.now;
            setTimeout(function() { this.verify(); }.bind(this), this.loopback_delay || 5);
//            return cb();
        }.bind(this));
    }.bind(this));
//too soon    this.verify();
//    return {port: this.name || this.device, frtime: frtime, frnext: (frnext_min !== false)? frnext_min: undefined, buflen: buflen, buf: buf}; //this.outbuf.getContents()};
    this.dirty = false;
}


//verify integrity of outbound data:
//data is discarded here; protocol-enabled caller can override
PortBase.prototype.verify = function verify()
{
    this.ioverify.shift();
    if (this.inbuf.size()) console.log("discarding loopback data");
    this.inbuf.getContents();
}


//allow protocol to compress outbound data:
//PortBase.prototype.encode = function encode() {}


/*
render = function(frtime) //{frnext, buf}
{
    console.log("port '%s' base render %d models", this.name, this.models.length);
//        var buf = null;
    this.outbuf.getContents(); //clear current contents
    var frnext_min = false; //assume no further frames are needed (no animation); //(this.FixedFrameInterval)? frtime + this.FixedFrameInterval: this.duration;
    this.models.forEach(function(model)
    {
        var was_dirty = model.dirty;
        var frnext = model.render(frtime); //render new output if dirty, get next refresh time
        /-*if (was_dirty)*-/ this.outbuf.write(model.outbuf); //no or dumb protocol: fixed length output; copy all model outputs even if no change
        console.log("model '%s' render: frnext %s, now dirty? %s %s, port outbuf len %s", model.name, frnext, model.dirty, (model.parent || {}).dirty, this.outbuf.size());
        if ((frnext === false) || (frnext === true)) return; //no next frame
        frnext_min = (frnext_min === false)? frnext: Math.min(frnext_min, frnext);
    }.bind(this));
    var buflen = this.outbuf.size(), buf = this.outbuf.getContents();
    console.log("finished port '%s' render: frnext %s, buflen %s %s", this.name, frnext_min, buflen, (buf || []).length);
    if (buf)
    {
        var stream = fs.createWriteStream(process.cwd() + '/frame.data', {flags: 'w', objectMode: true});
        stream.write(buf);
        stream.end();
    }
    return {port: this.name || this.device, frtime: frtime, frnext: (frnext_min !== false)? frnext_min: undefined, buflen: buflen, buf: buf}; //this.outbuf.getContents()};
}
*/


///////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Port definitions (physical devices):
//

// Models are assigned to physical ports
// Protocols are also assigned to ports

const serial = require('serialport'); //https://github.com/voodootikigod/node-serialport
const RenXt = require('my-plugins/hw/RenXt');


//show list of available ports (async):
serial.list(function(err, ports)
{
    if (err) logger("serial port enum ERR: %j".red, err);
    else logger("found %d serial ports:".cyan, ports.length);
    (ports || []).forEach(function(port, inx)
    {
        if (inx < 10) logger("  serial[%s/%s]: '%s' '%s' '%s'".cyan, inx, ports.length, port.comName, port.manufacturer, port.pnpId);
    });
});


//supported serial port bit configs:
//add more as desired
var CONFIG =
{
    '8N1': {dataBits: 8, parity: 'none', stopBits: 1},
    '8N1.5': {dataBits: 8, parity: 'none', stopBits: 1.5}, //NOTE: might report error but seems to work anyway
    '8N2': {dataBits: 8, parity: 'none', stopBits: 2},
};
const FPS = 20; //target 50 msec frame rate

function config(baud, bits, fps)
{
    var cfg = CONFIG[bits];
    if (!cfg) throw "Unhandled serial config: '" + bits + "'";
    cfg.baudrate = baud;
//    cfg.buffersize = Math.floor(baud / (1 + cfg.dataBits + cfg.stopBits + 1) / fps); //number of bytes that can be transferred each frame
    cfg.buffersize = 4096; //NOTE: ignore FPS restrictions to simplify special cases such as RenXt enum
}


//simplified wrapper for SerialPort (sets default params):
//NOTE: use containment rather than inheritance to avoid method name conflicts
function MySerialPort(path, options, openImmediately, callback)
{
    if (!(this instanceof MySerialPort)) return makenew(MySerialPort, arguments);
//    serial.SerialPort.apply(this, arguments);
//    serial.SerialPort.call(this, path, options || config(242500, '8N1', FPS), false); //openImmediately || false, callback); //false => don't open immediately (default = true)
    var m_sport = new serial.SerialPort(path, options || config(242500, '8N1', FPS), false); //openImmediately || false, callback); //false => don't open immediately (default = true)
    PortBase.apply(this, arguments); //multiple inheritance
    this.device = m_sport.path;

//status tracking (for debug):
    m_sport.on("open", function () { console.log('opened %s'.green, this.path); }.bind(this));
//.flush(cb(err)) data received but not read
//debugger;
    m_sport.on('data', function(data) { this.inbuf.write(data); console.log('data received on \'%s\' len %d: "%s"'.blue, this.device, data.length, data.toString('utf8').replace(/\n/g, "\\n").replace(/[^\x20-\x7F]/g, "?")); }.bind(this));
    m_sport.on('error', function(err) { debugger; console.log("ERR on %s: ".red, this.path, err); }.bind(this));
    m_sport.on('close', function() { console.log("closed %s".cyan); }.bind(this));
    m_sport.on('disconnect', function() { console.log("disconnected %s".red, this.path); }.bind(this));
    if (openImmediately) m_sport.open(); //open after evt handlers are in place
    this.self_emit = function(evt, data) { debugger; return m_sport.emit.apply(m_sport, arguments); }
//    MySerialPort.all.push(this); //allows easier enum over all instances
}
//inherits(MySerialPort, serial.SerialPort);
//Object.assign(MySerialPort.prototype, PortBase.prototype); //multiple inheritance
inherits(MySerialPort, PortBase);
module.exports.SerialPort = MySerialPort;
//MySerialPort.all = [];


function FakeSerialPort(path, options, openImmediately, callback)
{
    if (!(this instanceof FakeSerialPort)) return makenew(FakeSerialPort, arguments);
    var args = Array.from(arguments);
    if (args.length > 2) args[2] = false;
    MySerialPort.apply(this, args); //base class
    this.write = function(data, cb)
    {
//simulate I/O:
//TODO: simulate random error?
        setTimeout(function() { cb(null, "ok"); }, 15);
        setTimeout(function()
        {
            if (this.draincb) this.draincb(null);
            this.self_emit('data', data); //simulated loopback; TODO: simulate active protocol
        }.bind(this), Math.max(5 + Math.ceil(.044 * data.length), 16)); //252K baud ~= 44 usec/char + 5 msec USB latency
    }
    this.drain = function(cb) { this.draincb = cb; }
}
inherits(FakeSerialPort, MySerialPort);


function OtherPort(args)
{
    if (!(this instanceof OtherPort)) return makenew(OtherPort, arguments);
    PortBase.apply(this, arguments);
//TODO
//    OtherPort.all.push(this); //allows easier enum over all instances
}
inherits(OtherPort, PortBase);
//module.exports.OtherPort = OtherBase;
//OtherPort.all = [];


//attach a name to port for easier recognition:
//using a separate wrapper function to avoid interfering with ctor param list
function named(obj, name)
{
    obj.name = obj.name || name || '(unnamed)'; //makes debug easier
    return obj;
}


//first define my hardware ports:
var yport = named(new FakeSerialPort('/dev/ttyUSB0'), 'FTDI-Y');
var gport = named(new MySerialPort('/dev/ttyUSB1'), 'FTDI-G');
var bport = named(new MySerialPort('/dev/ttyUSB2'), 'FTDI-B');
var wport = named(new MySerialPort('/dev/ttyUSB3'), 'FTDI-W');
var noport = named(new PortBase(), 'none');

//then assign protocol handlers:
PortBase.all.forEach(function(port)
{
    if (!port.device) return;
//    chpool.port = new serial.SerialPort(chpool.opts.device, config(242500, '8N1', FPS), false); //false => don't open immediately (default = true)
    RenXt.AddProtocol(port); //protocol handler; implements outflush to send output buffer to hardware
});


//var ChannelPool = require('my-projects/models/chpool');
//var chpools = module.exports.chpools =
//{
//    nullport: new ChannelPool('null'),
//    bport: new ChannelPool({name: 'FTDI-B', device: "/dev/ttyUSB0"}),
//    gport: new ChannelPool({name: 'FTDI-G', device: "/dev/ttyUSB1"}),
//    wport: new ChannelPool({name: 'FTDI-W', device: "/dev/ttyUSB2"}),
//    yport: new ChannelPool({name: 'FTDI-Y', device: "/dev/ttyUSB3"}),
//};
//var noport = /*xmas.ports.no_port =*/ new ChannelPool('no-hw'); //dummy port for fx or virt channels
//var yport = /*xmas.ports.FTDI_y =*/ new ChannelPool({name: 'FTDI-Y', device: '/dev/ttyUSB0'}); //2100 Ic + 150 Cols ~= 2250 nodes
//var gport = /*xmas.ports.FTDI_g =*/ new ChannelPool({name: 'FTDI-G', device: '/dev/ttyUSB1'}); //16 Floods + 1188 Mtree + 640 Angel + 384 Star (reserved) ~= 2228 nodes
//var bport = /*xmas.ports.FTDI_b =*/ new ChannelPool({name: 'FTDI-B', device: '/dev/ttyUSB2'}); //1536 Shep + 256 Gift (reserved) ~= 1792 nodes
//var wport = /*xmas.ports.FTDI_w =*/ new ChannelPool({name: 'FTDI-W', device: '/dev/ttyUSB3'}); //7 * 56 AC (5 * 56 unused) + 768 gdoor + 3 * 384 (AB-future) ~= 2312 nodes

//eof
