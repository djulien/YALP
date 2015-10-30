//YALP object stream

'use strict'; //helps catch errors

var fs = require('fs');
var path = require('path');
//var objectstream = require('objectstream'); //https://www.npmjs.com/package/objectstream
var Concentrate = require('concentrate'); //https://github.com/deoxxa/concentrate
function abspath(relpath) { return relpath; } //fs.realpathSync(relpath); } //only works for existing files; //path.join(process.cwd(), relpath); } //TODO: is this needed?

module.exports = YalpStream;

function YalpStream(opts)
{
    if (!(this instanceof YalpStream)) return new YalpStream(opts)
    if (typeof opts !== 'object') opts = {filename: opts};

    var m_info = {latest: 0, frames: 0, totlen: 0};
//    var m_objstream = objectstream.createSerializeStream(fs.createWriteStream(abspath(opts.filename), {flags: 'w'}));
    var m_stream = fs.createWriteStream(abspath(opts.filename), {flags: 'w'});

    this.write = function(bytes, timestamp)
    {
        if (!arguments.length) //eof
        {
//            bytes = new /*Array*/Buffer(m_info); //Uint8Array(m_info);
            bytes = new Buffer(4 + 4 + 4);
            bytes.writeUIntBE(m_info.latest, 0, 4);
            bytes.writeUIntBE(m_info.frames, 4, 4);
            bytes.writeUIntBE(m_info.totlen, 8, 4);
            console.log("bytes type ", typeof bytes);
            return m_stream.end(fmt(-1, bytes));
        }
        if (typeof timestamp === 'undefined') timestamp = m_info.frames? m_info.latest + (opts.interval || 50): opts.start || 0;
        console.log("bytes type ", bytes);
        if (!bytes.copy) console.log("no copy");
        if (!bytes.length) console.log("no length");
        ++m_info.frames;
        m_info.totlen += bytes.byteLength + 2 * 4;
        m_info.latest = timestamp;
//        return m_stream.write({ time: timestamp, data: bytes, len: bytes.byteLength });
        return m_stream.write(fmt(timestamp, bytes));
    }

    function fmt(timestamp, bytes)
    {
        return Concentrate().uint32be(0x4a19).uint32be(timestamp).uint32be(bytes.byteLength).buffer(bytes).result();
    }
}

//eof