'use strict';

module.exports = bufdiff;

function bufdiff(buf1, buf2)
{
    var cmp = buf1.byteLength - buf2.byteLength;
    if (cmp < 0) return cmp - buf1.byteLength;
    if (cmp > 0) return cmp + buf2.byteLength;
    for (var ofs = 0; ofs < buf1.byteLength; ofs += 4)
    {
        cmp = buf1.readUInt32BE(ofs) - buf2.readUInt32BE(ofs);
        if (cmp < 0) return -ofs;
        if (cmp > 0) return +ofs;
    }
    return 0;
}


//eof
