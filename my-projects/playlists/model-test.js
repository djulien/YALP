
'use strict';

var ChannelPool = require('my-projects/models/chpool');


var aport = new ChannelPool('aport');

/*
//then add hardware drivers and protocol handlers:
var serial = require('serialport'); //https://github.com/voodootikigod/node-serialport
var RenXt = require('my-plugins/hw/RenXt');

const FPS = 20; //target 50 msec frame rate
ChannelPool.all.forEach(function(chpool, inx)
{
    if (!chpool.device) return;
    chpool.port = new serial.SerialPort(chool.device, { baudrate: 242500, dataBits: 8, parity: 'none', stopBits: 1, buffersize: Math.floor(242500 / (1 + 8 + 2) / FPS) /-*2048*10*-/ }, false), //false => don't open immediately (default = true)
    RenXt.AddProtocol(chpool); //protocol handler
});
*/


//generic model definitions:
var models = require('my-projects/models/model'); //generic models
var Rect2D = models.Rect2D;
var Strip1D = models.Strip1D;
var Single0D = models.Single0D;

//custom models:
var IcicleSegment2D = require('my-projects/models/icicles');
var Columns2D = require('my-projects/models/columns');

/*
//show_group('col', [181, +23]);
var cols_LMRH = yport.alloc(Columns2D, {name: 'cols-LMRH', /-*w: 42, h: 51, numnodes: 3 * 80,*-/ rgb: 'GRB', zinit: false, vix2ch: [181, +23], noop: [181, 182, 189, 197, 198]});
//show_group('colL', [181, +7]);
//var colL = yport.alloc(Strip1D, {name: 'colL', w: 6, zinit: false, adrs: cols_, startch: cols_LMR.startch}); //, vix2ch: [183, +5], top: 183, bottom: 188}); //overlay
//show_group('colM', [189, +7]);
//var colM = yport.alloc(Strip1D, {name: 'colM', w: 7, zinit: false, startch: cols_LMR.startchvix2ch: [190, +6], top: 190, bottom: 196});
//show_group('colR', [197, +7]);
//var colR = yport.alloc(Strip1D, {name: 'colR', w: 6, zinit: false, vix2ch: [199, +5], top: 199, bottom: 204});

//show_group('ic', [2, +13]);
var ic1 = yport.alloc(IcicleSegment2D, {name: 'ic1', w: 33, h: 10, zinit: false});
var ic2 = yport.alloc(IcicleSegment2D, {name: 'ic2', w: 30, h: 10, zinit: false});
var ic3 = yport.alloc(IcicleSegment2D, {name: 'ic3', w: 30, h: 10, zinit: false});
var ic4 = yport.alloc(IcicleSegment2D, {name: 'ic4', w: 24+8, h: 10, zinit: false});
var ic5 = yport.alloc(IcicleSegment2D, {name: 'ic5', w: 34, h: 10, zinit: false});
var icbig = yport.alloc(IcicleSegment2D, {name: 'icbig', w: 15+33, h:10, zinit: false});
var ic_all = noport.alloc(IcicleSegment2D.all, {name: 'ic-all', w: 207, h: 10, zinit: false, vix2ch: [2, +13]});
ic_all.vix2render = function() {} //TODO
*/


var rect = aport.alloc(Rect2D, {name: 'rect', w: 10, h: 10, rgb: 'GRB', zinit: true});
console.log("rect nodes#1", rect.nodes);

for (var i = 0; i < rect.numpx; ++i) rect.pixel(i, Color(
console.log("rect nodes#2", rect.nodes);

rect.fill(
console.log("rect nodes#3", rect.nodes);


//var numext = [0, 0];
ChannelPool.all.forEach(function(chpool)
{
    var buf = "";
    chpool.models.forEach(function(model, inx, all) { buf += ", " + model.name; });
    console.log("ch pool '%s' has %s channels, %s models:", chpool.name, chpool.numch, chpool.models.length, buf.slice(2));
});
//console.log("Vixen2 ch map: extended %d/%d models".yellow, numext[0], numext[1]);

//console.log("handles", process._getActiveHandles());


//eof