//YALP plug-in to stream sequenced data to hw output
'use strict';


var fs = require('fs');
var byline = require('byline');
var inherits = require('inherits');
var Now = require('my-plugins/utils/clock').Now;
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
//        console.log("seq data ack ", this_ss.name);
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
//    console.log("seqdata %s[%d] read: stopped? %d, eof? %d, count %d", this.name, this.index, this.stopped, this.eof, this.cues.length);
//if (this.name == "Capital C") { var x = null; x.whatever(); }
    for (;;) //skip ahead to next active cue
    {
        if (this.stopped) return; //this.push(null); //eof; DON'T SEND if stopped; next song in playlist might have started
        if (this.index >= this.cues.length) return this.push(null); //eof

//    var data = this.cues[this.index++]; //TODO: apply fx
        var chunk = this.render(this.cues[this.index++]);
        if (!chunk) continue;
        if (typeof chunk.at === 'undefined') throw "bad msg at"; //continue;
        if (!chunk.id) throw "missing msg id";
        if (!Buffer.isBuffer(chunk.data)) throw "bad/missing msg buf " + typeof chunk.data;

        chunk.at += this.starttime;
//        console.log('seqdata read[%d]: enque %s: ' + JSON.stringify(chunk), this.index - 1, this.name);
        this.push(chunk);
        break; //only queue up one frame at a time
    }
//    if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
//if (this.name == "Capital C") { var x = null; x.whatever(); }
};


//format info for easier viewing in node inspector:
SequenceStreamer.prototype.debug = function()
{
    if (!global.v8debug) return; //http://stackoverflow.com/questions/6889470/how-to-programmatically-detect-debug-mode-in-nodejs
    var sprintf = require('sprintf-js').sprintf;
    var buf = [];
    this.cues.forEach(function(cue, inx)
    {
//        console.log("cue[%d/%d] name '%s', from %d, to %d, text '%s'", inx, this.cues.length, cue.name, cue.from, cue.to, cue.text);
        buf.push(sprintf("%s[%d/%d]: name '%s', from %d, to %d, text '%s'", inx? ' ': '', inx, this.cues.length, cue.name, cue.from, cue.to, cue.text));
    }, this); //CAUTION: need to preserve context within forEach loop
    this.debug_cues = buf.join('\n');
    debugger; //https://nodejs.org/api/debugger.html
}


SequenceStreamer.prototype.addFixedFrames = function(interval)
{
//    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
    if (interval < 10) interval *= 1000; //assume caller gave sec; convert to msec
    if (interval < 10) throw "Interval too small: " + interval;
    for (var time = 0, frnum = 0; time < this.duration; time += interval, ++frnum)
        this.cues.push({name: "frames", from: time, to: Math.min(time + interval, this.duration), text: frnum, });
    this.cues_dirty = true;
    return this; //allow chaining
}


