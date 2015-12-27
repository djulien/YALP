//fs.WriteStream with size limit

'use strict';

const fs = require('fs');
const path = require('path');
const splitter = require('split');
//const stream = require('stream');
//const Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
const makenew = require('my-plugins/utils/makenew');


module.exports =
function MruFile(filepath, options)
{
    if (!(this instanceof MruFile)) return makenew(MruFile, arguments);
    var opts = (typeof options != 'object')? {encoding: options}: options || {}; //fs.WriteStream treats scalar option as encoding
//    this.objectMode = true;
    if (typeof opts.objectMode != 'undefined') opts.objectMode = true;
    var max_bytes, max_lines;
    if (max_bytes = opts.bytes || 0) delete opts.bytes; //TODO: okay to pass custom params to base ctor?
    if (max_lines = opts.lines || 0) delete opts.lines; //TODO: okay to pass custom params to base ctor?
//    var buf = max_bytes? new Buffer(max_bytes), wrofs = 0;
    var buf = new StreamBuffer(), wrofs = 0;
    var lines = max_lines? []: null, total_len = 0;
    if ((max_bytes || max_lines) && ((opts.flags || '').indexOf('a') != -1)) //apply MRU to existing contents
    {
        fs.createReadStream(filepath)
            .pipe(split()) //make each line a chunk
            .on('data', function(line) { this.write(line); }.bind(this)) //load tail of existing log into MRU buf
            .on('error', function(err) { this.end(); }.bind(this));
        });
        opts.flags = opts.flags.replace(/a/, 'w');
    }
//    var file = fs.createWriteStream(filename); //, { flags: opts.append? 'a': 'w', defaultEncoding: 'utf8', mode: 0o666 }););
//Writable options:
// highWaterMark Number Buffer level when write() starts returning false. Default=16kb, or 16 for objectMode streams
// decodeStrings Boolean Whether or not to decode strings into Buffers before passing them to _write(). Default=true
// objectMode Boolean Whether or not the write(anyObj) is a valid operation. If set you can write arbitrary data instead of only Buffer / String data. Default=false
    fs.WriteStream.apply(this, opts);
    if (!max_bytes && !max_lines) return; //no MRU constraints to enforce

    var timer;
//assumptions:
//- chunk to write is a line
//- chunk len <= max bytes; won't split a chunk
//- not many lines (inefficient joins); compensate by infrequently writing to disk
//TODO: keep highest priority items?
    this._write = function write_impl(chunk, encoding, callback)
    {
//        if (timer) clearTimeout(timer);
        while ((lines.length >= max_lines) || (total_len + chunk.len > max_bytes)) total_len -= lines.shift().len; //make room
        lines.push({len: chunk.length, data: chunk}); //ofs: ??});
        if (!timer) timer = setTimeout(function delayed_write()
        {
            fs.write(this.fd, buf, 0, wrofs, 0, function wr_cb(err, bytes)
            {
                if (err) {
      self.destroy();
      return cb(er);
    }
    self.bytesWritten += bytes;
    cb();
  });

        }, 2000);
    }
}

//eof
