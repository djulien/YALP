//fs.WriteStream with size limit

'use strict';

const detail = 80; //debug = false; //true;

const fs = require('fs');
const path = require('path');
const splitter = require('split');
const inherits = require('inherits');
const constants = require('constants');
//const stream = require('stream');
const buffer = require('buffer');
buffer.INSPECT_MAX_BYTES = 400;
//const Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
require('my-plugins/my-extensions/array-ends.js');
const logger = require('my-plugins/utils/logger');
const makenew = require('my-plugins/utils/makenew');

const CHUNK_LEN = 8 * 1024;


const MruFile = module.exports =
function MruFile(filepath, options)
{
    if (!(this instanceof MruFile)) return makenew(MruFile, arguments);
    var opts = (typeof options != 'object')? {encoding: options}: options || {}; //fs.WriteStream treats scalar option as encoding
//    this.objectMode = true;
    if (typeof opts.objectMode != 'undefined') opts.objectMode = true;
    if (typeof opts.flags == 'undefined') opts.flags = 'w';
    var max_bytes, max_lines, mrulen = 0;
    if (max_bytes = opts.bytes || 0) delete opts.bytes; //TODO: okay to pass custom params to base ctor?
    if (max_lines = opts.lines || 0) delete opts.lines; //TODO: okay to pass custom params to base ctor?
//    var buf = max_bytes? new Buffer(max_bytes), wrofs = 0;
    var buf = null, wrofs = 0;
    var lines = null, usedlen = 0;
    if (max_bytes || max_lines)
    {
        lines = [];
        buf = new Buffer(max_bytes? Math.min(max_bytes, CHUNK_LEN): CHUNK_LEN); //StreamBuffer();
        if (debug) buf.fill(0xee);
        if ((opts.flags || '').indexOf('a') != -1) //reload to preserve existing contents
            fs.createReadStream(filepath)
                .pipe(split()) //make each line a chunk
                .on('data', function(line) { this.write(line); }.bind(this)) //load tail of existing log into MRU buf
                .on('error', function(err) { this.end(); }.bind(this));
        opts.flags = (opts.flags || '').replace(/a/, 'w');
    }
//    var file = fs.createWriteStream(filename); //, { flags: opts.append? 'a': 'w', defaultEncoding: 'utf8', mode: 0o666 }););
//Writable options:
// highWaterMark Number Buffer level when write() starts returning false. Default=16kb, or 16 for objectMode streams
// decodeStrings Boolean Whether or not to decode strings into Buffers before passing them to _write(). Default=true
// objectMode Boolean Whether or not the write(anyObj) is a valid operation. If set you can write arbitrary data instead of only Buffer / String data. Default=false
//    fs.WriteStream.call(this, filepath, opts);
    this.fd = fs.openSync(filepath, 'w', constants.O_TRUNC | constants.O_CREAT | constants.O_RDWR); //0666
    console.log("opened " + this.fd);
    if (!max_bytes && !max_lines) return; //no MRU constraints to enforce
//    this.on('open', function onopen() { console.log("open"); });

    var timer;
//assumptions:
//- chunk to write is a line
//- chunk len <= max bytes; won't split a chunk
//- not many lines (inefficient joins); compensate by infrequently writing to disk
//TODO: keep highest priority items?
    this.write = this._write = function write_impl(chunk, encoding, callback)
    {
        if (!callback) callback = function(err, data) { return err || data; };
        if (debug) console.log("write " + chunk.length);
//        if (timer) clearTimeout(timer);
        while (lines.length && (max_lines && (lines.length >= max_lines)) || (max_bytes && (usedlen + chunk.length > max_bytes))) usedlen -= lines.shift().len; //make room
//        var stofs = lines.length? lines[0].ofs: 0, enofs = lines.length? lines.last.ofs + lines.last.len: 0;
//        buf.getContents(enofs - stofs);
        lines.push({ofs: wrofs, len: chunk.length}); //data: chunk});
        usedlen += chunk.length;
//        var needed_len = lines.reduce(function line_enum(oldlen, curent) { return oldlen + curent.len; });
        if (!max_bytes && (usedlen > buf.length)) //enlarge buf
        {
            var newbuf = new Buffer(Math.max(usedlen, buf.length + CHUNK_LEN));
            if (debug) newbuf.fill(0xee);
            buf.copy(newbuf, 0);
            buf = newbuf;
        }
        var partlen = Math.min(chunk.length, Math.max(buf.length - wrofs, 0)), wraplen = chunk.length - partlen;
        mrulen = Math.max(mrulen, wrofs + partlen);
        if (partlen) { copy(chunk, 0, encoding, buf, wrofs, partlen); wrofs += partlen; } //chunk.copy(buf, 0, wrofs, partlen);
        else lines.last.wrofs = 0;
        if (wraplen) { copy(chunk, partlen, encoding, buf, 0, wraplen); wrofs = wraplen; } //chunk.copy(buf, partlen, 0, chunk.length - partlen); //wrap
        if (!timer) timer = setTimeout(function delayed_write()
        {
            timer = null;
            if (debug) console.log("wr buf: first", JSON.stringify(lines.first), "last", JSON.stringify(lines.last), buf);
            if (!this.fd) throw "No fd";
//fs.writeSync(fd, buffer, offset, length[, position])
            if ((lines.last.ofs + lines.last.len) % mrulen < lines[0].ofs) //fill gap
            {
                if (debug) console.log("fill ", (lines.last.ofs + lines.last.len) % mrulen, "..", lines[0].ofs);
                buf.fill(0, (lines.last.ofs + lines.last.len) % mrulen, lines[0].ofs); //clear unused area instead of trying to trunc file
            }
            if (debug) console.log("wr1 ", lines[0].ofs, "..", mrulen, " -> ", 0);
            fs.writeSync(this.fd, buf, lines[0].ofs, mrulen - lines[0].ofs, 0); //, function wr_cb(err, bytes1)
//            {
//                if (err) return callback(err, bytes1);
//                else
            if (lines[0].ofs) //wrap
            {
                if (debug) console.log("wr2 ", 0, "..", lines[0].ofs, " -> ", mrulen - lines[0].ofs);
                fs.writeSync(this.fd, buf, 0, lines[0].ofs, mrulen - lines[0].ofs); //, function wr_cb(err, bytes2)
            }
//                {
//                    if (err) return callback(err, bytes2);
//                    else
            process.nextTick(function() { callback(null, mrulen); }); //bytes1 + bytes2);
//                }.bind(this));
//            }.bind(this));
        }.bind(this), 2000);
    }

    function copy(src, srcofs, enc, dest, destofs, len)
    {
        if (Buffer.isBuffer(src)) src.copy(dest, srcofs, destofs, len);
        else dest.write(src.substr(srcofs), destofs, len, enc);
    }
}
//inherits(MruFile, fs.WriteStream);

//    on('error', function() { self.destroy(); cb(); });

//eof
