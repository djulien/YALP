
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


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Port (physical device) base class for defining output buffer and attaching models
//

//port base class:
//only used to hold port and model collections currently
//also defines an I/O buffer (stream)
const PortBase = module.exports /*.Ports*/ =
function PortBase(args)
{
    if (!(this instanceof PortBase)) return makenew(PortBase, arguments);
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
PortBase.all = [];


//clear current port buffer:
//PortBase.prototype.reset = function reset()
//{
//    this.outbuf.getContents(); //clear current contents
//}


PortBase.prototype.assign =
function assign(model)
{
    logger("assigned model '%s' to port '%s'".blue, model.name, this.name || this.device);
    this.models.push(model);
//no; already done        model.port = this;
}


//dump current buffer contents (for debug):
//PortBase.prototype.dump =
//function dump(filename)
//{
//    var stream = fs.createWriteStream(process.cwd() + '/' + this.name + '-frame.data', {flags: 'w', objectMode: true});
//    stream.write(buf);
//    stream.end();
//}


//send current port contents immediately:
//caller controls timing
PortBase.prototype.flush =
function flush(seqnum)
{
    if (!this.dirty) return; //TODO: still try a verify?
    if (typeof seqnum != 'undefined') this.seqnum = seqnum; //caller overrides default seq#
    if (isNaN(++this.seqnum)) this.seqnum = 1;
    logger(10, "port '%s' flush[%d]: dirty? %s, size %s".cyan, this.name || this.device, this.seqnum, !!this.dirty, this.outbuf.size());
debugger;
//    seqnum = this.seqnum; //kludge: make local copy for better tracking (shared copy will only show latest value)
    this.verify = function verify_disabled(first) { console.log("(verify)"); } //TODO
    if (this.veri_pending) clearTimeout(this.veri_pending); //postpone final verify until end of frames
    this.veri_pending = setTimeout(function verify_delayed()
    {
        this.veri_pending = null;
        this.verify(true);
    }.bind(this), 1000); //this.loopback_delay || 5); //assume very few simultaneous frames are active
    if (!this.dirty) return;
//    logger(20, "write[%s] %s bytes to port '%s':".cyan, this.seqnum, this.outbuf.size(), this.name); //, "tbd");
//    throw "TODO: write to port";
//    this.encode();
    var data = this.outbuf.getContents(); //slice(0, outlen); //CAUTION: need to copy data here because buf will be reused; kludge: no len param to write(), so trim buffer instead
    var iorec = {seqnum: this.seqnum || 0, data: data, len: data.length, sendtime: clock.Now(), sendtime_str: clock.Now.asString()};
//    this.verbuf.write(data);
    this.ioverify.push(iorec);
    var elapsed = new Elapsed();
    this.write(data, function write_done(err, results)
    {
//        console.log(typeof outbuf);
//        var outdesc = outbuf.length + ':"' + unprintable((typeof outbuf === 'string')? outbuf: (outbuf.toString('utf8').substr(0, 20) + '...')) + '"';
        if (err) { iorec.err = err; iorec.errtime = elapsed.now; console.log('write "%s" seq# %s err after %s: '.red, this.name, iorec.seqnum, elapsed.scaled(), err); return; } //cb(err); }
        logger(10, 'wrote "%s" seq# %s %d bytes ok after %s; results %d:'.green, this.name, iorec.seqnum, iorec.len, elapsed.scaled(), results.length, results);
        iorec.writetime = elapsed.now;
        this.drain(function drain_done(err)
        {
            if (err) { iorec.errtime = elapsed.now; console.log('drain %s err '.red + err, iorec.seqnum); return; } // cb(err); }
            logger(10, "drain '%s' seq# %s len %d completed after %s".green, this.name, iorec.seqnum, iorec.len, elapsed.scaled());
            iorec.draintime = elapsed.now;
//            setTimeout(function drain_delayed() { this.verify(); }.bind(this), this.loopback_delay || 5); //assume very few simultaneous frames are active
            this.verify();
//            return cb();
        }.bind(this));
    }.bind(this));
//too soon    this.verify();
//    return {port: this.name || this.device, frtime: frtime, frnext: (frnext_min !== false)? frnext_min: undefined, buflen: buflen, buf: buf}; //this.outbuf.getContents()};
    this.dirty = false;
}


/*
//verify integrity of outbound data:
//data is discarded here; protocol-enabled caller can override
PortBase.prototype.verify =
function verify()
{
    this.ioverify.shift();
    if (this.inbuf.size()) console.log("discarding loopback data");
    this.inbuf.getContents();
}
*/


//allow protocol to compress outbound data:
//PortBase.prototype.encode = function encode() {}


/*
render =
function render(frtime) //{frnext, buf}
{
    console.log("port '%s' base render %d models", this.name, this.models.length);
//        var buf = null;
    this.outbuf.getContents(); //clear current contents
    var frnext_min = false; //assume no further frames are needed (no animation); //(this.FixedFrameInterval)? frtime + this.FixedFrameInterval: this.duration;
    this.models.forEach(function render_each(model)
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
serial.list(function serial_enum(err, ports)
{
    if (err) logger("serial port enum ERR: %j".red, err);
    else logger("found %d serial ports, first 5:".cyan, ports.length);
    (ports || []).forEach(function port_each(port, inx)
    {
        if (port.comName.match(/ttyUSB|ttyS[0-5]$/)) logger("  serial[%s/%s]: '%s' '%s' '%s'".cyan, inx, ports.length, port.comName, port.manufacturer, port.pnpId);
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
    cfg.hupcl = true;
//    cfg..disconnectedCallback = TODO?
}


//simplified wrapper for SerialPort (sets default params):
//NOTE: use containment rather than inheritance to avoid method name conflicts
const MySerialPort = module.exports.SerialPort =
function MySerialPort(spath, options, openImmediately, callback)
{
    openImmediately = false; //give caller time to change port
    if (!(this instanceof MySerialPort)) return makenew(MySerialPort, arguments);
//    serial.SerialPort.apply(this, arguments);
//    serial.SerialPort.call(this, spath, options || config(242500, '8N1', FPS), false); //openImmediately || false, callback); //false => don't open immediately (default = true)
    var m_sport = new serial.SerialPort(spath, options || config(242500, '8N1', FPS), openImmediately, callback); //false => don't open immediately (nextTick, default = true)
    PortBase.apply(this, arguments); //base class (was multiple inheritance, now just single)
    this.device = m_sport.path;
    this.inbuf = fs.createWriteStream(path.basename(this.name || this.device) + '-out.log'); //, "port '" + this.name + "' input");

//status tracking (for debug):
/*
    m_sport.on("open", function open_cb() { logger(10, 'opened %s'.green, this.name || this.device); }.bind(this));
//.flush(cb(err)) data received but not read
//debugger;
    m_sport.on('data', function data_cb(data) { this.inbuf.write(data); logger(10, 'data received on \'%s\' len %d: "%j"'.blue, this.name || this.device, data.length, data); }.bind(this)); //unprintable(.toString('utf8'))
    m_sport.on('error', function error_cb(err) { debugger; logger(10, "ERR on %s: ".red, this.name || this.device, err || '(error)'); }.bind(this));
    m_sport.on('close', function close_cb() { logger(10, "closed %s".cyan, this.name || this.device); }.bind(this));
    m_sport.on('disconnect', function discon_cb(err) { logger(10, "disconnected %s: %s".red, this.name || this.device, err || '(error)'); }.bind(this));
*/
    stmon(m_sport, "serial port '" + (this.name || this.device) + "'");

//    this.write = function write_serial(data, write_cb) { return m_sport.write.apply(m_sport, arguments); }; //.bind(this);
//    this.drain = function drain_serial(drain_cb) { return m_sport.drain.apply(m_sport, arguments); }; //.bind(this);
//    this.write = m_sport.write.bind(m_sport);
//    this.drain = m_sport.drain.bind(m_sport);
//    this.open = m_sport.open.bind(m_sport);
//    this.self_emit = function self_emit(evt, data) { /*debugger;*/ return m_sport.emit.apply(m_sport, arguments); }
    ['open', 'emit', 'write', 'drain', 'close'].forEach(function passthru_each(method) { this[method] = m_sport[method].bind(m_sport); }.bind(this));
//    if (openImmediately !== false) //setTimeout(function delayed_open()
//    {
//        var elap = new Elapsed();
//        m_sport.open(function sport_opened(err)
//        {
//            logger(10, "open %s took %s, err? %s".yellow, this.name || this.device, elap.scaled(), err || '(no error)');
//        }.bind(this));
//    }; //.bind(this), 16); //open after evt handlers are in place
//    if (openImmediately !== false) m_sport.open(); //open after evt handlers are in place

//    MySerialPort.all.push(this); //allows easier enum over all instances
    process.nextTick(function inbuf_piped() { m_sport.pipe(this.inbuf); }.bind(this)); //give caller a chance to intercept before connecting pipes
}
//inherits(MySerialPort, serial.SerialPort);
//Object.assign(MySerialPort.prototype, PortBase.prototype); //multiple inheritance
inherits(MySerialPort, PortBase);
//MySerialPort.all = [];


