'use strict';

var int24 = require('int24');

module.exports = bufdiff;

function bufdiff(buf1, buf2)
{
    var cmp = (buf1? buf1.length: 0) - (buf2? buf2.byteLength: 0);
    if (cmp < 0) return cmp - buf1.length; //force retval > buflen
    if (cmp > 0) return cmp + buf2.length;
    var taillen = buf1? buf1.length % 4: 0, cmplen = buf1? buf1.length - taillen: 0;
    for (var ofs = 0; ofs < /*buf1.length*/ cmplen; ofs += 4)
    {
        cmp = buf1.readUInt32BE(ofs) - buf2.readUInt32BE(ofs);
        if (cmp < 0) return -ofs - 1; //kludge: avoid 0 value; still < buflen
        if (cmp > 0) return +ofs + 1;
    }
//    if (taillen) debugger;
//    if (taillen) console.log("bufdiff(%d, %d) ofs %d, tail %d", buf1.length, buf2.length, ofs, taillen);
//NOTE: exc is throw on buf overflow in read() functions, but not with direct [] indexing so check it here:
    switch (taillen)
    {
        case 0: return 0;
        case 1: return buf1.readUInt8(ofs) - buf2.readUInt8(ofs);
        case 2: return buf1.readUInt16BE(ofs) - buf2.readUInt16BE(ofs);
        case 3: return int24.readUInt24BE(buf1, ofs) - int24.readUInt24BE(buf2, ofs);
    }
}


//eof
