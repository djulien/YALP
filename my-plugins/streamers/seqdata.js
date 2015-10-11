//YALP plug-in to stream sequenced data to hw output
'use strict';


var fs = require('fs');
var byline = require('byline');
var inherits = require('inherits');
//var Tokenizer = require('tokenizer');
//require('buffertools').extend(); //https://github.com/bnoordhuis/node-buffertools
//var elapsed = require('my-plugins/utils/elapsed');
var relpath = require('my-plugins/utils/relpath');
var shortname = require('my-plugins/utils/shortname');


module.exports = SequenceStreamer;


//http://www.sandersdenardi.com/readable-writable-transform-streams-node/
//var baseclass = require('stream').Readable;
//can't get streaming to work; just use events instead
var baseclass = require('events').EventEmitter;

function SequenceStreamer(opts)
{
    if (!(this instanceof SequenceStreamer)) return new SequenceStreamer(opts); //make "new" optional; make sure "this" is set
    baseclass.call(this, Object.assign(opts || {}, {objectMode: true, })); //pass options to base class; allow binary data

//    this.data = data;
//    this.curIndex = 0;
    this.cues = [];
//    this.index = 0;
//    this.dirty = false;
    this.isstreamer = true;
    var this_ss = this;
    this.on('data-ack', function()
    {
        if (!this_ss.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
//if (this.name == "Capital C") { var x = null; x.whatever(); }
        if (!this_ss.eof) this_ss._read.apply(this_ss); //keep it flowing
//if (this.name == "Capital C") { var x = null; x.whatever(); }
    });
};
inherits(SequenceStreamer, baseclass);


//seems like "non-flowing" mode is more appropriate here - that will avoid large unnecessary memory consumption
//this will also allow a couple of frames at a time to be generated on demand without spiking the cpu
SequenceStreamer.prototype._read = function()
{
    if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
//if (this.index > 4) this.stopped = true;
    console.log("seqdata %s[%d] read: stopped? %d, count %d", this.name, this.index, this.stopped, this.cues.length);
//if (this.name == "Capital C") { var x = null; x.whatever(); }
    if (this.stopped || (this.index >= this.cues.length)) return this.push(null); //eof

    var data = this.cues[this.index++];
//TODO: apply fx
    console.log('seqdata read[%d]: enque %s: ' + JSON.stringify(data.from), this.index - 1, this.name);
    this.push(data.from);
//    if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
//if (this.name == "Capital C") { var x = null; x.whatever(); }
};


SequenceStreamer.prototype.addCue = function(section, from, to, text, src)
{
//    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
    this.cues.push({from: from || 0, to: to || 9999 /*this.duration*/, text: text || '', src: src || null, section: section || 'ext', });
    this.cues_dirty = true;
//                        ++numcues;
}


SequenceStreamer.prototype.sortCues = function()
{
//    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
    if (!this.cues_dirty) return;
    this.cues.sort(function(lhs, rhs) //sort by start time, give shorter fx higher priority
    {
        return Math.sign(lhs.from - rhs.from) || Math.sign(lhs.to - rhs.to);
    });
    this.cues_dirty = false;
}


SequenceStreamer.prototype.addCues = function(filename)
{
//    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
//        if (player.canPlay(filename)
//        seq.index = this.songs.length;
//        console.log("add cue %s".yellow, filename);
//        var fstat = fs.statSync(filename);
//        if (!fstat.isFile()) { console.log("not a file: %s".red, relpath(filename)); return; }
//        this.cues.push(filename);
    var section = "timing", src = shortname(filename), linenum = 0, back_trim = null;
    var this_seq = this;
//TODO: use cached values if file !changed
    var stream = byline(fs.createReadStream(filename))
        .on('readable', function()
        {
            for (;;)
            {
//                if (!this_seq.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
                var linebuf = stream.read();
                if (!linebuf) break;
                linebuf = linebuf.toString('utf8'); ++linenum;
//                    console.log(typeof linebuf, linebuf);
                var matches;
                if (matches = linebuf.match(/^#\s*(.+):?\s*$/)) //, 'heading');
                {
//                        if (this_seq.cues.length && (this_seq.cues[this_seq.cues.length - 1].to == 'next')
//                        flush.apply(this_seq);
                    name = matches[1]; //token;
                    back_trim = null;
//                        if (this_seq.cues[name]) console.log("dupl heading %s".yellow, name);
                }
                else if (matches = linebuf.match(/^\s*([\d.]+)(\s+([\d.]+))?(\s+(.+))?\s*$/)) //, 'from');
                {
//                        flush.apply(this_seq);
                    var from = Math.round(1000 * matches[1]); //token;
                    if (back_trim) this_seq.cues[this_seq.cues.length - 1].to = from; back_trim = null; //fill in gap from previous entry
                    var to = Math.min(from, matches[3]? Math.round(1000 * matches[3]): back_trim = this_seq.duration); //'next'; //will be filled in later
                    var text = matches[5] || null;
//                        var cues = this_seq.cues[name] = this_seq.cues[name] || [];
//                        console.log("hd %s, from %d, to %d, text %s", section, from, to, text);
                    this_seq.addCue(section, from, to, text, src + ':' + linenum);
                }
                else console.log("junk cue line ignored in %s:%d: %s".yellow, src, linenum, linebuf);
            }
        })
/*
    var tkz = new Tokenizer(); //mycallback
//regex https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp
    tkz.addRule(/^(?:#\s*)\S+(?:\s*)$/, 'heading');
    tkz.addRule(/^(?:\s*)[\d.]+/, 'from');
    tkz.addRule(/^[\d.]+/, 'to');
    tkz.addRule(/\S+(?:\s*)$/, 'text');
    fs.createReadStream(filename)
        .pipe(tkz)
        .on('token', function(token, type)
        {
            if (!this_seq.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
            switch (type)
            {
                case 'heading':
                    flush.apply(this_seq);
                    name = token;
                    if (this_seq.cues[name]) console.log("dupl heading %s".yellow, name);
                    break;
                case 'from':
                    flush.apply(this_seq);
                    from = 1 * token;
                    break;
                case 'to':
                    to = 1 * token;
                    break;
                case 'text':
                    flush.apply(this_seq);
                    console.log("ignoring junk: '%s'".red, token);
                    break;
                default:
                    throw "Unhandled token '" + type + "'";
            }
        })
*/
        .on('end', function()
        {
//                flush();
            if (!this_seq.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
            console.log("%d cues from %s, dirty? %d", this_seq.cues.length, relpath(filename), this_seq.cues_dirty);
        })
        .on('error', function(err) { console.log("not a file: %s: %s".red, relpath(filename), err); });

//        function flush()
//        {
//            if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
//            if (!from) return;
//            var cues = this.cues[name] = this.cues[name] || [];
//            console.log("hd %s, from %d, to %d", name, from, to || 'next');
//            cues.push({from: from, to: to || 'next', src: src + ':' + line});
//            from = to = null;
//            ++numcues;
//        }
}

SequenceStreamer.prototype.seqstart = function()
{
    if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
    this.sortCues();
    this.index = 0;
//if (this.name == "Capital C") { var x = null; x.whatever(); }
    this.stopped = false;
    console.log("seq data start[0] %s %d cues", this.name, this.cues.length);
    this._read(); //start it flowing
//    if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
//    this.emit('frame_ready', this.cues[0]);
//    this.write(this.cues[0]);
}

SequenceStreamer.prototype.seqstop = function()
{
    this.stopped = true;
    console.log("seq data stop[%d] %s", this.index, this.name);
}


//kludge: implement rudimentary pipe for more precise control
SequenceStreamer.prototype.pipe = function(dest)
{
    if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
    this.dest = dest;
//    if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
}
SequenceStreamer.prototype.unpipe = function()
{
    this.dest = null;
}
SequenceStreamer.prototype.push = function(chunk)
{
    if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
    console.log("seqdata: push[%d] ", this.index, chunk? JSON.stringify(chunk): '(eof)');
//if (this.name == "Capital C") { var x = null; x.whatever(); }
    var this_ss = this;
    if (chunk) this.dest.emit('data-rcv', chunk, function()
    {
        if (!this_ss.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
        this_ss.emit('data-ack'); //can have multiple senders, so tell receiver where to send reply
    });
//if (this.name == "Capital C") { var x = null; x.whatever(); }
    this.eof = !chunk; //caller can restart flow by pushing more data
//    if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
}


//eof
