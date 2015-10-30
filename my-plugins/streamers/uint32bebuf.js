//UInt32BE view onto Buffer

'use strict'; //helps catch errors

module.exports = UInt32BEBuffer; //commonjs


function UInt32BEBuffer(len)
{
    if (!(this instanceof UInt32BEBuffer)) return new UInt32BEBuffer(len);
//    var m_len = 4 * len;
    var retval = new Buffer(4 * len); //NOTE: Buffer inheritance no worky in Node 4.x, so just use a member var for now

    Object.defineProperties(this,
    {
//        length: {get() { return m_len; }},
        buf: {get() { return retval; }},
    });
    this.val = function(inx, value)
    {
//    console.log("be32 wr val %d, ofs %d", value, 4 * inx);
        return (arguments.length > 1)? retval.writeUIntBE(value, 4 * inx, 4): retval.readUInt32BE(4 * inx);
    }
    this.fill = function(value)
    {
//console.log("be32 fill to len %d", retval.length);
        for (var ofs = 0; ofs < retval.length; ofs += 4) retval.writeUIntBE(value, ofs, 4);
    }
    this.inspect = function(depth)
    {
        console.log("insp", retval.inspect(depth));
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
        for (var ofs = 0; ofs < m_len; ofs += 4) buf.writeUInt32BE(val, ofs);
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


//eof
