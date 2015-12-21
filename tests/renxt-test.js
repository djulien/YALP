'use strict';

var RenXt = require('my-plugins/hw/RenXt');
var inherits = require('inherits');
var SerialPort = require("serialport"); //.SerialPort;
var DataView = require('buffer-dataview'); //https://github.com/TooTallNate/node-buffer-dataview
//var Elapsed = require('my-plugins/utils/elapsed');
var clock = require('my-plugins/utils/clock');


//TODO hardware mixins:
var HW = {}; //namespace
//HW.SerialPort = function(opts)
//{
//    if (!(this instanceof HW.SerialPort)) return new HW.SerialPort(opts);
//    PortChannels.call(this); //pass options to base class

//add open, io, close methods for serial port:
HW.Serial = {};

HW.Serial.assign = function(that, opts)
{
//abbreviations:
    var CONFIG =
    {
        '8N1': {dataBits: 8, parity: 'none', stopBits: 1},
    };
    if (opts && opts.bits)
        if (!CONFIG[opts.bits]) throw "Unrecognized bit config: '" + opts.bits + "'";
        else opts = Object.assign(opts, CONFIG[opts.bits]);
//config only:
    that.port = new SerialPort.SerialPort(opts.device || '/dev/ttyUSB0',
    {
        fps: opts.fps || 20,
        baudrate: opts.baud || 242500,
        dataBits: opts.dataBits || 8,
        parity: opts.parity || 'none',
        stopBits: opts.stopBits || 1,
        buffersize: opts.bufsize || Math.floor(.95 * this.baudrate / (1 + this.dataBits + this.stopBits) / this.fps) || 2048,
        parser: SerialPort.parsers.raw, xparser: SerialPort.parsers.readline("\n"),
    }); //, function(err)
//    {
//        if (err) console.log("open err on '%s': ".red + err, opts.device);
//        else console.log("'%s' opened after %s".green, clock.elapsed());
//    });
//    var serialPort = new SerialPort.SerialPort("/dev/ttyUSB0", { baudrate: 57600 }, false); // this is the openImmediately flag [default is true]

//handlers:
    that.port.on("open", function() { console.log("'%s' opened", opts.device); });
//.flush(cb(err)) data received but not read
    that.port.on('data', function(data)
    {
        console.log("'%s' data received %d: '%s'".blue, opts.device, data.length, data.toString('utf8').replace(/\n/g, "\\n"));
    });
    that.port.on('error', function(err) { console.log("'%s' ERR: ".red, opts.device, err); });
    that.port.on('close', function() { console.log("'%s' closed".cyan, opts.device); });

//methods:
    that.open = function(cb)
    {
        var started = clock.Now();
        this.port.open(function(err)
        {
            if (err) { console.log("'%s' open err: ".red + err, opts.device); return; }
            console.log("'%s' opened after %d msec".green, opts.device, clock.Now() - start);
            this.io("ls\n");
            this.io("echo hello there;\n");
            var buf = new Buffer(2000);
            buf.fill(0x5a);
            this.io(buf);
        }.bind(this));
    }.bind(that);

    that.io = function(outbuf, cb)
    {
        var started = clock.Now();
        if (!cb) cb = function(err) { return err; };
        if (outbuf.length > m_port.buffersize) throw "Outbuf too long: " + outbuf.length + " (max " + m_port.buffersize + ")";
        return this.port.write(outbuf, function(err)
        {
//        console.log(typeof outbuf);
            var outdesc = outbuf.length + ':"' + ((typeof outbuf === 'string')? outbuf: (outbuf.toString('utf8').substr(0, 20) + '...')).replace(/\n/g, "\\n") + '"';
            if (err) { console.log('write "%s" err '.red + err, outdesc); return cb(err); }
//    else console.log('results %d: "%s"'.green, results.length, results);
            console.log("wr %s ok after %d msec".green, outdesc, clock.Now() - started);
            this.drain(function(err)
            {
                if (err) { console.log('drain %s err '.red + err, outdesc); return cb(err); }
                console.log("drain %s completed after %d msec".green, outdesc, clock.Now() - started);
                return cb();
            }.bind(this));
        }.bind(this));
    }.bind(that);

    this.close = function()
    {
        var start = clock.Now();
        this.port.close(function(err)
        {
            if (err) console.log("close err: ".red + err);
            else console.log("'%s' closed after %d msec".green, opts.device, clock.Now() - start);
        });
    }.bind(that);
}
//inherits(HW.SerialPort, PortChannels); //http://stackoverflow.com/questions/8898399/node-js-inheriting-from-eventemitter
//enum:
HW.Serial.enum = function(cb)
{
    var start = clock.Now();
    SerialPort.list(function (err, ports)
    {
        if (err) console.log("ERR:".red, err);
        console.log("found %d ports after %s:", ports.length, clock.elapsed());
        ports.forEach(function(port)
        {
            console.log("found port:".blue, port.comName, port.manufacturer, port.pnpId);
        });
    });
}


