
'use strict';

require('colors');
const fs = require('fs');
const inherits = require('inherits');
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
//    if (!(this instanceof PortBase)) return makenew(PortBase, arguments);
//    streamBuffers.WritableStreamBuffer.apply(this, args);

    this.models = [];
    this.assign = function(model)
    {
        logger("assigned model '%s' to port '%s'".blue, model.name, this.name || this.device);
        this.models.push(model);
//no; already done        model.port = this;
    }
//    this.dirty = false;
//    var m_outbufs = [new Buffer(4096), new Buffer(4096)], m_ff = 0; //double buffered for dedup
    this.outbuf = new streamBuffer.WritableStreamBuffer(); //default size 8K; should be enough, but is growable anyway
    Object.defineProperty(this, 'dirty',
    {
        get() { return this.outbuf.size(); }, //this will automatically be reset after outbuf.getContents()
        set(newval)
        {
            if (newval) throw "PortBase: dirty flag can only be set indirectly by writing data";
//            this.reset();
            this.outbuf.getContents(); //clear current contents
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


//dump current buffer contents (for debug):
//PortBase.prototype.dump = function dump(filename)
//{
//    var stream = fs.createWriteStream(process.cwd() + '/' + this.name + '-frame.data', {flags: 'w', objectMode: true});
//    stream.write(buf);
//    stream.end();
//}


//send current port contents immediately:
//caller controls timing
PortBase.prototype.flush = function reset()
{
    if (!this.dirty) return;
    logger("write %d to port '%s':", this.outbuf.size(), this.name, "tbd");
    throw "TODO: write to port";
//    return {port: this.name || this.device, frtime: frtime, frnext: (frnext_min !== false)? frnext_min: undefined, buflen: buflen, buf: buf}; //this.outbuf.getContents()};
    this.dirty = false;
}


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
        logger("  serial[%s/%s]: '%s' '%s' '%s'".cyan, inx, ports.length, port.comName, port.manufacturer, port.pnpId);
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


//simplified wrapper (sets default params):
function MySerialPort(path, options, openImmediately, callback)
{
    if (!(this instanceof MySerialPort)) return makenew(MySerialPort, arguments);
//    serial.SerialPort.apply(this, arguments);
    serial.SerialPort.call(this, path, options || config(242500, '8N1', FPS), openImmediately || false, callback); //false => don't open immediately (default = true)
    PortBase.apply(this, arguments); //multiple inheritance
    this.device = this.path;
//    MySerialPort.all.push(this); //allows easier enum over all instances
}
inherits(MySerialPort, serial.SerialPort);
Object.assign(MySerialPort.prototype, PortBase.prototype); //multiple inheritance
module.exports.SerialPort = MySerialPort;
//MySerialPort.all = [];


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
var yport = named(new MySerialPort('/dev/ttyUSB0'), 'FTDI-Y');
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
