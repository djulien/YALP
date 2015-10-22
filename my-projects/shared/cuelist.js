//YALP sequence cue list
//cues are timing marks to sync effects with audio
//cues trigger fx rendering
//cues can be generated or rendered on demand, but normally for production playback they would be pre-rendered + cached
'use strict';


var fs = require('fs');
var byline = require('byline');
var inherits = require('inherits');
var NodeCache = require( "node-cache" );
//var Tokenizer = require('tokenizer');
//require('buffertools').extend(); //https://github.com/bnoordhuis/node-buffertools
//var elapsed = require('my-plugins/utils/elapsed');
var relpath = require('my-plugins/utils/relpath');
var shortname = require('my-plugins/utils/shortname');
var Now = require('my-plugins/utils/clock').Now;


module.exports = CueList;

//http://www.sandersdenardi.com/readable-writable-transform-streams-node/
//var baseclass = require('stream').Readable;
//can't get streaming to work; just use events instead
//var baseclass = require('events').EventEmitter;
var baseclass = require('my-plugins/utils/my-eventemitter2').EventEmitter2; //eventemitter2').EventEmitter2; //https://github.com/asyncly/EventEmitter2
var inherits = require('inherits');

//options: auto_load, silent, cache (true/false/duration)
function CueList(opts)
{
    if (!(this instanceof CueList)) return new CueList(opts); //make "new" optional; make sure "this" is set
    baseclass.call(this); //, Object.assign(opts || {}, {objectMode: true, })); //pass options to base class; allow binary data

    this.cues = [];
//    this.dirty = false;
    this.isCueList = true;
//    this.selected = undefined; //0
    this.elapsed = new elapsed(); //used for load/init time tracking until first playback
//    var stack = callsite();
//NO    this.path = module.parent.parent.filename; //parent = sequence baseclass, grandparent = sequence instance
//    stack.forEach(function(site, inx){ console.log('stk[%d]: %s@%s:%d'.blue, inx, site.getFunctionName() || 'anonymous', relpath(site.getFileName()), site.getLineNumber()); });
//NOTE: can't use module.parent because it will be the same for all callers (due to module caching)
    this.path = caller(2); //stack[(stack[1].getFileName() == __filename)? 3: 2].getFileName(); //skip past optional nested "new" above
    debugger;
//    this.outhw = new Outhw();
    this.setMaxListeners(4); //catch leaks sooner (EventEmitter)
    if (opts.silent !== false) this.emit = this.emit_logged.bind(this);

    this.cache = (opts.cache !== false)?
        new NodeCache({stdTTL: opts.cache || 6 * 60 * 60, checkPeriod: 600, }): //default 6 hours, TODO: delete period?
        {
            get: function(key) { return undefined; }, //dummy functions
            set: function(key, value) {},
            del: function(key) {},
        };
    if ((opts.silent !== false) && (opts.cache !== false))
    {
        var oldget = this.cache.get, oldset = this.cache.set;
        this.cache.get = function(key)
        {
            var hit = oldget(key);
            this.emit((typeof hit !== 'undefined')? 'cache.hit': 'cache.miss', key);
            return hit;
        }.bind(this.cache);
        this.cache.set = function(key, value, ttl)
        {
            var ok = oldset.apply(this.cache, arguments);
            this.emit(ok? 'cache.save': 'error', key);
            return ok;
        }.bind(this.cache);
    }

//NOTE: speed only alters the start/end times of cues, doesn't affect actual cuelist streaming
    require('./mixins/speed')(this, function(newval)
    {
        if (newval != 1.0) throw "TODO: speed";
        this.cues.forEach(function(cue, inx) { cue.from *= newval; cue.to *= newval; }); //TODO: sync
    }.bind(this));
    require('./mixins/promise-keepers')(this, 5000);

    this.on('cmd', function(cmd, opts) //kludge: async listener function to avoid recursion in multi-song play loop
    {
        if (!this.isPlaylist) throw "wrong 'this'"; //paranoid/sanity context check
//        console.log("playlist in-stream: cmd %s, opts %s".yellow, cmd, JSON.stringify(opts));
        switch (cmd || '')
        {
//enforce event emitter interface by using private functions:
            case "play": play.apply(this, Array.prototype.slice.call(arguments, 1)); return;
            case "pause": pause.call(this, opts); return;
            case "resume": resume.call(this, opts); return;
//            case "next": next.apply(this, opts); return;
            case "stop": stop.call(this, opts); return;
//            case "volume": this.volume(opts); return;
            case "speed": this.speed = opts; return;
            default: this.warn("Unknown command: '%s'", cmd || '');
        }
    }.bind(this));

//NOTE: at least one set of cues must be added by any of the ways below in order for cuelist to be marked ready; a cuelist without any cues is useless anyway
    if (opts.auto_collect !== false)
    {
        glob(path.join(path.dirname(this.path), "**", "{timing,cues}!(*-bk)"), function(err, files)
        {
            if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
            this.warn("Cuelist auto-collect found %d candidate seq file%s", files.length, (files.length != 1)? 's': '');
            (files || []).forEach(function(file, inx) { this.addCues(file); }.bind(this)); //CAUTION: need to preserve context within forEach loop
        }.bind(this)); //CAUTION: need to preserve context within glob callback
        glob(path.join(path.dirname(this.path), "**", "!(*-bk).vix"), function(err, files)
        {
            if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
            this.warn("Cuelist auto-collect found %d Vixen seq file%s", files.length, (files.length != 1)? 's': '');
            (files || []).forEach(function(file, inx) { this.addVixen(file); }.bind(this)); //CAUTION: need to preserve context within forEach loop
        }.bind(this)); //CAUTION: need to preserve context within glob callback
        glob(path.join(path.dirname(this.path), "**", "!(*-bk).{xseq,fseq}"), function(err, files)
        {
            if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
            this.warn("Cuelist auto-collect found %d xLights seq file%s", files.length, (files.length != 1)? 's': '');
            (files || []).forEach(function(file, inx) { this.addxLights(file); }.bind(this)); //CAUTION: need to preserve context within forEach loop
        }.bind(this)); //CAUTION: need to preserve context within glob callback
    }
    process.nextTick(function() //allow caller to add cues or make other changes after ctor returns but before cuelist is marked ready
    {
        if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
        (this.cues || []).forEach(function(file, inx) { this.addCues(file); }.bind(this)); //CAUTION: need to preserve context within forEach loop
//        if (this.schedule) console.log("TODO: Schedule not yet implemented (found %d items)".red, this.schedule.length);
    }.bind(this));
};
inherits(CueList, baseclass);