var ChannelPool = require('my-projects/models/chpool-bk');
var model = require('my-projects/models/model-bk');
var Rect2D = model.Rect2D;

//ports, hw assignments:

var FTDI_y = new ChannelPool();
var FTDI_g = new ChannelPool();
var FTDI_b = new ChannelPool();
var FTDI_w = new ChannelPool();

HW.Serial.enum();
HW.Serial.assign(FTDI_y, { device: '/dev/ttyUSB0', baud: 242500, bits: '8N1', fps: 20 });
HW.Serial.assign(FTDI_g, { device: '/dev/ttyUSB1', baud: 242500, bits: '8N1', fps: 20 });
HW.Serial.assign(FTDI_b, { device: '/dev/ttyUSB2', baud: 242500, bits: '8N1', fps: 20 });
HW.Serial.assign(FTDI_w, { device: '/dev/ttyUSB3', baud: 242500, bits: '8N1', fps: 20 });

//props aka models, channel assignments:

//var test_strip = new Actor(); //{immediate: true});
var test_strip = new Rect2D({w: 10, h: 1, type: RenXt.WS2811(RenXt.SERIES), port: FTDI_y});
var Rect16x16 = new Rect2D({w: 16, h: 16, type: RenXt.WS2811(RenXt.SERIES), port: FTDI_y});
var placeholder1 = new Rect2D({port: FTDI_y});
var GdoorL = new Rect2D({w: 24, h: 16, type: RenXt.WS2811(RenXt.SERIES), port: FTDI_y});
var GdoorR = new Rect2D({w: 24, h: 16, type: RenXt.WS2811(RenXt.SERIES), port: FTDI_y});
var Gdoor = new Rect2D({w: 48, h: 16, stch: GdoorL.stch, type: RenXt.WS2811(RenXt.SERIES), port: FTDI_y}); //overlay
var Cols = new Rect2D({w: 3, h: 50, type: RenXt.WS2811(RenXt.PARALLEL), port: FTDI_y});


//fx test:

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

/*
Rect16x16
    .fill(0)
    .wait(1500)
    .fade({first_color: 0, last_color: 0x00FFFF, interval: 1500})
    .fill(0)
    .wait(1000)
//    .chase({color: 0x00FF00, first_node: 0, last_node: 256,
    .block(function()
    {
        for (var n = 0; n < 256; ++n)
        {
            nodes[n] = 0x00FF00;
            wait(150);
        }
    })
    .fill(0x0F000F)
    .wait(1000)
    .loop();

//blinking eyes:
Gdoor
    .line({fromx: 0, fromy: 12, tox: 20, toy: 4, color: 0xFFFF00})
    .line({fromx: 0, fromy: 12, tox: 23, toy: 4, color: 0xFFFF00})
    .wait(2000)
    .setpal(0)
    .wait(100)
    .setpal(0xFFFF00)
    .wait(100)
    .setpal(0)
    .wait(100)
    .setpal(0xFFFF00)
    .wait(100)
    .loop();
*/

//console.log("handles", process._getActiveHandles());
//console.log("requests", process._getActiveRequests());

//eof