function FakeSerialPort(spath, options, openImmediately, callback)
{
    if (!(this instanceof FakeSerialPort)) return makenew(FakeSerialPort, arguments);
//    var args = Array.from(arguments);
//    if (args.length > 2) args[2] = false;
    MySerialPort.apply(this, arguments); //args); //base class
    this.write = function write_fake(data, write_cb)
    {
//??        function write_delayed() { cb(null, "ok"); } //use values current at time of call, not later
//simulated I/O + delays:
//TODO: simulate random errors?
        setTimeout(function write_delayed()
        {
            this.drain = function drain_fake(drain_cb) //CAUTION: don't set this before write wakeup (trying to prevent cb cross-talk)
            {
                setTimeout(function drain_delayed()
                {
                    /*if (this.draincb) this.*/ drain_cb(null);
                    this.emit('data', data); //simulated loopback; TODO: simulate active protocol
                }.bind(this), Math.max(5 + Math.ceil(.044 * data.length), 16)); //252K baud ~= 44 usec/char + 5 msec USB latency
//bad                this.draincb = cb;
            }
            write_cb(null, "ok");
        }.bind(this), 10); //simulate short write delay time
    }
//bad    this.drain = function drain_fake(cb) { this.draincb = cb; }
}
inherits(FakeSerialPort, MySerialPort);


const OtherPort = module.exports.OtherPort =
function OtherPort(args)
{
    if (!(this instanceof OtherPort)) return makenew(OtherPort, arguments);
    PortBase.apply(this, arguments);
//TODO
//    OtherPort.all.push(this); //allows easier enum over all instances
}
inherits(OtherPort, PortBase);
//OtherPort.all = [];


//attach a name to port for easier recognition:
//use a separate wrapper function to avoid interfering with ctor param list
function named(obj, name)
{
    obj.name = obj.name || name || '(unnamed)'; //makes debug easier
//    obj.opts = {speed: 0}; //also disable throttling
    return obj;
}


//first define my hardware ports:
var yport = named(new FakeSerialPort('/dev/ttyUSB0'), 'FTDI-Y');
var gport = named(new FakeSerialPort('/dev/ttyUSB1'), 'FTDI-G');
var bport = named(new FakeSerialPort('/dev/ttyUSB2'), 'FTDI-B');
var wport = named(new MySerialPort('/dev/ttyUSB3'), 'FTDI-W');
var noport = named(new PortBase(), 'none');

//then assign protocol handlers:
PortBase.all.forEach(function port_each(port)
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
