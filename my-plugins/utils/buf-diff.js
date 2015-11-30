'use strict';
//compare a buffer to another buffer or all 0s

var int24 = require('int24'); //add support for 3-byte values

module.exports = bufdiff;

//compare 2 buffers:
//buf1 < buf2 returns -ofs - 1 where first different or < -buf1.length if length was shorter
//buf1 == buf2 for length and contents returns 0
//buf1 > buf2 returns ofs + 1 where first different or buf2.length is length was longer
//non-buffers will be treated as 0-length
//to compare 1 buffer to 0s, pass null as second buffer
//optional reverse-compare flag
function bufdiff(buf1, buf2, rev)
{
    if (!Buffer.isBuffer(buf1)) buf1 = {length: 0};
    if (buf2 !== null)
    {
        if (!Buffer.isBuffer(buf2)) buf2 = {length: 0};
        var cmp =  buf1.length - buf2.length;
        if (cmp < 0) return cmp - buf1.length; //force retval > buflen
        if (cmp > 0) return cmp + buf2.length;
    }
    var taillen = buf1.length % 4, cmplen = buf1.length - taillen; //NOTE: buf1.length == buf2.length here (unless buf2 === null)
    if (!rev) //forward compare
        for (var ofs = 0; ofs < /*buf1.length*/ cmplen; ofs += 4) //supposedly a lot faster doing 4 bytes at a time; there would at least be less loop overhead
        {
            cmp = buf1.readUInt32BE(ofs) - ((buf2 !== null)? buf2.readUInt32BE(ofs): 0);
            if (cmp < 0) return -ofs - 1; //kludge: avoid 0 value; still < buflen
            if (cmp > 0) return +ofs + 1;
        }
//    if (taillen) debugger;
//    if (taillen) console.log("bufdiff(%d, %d) ofs %d, tail %d", buf1.length, buf2.length, ofs, taillen);
//NOTE: exc is thrown on buf overflow in read() functions, but not with direct [] indexing; need to check taillen here:
    switch (taillen)
    {
        case 0: cmp = 0; break;
        case 1: cmp = buf1.readUInt8(ofs) - ((buf2 !== null)? buf2.readUInt8(ofs): 0); break;
        case 2: cmp = buf1.readUInt16BE(ofs) - ((buf2 !== null)? buf2.readUInt16BE(ofs): 0); break;
        case 3: cmp = int24.readUInt24BE(buf1, ofs) - ((buf2 !== null)? int24.readUInt24BE(buf2, ofs): 0); break;
    }
    if (cmp < 0) return -cmplen - 1; //kludge: avoid 0 value; still < buflen
    if (cmp > 0) return +cmplen + 1;
    if (rev) //reverse compare
        for (var ofs = cmplen - 4; ofs >= 0; ofs -= 4) //supposedly a lot faster doing 4 bytes at a time; there would at least be less loop overhead
        {
            cmp = buf1.readUInt32BE(ofs) - ((buf2 !== null)? buf2.readUInt32BE(ofs): 0);
            if (cmp < 0) return -ofs - 1; //kludge: avoid 0 value; still < buflen
            if (cmp > 0) return +ofs + 1;
        }
    return 0;
}

bufdiff.reverse = function(buf1, buf2) { return bufdiff(buf1, buf2, true); } //alternate name


//eof
