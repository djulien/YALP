//YALP object stream

'use strict'; //helps catch errors

var fs = require('fs');
var path = require('path');
//var objectstream = require('objectstream'); //https://www.npmjs.com/package/objectstream
var Concentrate = require('concentrate'); //https://github.com/deoxxa/concentrate
var Dissolve = require('dissolve'); //https://github.com/deoxxa/dissolve
var UInt32BEBuffer = require('my-plugins/streamers/uint32bebuf');

function abspath(relpath) { return relpath; } //fs.realpathSync(relpath); } //only works for existing files; //path.join(process.cwd(), relpath); } //TODO: is this needed?


module.exports = YalpStream;

function YalpStream(opts)
{
    if (!(this instanceof YalpStream)) return new YalpStream(opts)
    if (typeof opts !== 'object') opts = {filename: opts};

    var m_info = {latest: 0, frames: 0, totlen: 0};
//    var m_objstream = objectstream.createSerializeStream(fs.createWriteStream(abspath(opts.filename), {flags: 'w'}));
    var m_stream = null; //fs.createWriteStream(abspath(opts.filename), {flags: 'w'});

    this.write = function(bytes, timestamp)
    {
        if (!arguments.length) //eof
        {
            if (!m_stream) return 0;
//            bytes = new /*Array*/Buffer(m_info); //Uint8Array(m_info);
            bytes = new UInt32BEBuffer(3);
            bytes.val(0, m_info.latest);
            bytes.val(1, m_info.frames);
            bytes.val(2, m_info.totlen);
//            console.log("bytes type ", typeof bytes);
            bytes = bytes.buf; //temp kludge for Buffer not inheritable
            return m_stream.end(fmt(-1 >>> 0, bytes));
        }
        if (!m_stream) m_stream = fs.createWriteStream(abspath(opts.filename), {flags: 'w'});
        if (typeof timestamp === 'undefined') timestamp = m_info.frames? m_info.latest + (opts.interval || 50): opts.start || 0;
        if (bytes instanceof UInt32BEBuffer) bytes = bytes.buf; //temp kludge for Buffer not inheritable
//        console.log("bytes type ", bytes);
//        if (!bytes.copy) console.log("no copy");
//        if (!bytes.length) console.log("no length");
        ++m_info.frames;
        m_info.totlen += bytes.byteLength + 2 * 4;
        m_info.latest = timestamp;
//        return m_stream.write({ time: timestamp, data: bytes, len: bytes.byteLength });
        return m_stream.write(fmt(timestamp, bytes));
    }

    this.playback = function()
    {
        m_stream = fs.createReadStream(abspath(opts.filename), {flags: 'r'});
        m_stream.read(
    }

    function fmt(timestamp, bytes)
    {
        var retval = Concentrate()./*uint32be(0x57414C50).*/string("YALP", "utf8").uint32be(timestamp).uint32be(bytes.byteLength).buffer(bytes).result();
//        console.log("fmt[%d]: %d", timestamp, retval.length, retval);
        return retval;
    }
}

//eof
