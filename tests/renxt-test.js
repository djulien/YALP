'use strict';

var RenXt = require('my-plugins/hw/RenXt');
var inherits = require('inherits');

function ChannelPool()
{
    this.numch = 0;
    this.adrs = 0x01;
    this.alloc = function(opts)
    {
        var retval = {adrs: this.adrs++, startch: this.numch || opts.startch, numch: (opts.w || 1) * (opts.h || 1)};
        if (opts.startch) this.numch = Math.max(opts.startch, this.numch);
        this.numh += retval.numch;
        return retval;
    }
}
ChannelPool.prototype.Rect2D = function(opts)
{
    if (!(this instanceof ChannelPool.prototype.Rect2D)) return new ChannelPool.prototype.Rect2D(opts);
    if (!this.adrs) this.adrs = 0x01;
    if (!this.numch) this.numch = 0;

    return new fx();
}

var HW = {}; //namespace
HW.SerialPort = function(opts)
{
    if (!(this instanceof HW.SerialPort)) return new HW.SerialPort(opts);
    ChannelPool.call(this); //pass options to base class
//TODO: port stuff
}
inherits(HW.SerialPort, ChannelPool); //http://stackoverflow.com/questions/8898399/node-js-inheriting-from-eventemitter


function fx(opts)
{
}
fx.prototype.fill = function(opts)
{
    return this; //allow chain
}
fx.prototype.wait = function(opts)
{
    return this; //allow chain
}
fx.prototype.loop = function(opts)
{
    return this; //allow chain
}
fx.prototype.fade = function(opts)
{
    return this; //allow chain
}
fx.prototype.block = function(opts)
{
    return this; //allow chain
}
fx.prototype.line = function(opts)
{
    return this; //allow chain
}
fx.prototype.setpal = function(opts)
{
    return this; //allow chain
}


//ports:
var FTDI_yellow = new HW.SerialPort(
{
    device: '/dev/ttyUSB0',
    baud: 242500,
    dataBits: 8, parity: 'none', stopBits: 1,
    fps: 20,
    buffersize: Math.floor(.95 * this.baud / (1 + this.dataBits + this.stopBits) / this.fps),
    io: function(buf, cb) {},
});

//models:
var test_strip = FTDI_yellow.Rect2D({w: 10, h: 1, type: RenXt.WS2811(RenXt.SERIES)});
var Rect16x16 = FTDI_yellow.Rect2D({w: 16, h: 16, type: RenXt.WS2811(RenXt.SERIES)});
var placeholder1 = FTDI_yellow.Rect2D();
var GdoorL = FTDI_yellow.Rect2D({w: 24, h: 16, type: RenXt.WS2811(RenXt.SERIES)});
var GdoorR = FTDI_yellow.Rect2D({w: 24, h: 16, type: RenXt.WS2811(RenXt.SERIES)});
var Gdoor = FTDI_yellow.Rect2D({w: 48, h: 16, stch: GdoorL.stch, type: RenXt.WS2811(RenXt.SERIES)}); //overlay
var Cols = FTDI_yellow.Rect2D({w: 3, h: 50, type: RenXt.WS2811(RenXt.PARALLEL)});

//fx:
test_strip
    .fill(0xFF0000)
    .wait(1000)
    .fill(0x0000FF)
    .wait(1000)
    .loop();

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

//eof
