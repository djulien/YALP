#!/usr/local/bin/node
//read/write yalp stream from/to disk (cache)

'use strict'; //helps catch errors

var FILENAME = './tmp/stream1.yalp';

var Color = require('tinycolor2');
//Color.prototype.rgbaNumber = function() { return this.rgbNumber() << 8 | this.alpha(); }
Color.prototype.value = function() { return parseInt(this.toHex8(), 16); }

var str = new require('my-plugins/streamers/YalpStream')(FILENAME);
//str.write = function(buf, time) { if (!arguments.length) console.log("EOF"); else console.log("@%d: ", time, buf); }

function UInt32BEBuffer(len)
{
    var m_len = 4 * len;
    var retval = new Buffer(m_len);
    Object.defineProperties(this,
    {
        length: {get() { return m_len; }},
        buf: {get() { return retval; }},
    });
    this.val = function(inx, value)
    {
        return (arguments.length > 1)? retval.writeUIntBE(value, 4 * inx, 4): retval.readUInt32BE(4 * inx);
    }
    this.fill = function(value)
    {
        for (var ofs = 0; ofs < retval.length; ofs += 4) retval.writeUIntBE(value, ofs, 4);
    }
//NO-changes type    return retval;
/*
    this.reallen = 4 * len;
    this.val = function(inx, val)
    {
        return (arguments.length > 1)? buf.writeUInt32BE(val, 4 * inx): buf.readUInt32BE(4 * inx);
    }.bind(this);
    this.fill = function(val)
    {
        for (var ofs = 0; ofs < this.length; ofs += 4) buf.writeUInt32BE(val, ofs);
    }.bind(this);
*/
}
/*
require('inherits')(UInt32BEBuffer, Buffer);
UInt32BEBuffer.prototype.val = function(inx, value)
{
    return (arguments.length > 1)? this.writeUIntBE(value, 4 * inx, 4): this.readUInt32BE(4 * inx);
}
UInt32BEBuffer.prototype.fill = function(value)
{
    for (var ofs = 0; ofs < this.reallen; ofs += 4) this.writeUIntBE(value, ofs, 4);
}
*/


//var color = Color(); //{r: 255, g: 255, b: 255})
var buf = new /*Array*/UInt32BEBuffer(16); //UInt32Array(16);
console.log(JSON.stringify(buf));

//var uint32 = new Uint32Array(buf); //view onto buf; https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays
/*uint32.fill(Color().value());*/ buf.fill(0); str.write(buf.buf);
/*uint32[1] =*/ buf.val(1, Color([255, 0, 0]).value()); str.write(buf.buf, 1000);
/*uint32[2] =*/ buf.val(2, Color([0, 255, 0]).value()); str.write(buf.buf, 2000);
/*uint32[3] =*/ buf.val(3, Color([0, 0, 255]).value()); str.write(buf.buf, 3000);
buf.fill(Color('#FFA500').value()); str.write(buf.buf, 4000);
str.write();

//eof