//format info for easier viewing in node inspector:
CueList.prototype.debug = function()
{
    if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
    if (!global.v8debug) return; //http://stackoverflow.com/questions/6889470/how-to-programmatically-detect-debug-mode-in-nodejs
    var sprintf = require('sprintf-js').sprintf;
    var buf = ['cuelist info:'];
    this.cues.forEach(function(cue, inx)
    {
        if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
        buf.push(sprintf("cue [%d/%d]: name '%s', from %d, to %d, text '%s'", inx, this.cues.length, cue.name || '??', cue.from || 0, cue.to || 0, cue.text || '??'));
    }.bind(this)); //CAUTION: need to preserve context within forEach loop
    this.debug_cues = buf.join('\n');
    debugger; //https://nodejs.org/api/debugger.html
}


CueList.prototype.addVixen(filename)
{
    if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
}


//    this.getFrame = function(frnum) //NOTE: this must be overridden by instance; dummy logic supplied here
//    {
//        var buf = new Buffer(16); //simulate 16 channels
//        buf.clear(frnum);
//        return {frnum: frnum || 1, when: 50 * frnum, data: buf, len: buf.length, };
//    }


CueList.prototype.addFixedFrames = function(interval)
{
    if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
    if (interval < 10) interval *= 1000; //assume caller gave sec; convert to msec
    if (interval < 10) throw "Interval too small: " + interval;
    for (var time = 0, frnum = 0; time < this.duration; time += interval, ++frnum)
        this.cues.push({name: "frames", from: time, to: Math.min(time + interval, this.duration), text: frnum, });
    this.cues_dirty = true;
    return this; //allow chaining
}


SequenceStreamer.prototype.addCue = function(opts) //name, from, to, text, src)
{
    if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
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
    return this; //allow chaining
}