SequenceStreamer.prototype.addCue = function(opts) //name, from, to, text, src)
{
//    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
    if (!opts) opts = {};
    if (!opts.name) opts.name = 'ext';
    if ((opts.from && (opts.from < 100)) || (opts.to && (opts.to < 100))) //assume caller gave sec; convert to msec
    {
        if (opts.from) opts.from *= 1000;
        if (opts.to) opts.to *= 1000;
    }
    if (!opts.from) opts.from = 0;
    if (opts.from > this.duration) { console.log("past end: %s", linebuf); return; }
    if (this.back_trim && (this.back_trim.name == opts.name)) //fill in gap from previous entry
    {
        this.back_trim.to = opts.from;
        this.back_trim = null;
    }
    if (!opts.to) { opts.to = this.duration; this.back_trim = opts; } //set tentative end, but allow next entry to trim it
    if (opts.to < opts.from) { console.log("ends before starts: ", opts); return; }
    if (!opts.text) opts.text = '';
//    this.cues.push({from: from || 0, to: to || 9999 /*this.duration*/, text: text || '', src: src || null, name: section || 'ext', });
    this.cues.push(opts);
    this.cues_dirty = true;
//                        ++numcues;
    return this; //allow chaining
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
    return this; //allow chaining
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
    this.pend();
    var section = "timing", src = shortname(filename), linenum = 0, back_trim = null, numwarn = [0, 0];
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
                    section = matches[1]; //token;
                    back_trim = null;
//                        if (this_seq.cues[name]) console.log("dupl heading %s".yellow, name);
                }
                else if (matches = linebuf.match(/^\s*([\d.]+)(\s+([\d.]+))?(\s+(.+))?\s*$/)) //, 'from');
                {
//                        flush.apply(this_seq);
                    var from = Math.round(1000 * matches[1]); //token;
                    if (from > this_seq.duration) { if (!numwarn[0]++) console.log("%s:%d starts past end %d: %s", src, linenum, this_seq.duration / 1000, linebuf.replace(/\t+/g, ' ')); continue; }
                    if (back_trim) this_seq.cues[this_seq.cues.length - 1].to = from; back_trim = null; //fill in gap from previous entry
                    var to = matches[3]? Math.round(1000 * matches[3]): back_trim = this_seq.duration /*9999000*/; //'next'; //will be filled in by next entry; use junk value past end to preserve to >= from validation
                    if (matches[3] && (to < from)) { if (!numwarn[1]++) console.log("%s:%d ends %d before starts %d: %s", src, linenum, to / 1000, from / 1000, linebuf.replace(/\t+/g, ' ')); continue; }
                    var text = matches[5] || null;
//                        var cues = this_seq.cues[name] = this_seq.cues[name] || [];
//                        console.log("hd %s, from %d, to %d, text %s", section, from, to, text);
//                    this_seq.cues.push({from: from || 0, to: to || 9999 /*this_seq.duration*/, text: text || '', src: src || null, name: section || 'ext', });
                    this_seq.cues.push({name: section, from: from, to: to, text: matches[5] || '', src: src + ':' + linenum, });
//                    this_seq.addCue(section, from, to, text, src + ':' + linenum);
                    this_seq.cues_dirty = true;
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
//            console.log("%d cues from %s, dirty? %d", this_seq.cues.length, relpath(filename), this_seq.cues_dirty);
            if (Math.max(numwarn[0], numwarn[1]) > 1) console.log("(%d more warnings)", Math.max(numwarn[0] - 1, 0) + Math.max(numwarn[1] - 1, 0));
            this_seq.unpend(); //ing) this_seq.ready(); //emit('ready');
        })
        .on('error', function(err) { /*this_seq.unpend()*/; this_seq.error /*console.log*/("cues: not a file: %s: %s" + relpath(filename) + " " + err); });

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
    return this; //allow chaining
}

SequenceStreamer.prototype.seqstart = function()
{
    if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
    this.sortCues(); //in case any were added
    this.index = 0;
    this.starttime = Now();
//if (this.name == "Capital C") { var x = null; x.whatever(); }
    this.stopped = false;
//    console.log("seq data start[0] '%s' %d cues", this.name, this.cues.length);
//    debugger;
    this._read(); //start it flowing
//    if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
//    this.emit('frame_ready', this.cues[0]);
//    this.write(this.cues[0]);
}

SequenceStreamer.prototype.seqstop = function()
{
    this.stopped = true;
//    console.log("seq data stop[%d] %s", this.index, this.name);
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
    this.eof = (!arguments.length || (chunk === null)); //!chunk; //caller can restart flow by pushing more data
//    console.log("seqdata: push[%d] due %s", this.index, this.eof? '-': Now.asString(chunk.at), !this.eof? JSON.stringify(chunk): '(eof)');
//if (this.name == "Capital C") { var x = null; x.whatever(); }
    var this_ss = this;
    if (!this.eof) this.dest.emit('data-rcv', chunk, function() //recip can have multiple senders, so tell receiver how to reply
    {
        if (!this_ss.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
        this_ss.emit('data-ack');
    });
//if (this.name == "Capital C") { var x = null; x.whatever(); }
//    this.eof = !chunk; //caller can restart flow by pushing more data
//    if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
}


//eof
