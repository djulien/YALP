
'use strict';


/*
var fs = require('fs');
var abspath = require('my-plugins/utils/abspath');

//create a little Vixen2 test file just to satisfy loader:
var vix = fs.createWriteStream(abspath('../tmp/test.vix'), {flags: 'w'});
vix.write('<myseq>');
vix.write('  <Time>10000</Time>'); //duration, msec
vix.write('  <EventPeriodInMilliseconds>50</EventPeriodInMilliseconds>');
var chvals =
var base64 = new Buffer(chvals, 'base64'); //no.toString("ascii"); //http://stackoverflow.com/questions/14573001/nodejs-how-to-decode-base64-encoded-string-back-to-binary
vix.write('  <EventValues>' + base64 + '</EventValues>');
vix.write('  <Channels>');
vix.write('    <Channel enabled="True" output="1" color="FFFFFF">name</Channel>');
vix.write('  </Channels>');
vix.end('</myseq>');
*/

/*
var glob = require('glob');

//var seq = require(require.resolve(glob.sync("my-projects/songs/xmas/Amaz*")[0]));
var Sequence = require('my-projects/shared/my-custom').Sequence; //sequence'); //base class
var seq = new Sequence({auto_collect: false, folder: 'tmp', xuse_media_len: false, audio: false, xcues: true}); //{auto_collect: true, interval: 50, dedupe: true, cache: false, });
seq.addMedia('my-projects/songs/xmas/Amaz*'); //__dirname + '** / *.mp3')
*/


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


//require('my-projects/shared/my-custom.js');
var ChannelPool = require('my-projects/models/chpool');
var aport = new ChannelPool('a-port');

//generic model definitions:
var models = require('my-projects/models/model'); //generic models
var Rect2D = models.Rect2D;
var Strip1D = models.Strip1D;
var Single0D = models.Single0D;

//custom models:
//var IcicleSegment2D = require('my-projects/models/icicles');
//var Columns2D = require('my-projects/models/columns');

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

debugger;

var rect = aport.alloc(Rect2D, {name: 'rect', w: 10, h: 10, rgb: 'GRB', zinit: true});
console.log("rect nodes#1", rect.nodes);
//console.log("json", rect.json());
console.log("port render:", aport.render());
console.log();

for (var i = 0; i < rect.numpx; ++i) rect.pixel(i, rect.color((i << 16) | (i << 8) | i));
console.log("rect nodes#2", rect.nodes);
//console.log("json", rect.json());
console.log();

rect.fill(0x123456);
console.log("rect nodes#3", rect.nodes);
//console.log("json", rect.json());
console.log();

//debugger;
for (var y = 0; y < rect.opts.h; ++y)
    for (var x = 0; x < rect.opts.w; ++x)
        rect.pixel2D(x, y, 16 * x + y);
console.log("rect nodes#4: ", rect.nodes);
//console.log("json", rect.json());
console.log();

rect.json('["#123", "#456", "#789", "#abc", "#def"]');
console.log("rect nodes#5", rect.nodes);
//console.log("json", rect.json());
console.log();



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