SequenceStreamer.prototype.addCues = function(filename)
{
    if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
//        if (player.canPlay(filename)
//        seq.index = this.songs.length;
//        console.log("add cue %s".yellow, filename);
//        var fstat = fs.statSync(filename);
//        if (!fstat.isFile()) { console.log("not a file: %s".red, relpath(filename)); return; }
//        this.cues.push(filename);
    if (typeof filename.length !== 'undefined')
    {
        filename.forEach(function(cue, inx) { this.addCue(cue); }.bind(this));
        return this; //allow chaining
    }
    this.pend();
    var section = "timing", src = shortname(filename), linenum = 0, back_trim = null, numwarn = [0, 0];
//    var this_seq = this;
//TODO: use cached values if file !changed
    var stream = byline(fs.createReadStream(filename))
        .on('readable', function()
        {
            for (;;)
            {
//                if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
                var linebuf = stream.read();
                if (!linebuf) break;
                linebuf = linebuf.toString('utf8'); ++linenum;
//                    console.log(typeof linebuf, linebuf);
                var matches;
                if (matches = linebuf.match(/^#\s*(.+):?\s*$/)) //, 'heading');
                {
//                        if (this.cues.length && (this.cues[this.cues.length - 1].to == 'next')
//                        flush.apply(this);
                    section = matches[1]; //token;
                    back_trim = null;
//                        if (this.cues[name]) console.log("dupl heading %s".yellow, name);
                }
                else if (matches = linebuf.match(/^\s*([\d.]+)(\s+([\d.]+))?(\s+(.+))?\s*$/)) //, 'from');
                {
//                        flush.apply(this);
                    var from = Math.round(1000 * matches[1]); //token;
                    if (from > this.duration) { if (!numwarn[0]++) console.log("%s:%d starts past end %d: %s", src, linenum, this.duration / 1000, linebuf.replace(/\t+/g, ' ')); continue; }
                    if (back_trim) this.cues[this.cues.length - 1].to = from; back_trim = null; //fill in gap from previous entry
                    var to = matches[3]? Math.round(1000 * matches[3]): back_trim = this.duration /*9999000*/; //'next'; //will be filled in by next entry; use junk value past end to preserve to >= from validation
                    if (matches[3] && (to < from)) { if (!numwarn[1]++) console.log("%s:%d ends %d before starts %d: %s", src, linenum, to / 1000, from / 1000, linebuf.replace(/\t+/g, ' ')); continue; }
                    var text = matches[5] || null;
//                        var cues = this.cues[name] = this.cues[name] || [];
//                        console.log("hd %s, from %d, to %d, text %s", section, from, to, text);
//                    this.cues.push({from: from || 0, to: to || 9999 /*this.duration*/, text: text || '', src: src || null, name: section || 'ext', });
                    this.cues.push({name: section, from: from, to: to, text: matches[5] || '', src: src + ':' + linenum, });
//                    this.addCue(section, from, to, text, src + ':' + linenum);
                    this.cues_dirty = true;
                }
                else console.log("junk cue line ignored in %s:%d: %s".yellow, src, linenum, linebuf);
            }
        }.bind(this))
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
            if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
            switch (type)
            {
                case 'heading':
                    flush.apply(this);
                    name = token;
                    if (this.cues[name]) console.log("dupl heading %s".yellow, name);
                    break;
                case 'from':
                    flush.apply(this);
                    from = 1 * token;
                    break;
                case 'to':
                    to = 1 * token;
                    break;
                case 'text':
                    flush.apply(this);
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
            if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check
//            console.log("%d cues from %s, dirty? %d", this.cues.length, relpath(filename), this.cues_dirty);
            if (Math.max(numwarn[0], numwarn[1]) > 1) console.log("(%d more warnings)", Math.max(numwarn[0] - 1, 0) + Math.max(numwarn[1] - 1, 0));
            this.unpend(); //ing) this.ready(); //emit('ready');
        }.bind(this))
        .on('error', function(err) { /*this.unpend()*/; this.error /*console.log*/("cues: not a file: %s: %s" + relpath(filename) + " " + err); }.bind(this));

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


function sortCues()
{
    if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
    if (!this.cues_dirty) return;
    this.cues.sort(function(lhs, rhs) //sort by start time, give shorter fx higher priority
    {
        return Math.sign(lhs.from - rhs.from) || Math.sign(lhs.to - rhs.to);
    });
    this.cues_dirty = false;
//    return this; //allow chaining
}


function play()
{
    if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
    sortCues.call(this); //in case any were added
    this.index = 0;
    this.starttime = Now();
    this.stopped = false;
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


function getFrame(frnum)
{
    if (!this.isCuelist) throw "wrong 'this'"; //paranoid/sanity context check
    if (this.cache)
    {
        var frbuf = this.cache.get('fr#' + frnum); // key, [callback] )
        if (frbuf) return frbuf;
    }
}


//eof

/*
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
//    var this_ss = this;
    if (!this.eof) this.dest.emit('data-rcv', chunk, function() //recip can have multiple senders, so tell receiver how to reply
    {
        if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
        this.emit('data-ack');
    }.bind(this));
//if (this.name == "Capital C") { var x = null; x.whatever(); }
//    this.eof = !chunk; //caller can restart flow by pushing more data
//    if (!this.isstreamer) throw "wrong 'this'"; //paranoid/sanity context check
}
*/
