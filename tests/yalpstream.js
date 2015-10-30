//#!/usr/local/bin/node
//read/write yalp stream from/to disk (cache)

'use strict'; //helps catch errors

var FILENAME = './tmp/stream1.yalp';

var Color = require('tinycolor2');
//Color.prototype.rgbaNumber = function() { return this.rgbNumber() << 8 | this.alpha(); }
//Color.prototype.value = function() { return parseInt(this.toHex8(), 16); }
var UInt32BEBuffer = require('my-plugins/streamers/uint32bebuf');
var svm = Color.prototype.toValue;
//Color.prototype.toValue = function() { var retval = svm(); console.log("color: %d", retval); return retval; }

var str = new require('my-plugins/streamers/YalpStream')(FILENAME);
//str.write = function(buf, time) { if (!arguments.length) console.log("EOF"); else console.log("@%d: ", time, buf); }

//var color = Color(); //{r: 255, g: 255, b: 255})
var buf = new /*Array*/UInt32BEBuffer(16); //UInt32Array(16);
//console.log(buf);
//console.log("colors: ", Color([255, 0, 0]).toValue(), Color('#FFA500').toValue());

//var uint32 = new Uint32Array(buf); //view onto buf; https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays
/*uint32.fill(Color().value());*/ buf.fill(0); str.write(buf);
/*uint32[1] =*/ buf.val(1, Color({r: 255, g: 0, b: 0}).toValue()); str.write(buf, 1000);
/*uint32[2] =*/ buf.val(1, 0); buf.val(2, Color({r: 0, g: 255, b: 0}).toValue()); str.write(buf, 2000);
/*uint32[3] =*/ buf.val(2, 0); buf.val(3, Color({r: 0, g: 0, b: 255}).toValue()); str.write(buf, 3000);
buf.fill(Color('#FFA500').toValue()); str.write(buf, 4000);
str.write(function(time)
{

}, 5000);
str.write();

str.playback();

//eof
