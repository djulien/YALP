//Vixen 2.x sequence class (subclass of Sequence)
//loader, plug-in to load xml files as js object
'use strict';

require('colors'); //var colors = require('colors/safe'); //https://www.npmjs.com/package/colors; http://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
var fs = require('fs'); //'fs-extra');
var assert = require('insist');
var inherits = require('inherits');
var makenew = require('my-plugins/utils/makenew');
var bufdiff = require('my-plugins/utils/buf-diff');
var timescale = require('my-plugins/utils/time-scale');
/*var sprintf =*/ require('sprintf.js'); //.sprintf;
var path = require('path');
//NOTE: async var xml2js = require('xml2js'); //https://github.com/Leonidas-from-XIV/node-xml2js
//var parser = new xml2js.Parser();
var xmldoc = require('xmldoc'); //https://github.com/nfarina/xmldoc
var glob = require('glob');
var shortname = require('my-plugins/utils/shortname');
//var models = require('my-projects/models/model'); //generic models
var ChannelPool = require('my-projects/models/chpool'); //generic ports

function isdef(thing) { return (typeof thing !== 'undefined'); }

module.exports.Sequence = Vixen2Sequence;
module.exports.Profile = Vixen2Profile;
module.exports.ExtendModel = ExtendModel;


var Sequence = require('my-projects/shared/sequence'); //base class
//var Vixen2seq = module.exports.vix2seq = function(filename)
function Vixen2Sequence(opts)
{
//    console.log("vix2 seq opts", arguments);
    if (!(this instanceof Vixen2Sequence)) return makenew(Vixen2Sequence, arguments);
    var add_prop = function(name, value, vis) { if (!this[name]) Object.defineProperty(this, name, {value: value, enumerable: vis !== false}); }.bind(this); //expose prop but leave it read-only
//    var args = Array.from(arguments);
//    var m_opts = (typeof opts !== 'object')? {param: opts}: opts || {};
    Sequence.apply(this, arguments);

    var where, files;
    files = glob.sync(where = path.join(this.opts.folder, '**', '!(*-bk).vix'));
    if (!files.length) throw "Can't find Vixen2 seq at " + where;
    if (files.length > 1) throw "Too many Vixen2 seq found at " + where;
    add_prop('vix2filename', files[0]);
    var m_top = load(this.vix2filename);

    add_prop('isVixenSeq', true);
    var m_duration = 1 * m_top.byname.Time.value; //msec
    if (!this.opts.use_media_len) this.addCue({to: m_duration}); //kludge: create dummy cue to force duration length; //add_prop('duration', m_duration);
    add_prop('FixedFrameInterval', 1 * m_top.byname.EventPeriodInMilliseconds.value);
    var m_numfr = Math.ceil(m_duration / this.FixedFrameInterval);
    var partial = (m_numfr * this.FixedFrameInterval != m_duration);
    if (partial)
        console.log("'%s' duration: %d msec, interval %d msec, #frames %d, last partial? %s, #channels %d", shortname(this.vix2filename), m_duration, this.FixedFrameInterval, m_numfr, !!partial, (m_top.byname.Channels.children || []).length);
////    top.PlugInData.PlugIn.[name = "Adjustable preview"].BackgroundImage base64
    var m_chvals = m_top.byname.EventValues.value;
//    console.log("ch val encoded len " + this.chvals.length);
    m_chvals = new Buffer(m_chvals, 'base64'); //no.toString("ascii"); //http://stackoverflow.com/questions/14573001/nodejs-how-to-decode-base64-encoded-string-back-to-binary
//    console.log("decoded " + chvals.length + " ch vals");
    var m_numch = Math.floor(m_chvals.length / m_numfr);
    partial = (m_numch * m_numfr != m_chvals.length);
    if (partial)
        console.log("num ch# %d, partial frame? %d", m_numch, !!partial);
////    top.decoded = chvals;
    var pivot = new Buffer(m_chvals.byteLength);
    for (var chinx = 0, chofs = 0; chinx < m_numch; ++chinx, chofs += m_numfr)
        for (var frinx = 0, frofs = 0; frinx < m_numfr; ++frinx, frofs += m_numch)
            pivot[frofs + chinx] = m_chvals[chofs + frinx]; //pivot ch vals for faster frame retrieval
    m_chvals = pivot; pivot = null;
//    var m_frbuf = new Buffer(m_numch);
    this.chvals = function(frinx, chinx)
    {
        if (!isdef(chinx)) return m_chvals.slice(frinx * m_numch, (frinx + 1) * m_numch); //all ch vals for this frame; NOTE: returns different buffer segment for each frame; this allows dedup with no mem copying
        return ((chinx < m_numch) && (frinx < m_numfr))? m_chvals[chinx * m_numfr + frinx]: 0; //single ch val
//no        return this.chvals.charCodeAt(frinx * numch + chinx); //chinx * this.numfr + frinx);
//        typeof chinx === 'undefined') //return all ch vals for a frame
//        {
//            for (var chinx = 0; chinx < numch; ++chinx)
//                frbuf[chinx] = chvals[chinx * this.numfr + frinx];
//            this.getFrame(frinx, m_frbuf);
//            return m_frbuf;
//        }
    }
//    this.getFrame = function(frinx, frbuf)
//    {
//        for (var chinx = 0, chofs = 0; chinx < m_numch; ++chinx, chofs += m_numfr)
//            frbuf[chinx] = m_chvals[/*chinx * m_numfr*/ chofs + frinx];
//        return m_numch;
//        return m_chvals.slice(frinx * m_numch, (frinx + 1) * m_numch);
//    }
//    debugger;
    var m_prevbuf;
    this.render = function(frtime) //pseudo-animation by pushing de-duped Vixen2 ch vals to models
    {
        debugger;
        var chvals = this.chvals(Math.floor(frtime / this.FixedFrameInterval));
        var ic_debug = chvals.slice(2, 2+14);
//        if (/*frtime*/ m_prevbuf && (this.opts.dedup !== false) && !bufdiff(chvals, m_prevbuf)) return {frnext: frtime + this.FixedFrameInterval, bufs: null}; //no change
        if (!m_prevbuf || (this.opts.dedup === false) || bufdiff(chvals, m_prevbuf)) //no dedup or chvals changed
        {
            if (this.opts.dedup !== false) m_prevbuf = chvals;
//        return m_prevbuf = chvals;
//        console.log("TODO: below is generic");
            ChannelPool.all.forEach(function(chpool)
            {
//                if (chpool.dirty) console.log("chpool buf",
                chpool.models.forEach(function(model, inx, all) //update Vixen-aware models
                {
//                if (!model.opts.vix2ch /*vix2buf*/) { console.log("model %s is not mapped for vix2", model.name); return; }
//                model.vix2set(frtime, chvals); //apply vix2 ch vals to model
                    if (!model.opts.vix2ch) return; //doesn't want Vixen2 channels
                    model.vix2buf = chvals; //send all channels so models can influence each other; not really - model will slice it down
//            model.render(); //tell model to render new output
                });
            });
        }
        var retval = Sequence.prototype.render.call(this, frtime);
        var frnext = frtime + this.FixedFrameInterval;
        retval.frnext = (typeof retval.frnext === 'number')? Math.min(retval.frnext, frnext): frnext; //set next pseudo-animation frame time
        return retval;
//        var portbufs = {};
//        ChannelPool.all.forEach(function(chpool, inx, all)
//        {
//            portbufs[chpool.name] = chpool.render();
//        });
//        return {frnext: frtime + this.FixedFrameInterval, bufs: portbufs};
    }

//    this.getChannels(m_top.bynme.Channels, m_numch);
    this.channels = {length: m_numch}; //tell caller #ch even if they have no data; http://stackoverflow.com/questions/18947892/creating-range-in-javascript-strange-syntax
    if ((m_top.byname.Channels || {}).children)
    {
        if (m_top.byname.Channels.children.length != m_numch) console.log("#ch mismatch: %d vs. %d".red, m_top.byname.Channels.children.length, m_numch);
        var wrstream = this.opts.dump_ch? fs.createWriteStream(path.join(this.vix2filename, '..', shortname(this.vix2filename) + '-channels.txt'), {flags: 'w', }): {write: function() {}, end: function() {}};
        wrstream.write(sprintf("#%d channels:\n", m_top.byname.Channels.children.length));
        m_top.byname.Channels.children.forEach(function(child, inx)
        {
//            if (!(this instanceof Vixen2Sequence)) throw "Wrong this type";
            var line = this.channels[child.value || '??'] = {/*name: child.value,*/ enabled: child.attr.enabled == "True" /*|| true*/, index: 1 * child.attr.output || inx, color: '#' + (child.attr.color >>> 0).toString(16).substr(-6) /*|| '#FFF'*/, };
            wrstream.write(sprintf("'%s': %s,\n", child.value || '??', JSON.stringify(line)));
        }.bind(this));
        wrstream.end('#eof\n');
    }
    if (m_top.byname.Audio)
    {
        var m_audio = path.join(this.vix2filename, '..', m_top.byname.Audio.value);
        var m_audiolen = m_top.byname.Audio.attr.duration;
        if (m_top.byname.Audio.attr.filename != m_top.byname.Audio.value) console.log("audio filename mismatch: '%s' vs. '%s'".red, m_top.byname.Audio.attr.filename || '(none)', m_top.byname.Audio.value || '(none)');
        if (this.opts.audio !== false) this.addMedia(m_audio);
    }

//    console.log("loaded '%s'".green, filename);
//    console.log("audio '%s'".blue, seq.audio || '(none)');
    console.log("duration %s, interval %s, #fr %d, #ch %d, audio %s".blue, timescale(m_duration), timescale(this.FixedFrameInterval), m_numfr, this.channels.length, m_audio);
    if (m_audiolen != m_duration) console.log("seq len %d != audio len %d".red, m_duration, m_audiolen);
//    this.setDuration(m_duration, "vix2");
//    if (m_opts.cues !== false) this.FixedFrameInterval = m_interval; //addFixedFrames(vix2.interval, 'vix2');
//    console.log("opts.cues %s, fixint %s, vixint %s".cyan, opts.cues, this.fixedInterval, m_interval);

//    return this;
/*
    for (var chofs = 0; chofs < chvals.length; chofs += numch)
    {
        var buf = "", nonnull = false;
        for (var ch = 0; ch < numch; ++ch)
        {
            var chval = chvals.charCodeAt(chofs + ch); //chvals[chofs + ch];
            if (chval) nonnull = true;
            buf += ", " + chval;
        }
        if (nonnull) console.log("frame [%d/%d]: " + buf.substr(2), chofs / numch, numfr);
    }
*/
}
inherits(Vixen2Sequence, Sequence);


//var path = require('path');
//var glob = require('glob');


//Vixen2 Sequence with custom mapping
//Vixen2Sequence.prototype.ExtendModel = function(model)
function ExtendModel(model)
{
    if (!model.opts.vix2ch) return false;
    if (!model.vix2render) throw "Missing vix2render() on model '" + model.name + "'"; //return false;
    var vix2ch = Array.isArray(model.opts.vix2ch)? model.opts.vix2ch: [model.opts.vix2ch, +0];
    var vix2alt = Array.isArray(model.opts.vix2alt)? model.opts.vix2alt: model.opts.vix2alt? [model.opts.vix2alt, +0]: null;

    var m_prevbuf;
    Object.defineProperty(model, 'vix2buf',
    {
        enumerable: true,
        get() { return m_prevbuf; },
        set(newbuf) //NOTE: different buffer segments are passed in from caller; this allows dedup without mem copying, but creates more slicing
        {
//            var chbuf = newbuf.slice(this.opts.vix2ch[0], this.opts.vix2ch[0] + this.opts.vix2ch[1]); //this.opts.vix2ch[0], this.opts.vix2ch[1]);
//            var altbuf = this.opts.vix2alt? newbuf.slice(this.opts.vix2alt[0], this.opts.vix2alt[0] + this.opts.vix2alt[1]): null; //this.opts.vix2alt? chbuf.slice(this.opts.vix2alt[0], this.opts.vix2alt[1]): null;
//            if (altbuf && altbuf.compare(chbuf)) console.log("Vixen2 alt buf %j doesn't match %j".red, /*this.opts.*/vix2alt, /*this.opts.*/vix2ch);
//        if (this.buf.compare(chbuf)) { this.dirty = true; chbuf.copy(this.buf); }
            var chbuf = newbuf.slice(vix2ch[0], vix2ch[0] + vix2ch[1]); //this.opts.vix2ch[0], this.opts.vix2ch[1]);
            if (vix2alt) //paranoid check on alternate range of channels
            {
                var ofs;
                var altbuf = newbuf.slice(vix2alt[0], vix2alt[0] + vix2alt[1]); //this.opts.vix2alt? chbuf.slice(this.opts.vix2alt[0], this.opts.vix2alt[1]): null;
                if (ofs = bufdiff(chbuf, altbuf)) console.warn("Vixen2 alt buf %j %j doesn't match %j %j at ofs %d".red, vix2alt, altbuf, vix2ch, chbuf, ofs);
            }
            if (/*frtime*/ m_prevbuf && (model.opts.dedup !== false) && !bufdiff(chbuf, m_prevbuf)) return; //don't force dirty on first frame, only if no prior buf
//        if (this.opts.dedup !== false)
            if (model.opts.dedup !== false) m_prevbuf = chbuf; //CAUTION: assume different buffer memory next time; avoids expensive mem copy
//            this.frtime = frtime;
//            this.dirty = true;
            model.vix2render(chbuf); //only pass the ch range of interest; //newbuf); //NOTE: pass full buffer so vix2ch values are correct as-is; model can choose to store it or not
        },
    });
    return true;
/*
    model.vix2set = function(frtime, vix2buf)
    {
//    var vix2ch = chbuf.slice(400, 400 + 16);
//    var dirty = this.buf.compare(vix2ch);
//    chbuf.copy(this.buf, 0, 400); //slice(400, 400 + 16);
//    var dirty = false, mism = false;
//    const INX = [139, 125, 118, 117, 116, 115, 114, 113, 112, 111, 110, 109, 108, 107, 106, 105];
//    var ALT = []; for (var i = 400; i < 400 + 16; ++i) ALT.push(i);
//    INX.forEach(function(chinx, i)
//    {
//        if (!mism && (chbuf[chinx] != chbuf[ALT[i]])) mism = true;
//        if (!dirty && (chbuf[400 + i] != chbuf[chinx])) mism = true;
//        if (this.buf[i] ==
//        if (!chvals[list_inx])
//            if (chbuf[chnum
//        if (chvals[inx] && chbuf[chnum] &&
//    this.setPixels(chvals.sl

//        if (frtime && this.opts.dedup && !bufdiff(vix2buf, this.prevbuf)) return false;
//        if (this.opts.dedup) this.prevbuf = vix2buf;
        var chbuf = vix2buf.slice(vix2ch[0], vix2ch[0] + vix2ch[1]); //this.opts.vix2ch[0], this.opts.vix2ch[1]);
        var altbuf = vix2alt? vix2buf.slice(vix2alt[0], vix2alt[0] + vix2alt[1]): null; //this.opts.vix2alt? chbuf.slice(this.opts.vix2alt[0], this.opts.vix2alt[1]): null;
        if (altbuf && altbuf.compare(chbuf)) console.log("Vixen2 alt buf %j doesn't match %j".red, /-*this.opts.*-/vix2alt, /-*this.opts.*-/vix2ch);
//        if (this.buf.compare(chbuf)) { this.dirty = true; chbuf.copy(this.buf); }
        if (/-*frtime*-/ this.prevbuf && (this.opts.dedup !== false) && !bufdiff(chbuf, this.prevbuf)) return false; //don't force dirty on first frame, only if no prior buf
//        if (this.opts.dedup !== false)
        this.prevbuf = chbuf; //CAUTION: assume different buffer memory next time; avoids expensive mem copy
        this.frtime = frtime;
        this.dirty = true;
    }.bind(model);
*/
}


function Vixen2Profile(filename)
{
    if (!(this instanceof Vixen2Profile)) return makenew(Vixen2Profile, arguments);
//    this.filename = filename;
//    var top = load(filename);
    var m_opts = {path: filename}; //glob shim
    var where, files;
    this.filename = m_opts.filename || (files = glob.sync(where = m_opts.path || path.join(caller(1, __filename), '..', '**', '!(*-bk).pro')))[0];
    if (!this.filename) throw "Can't find Vixen2 profile at " + where;
    if (files.length > 1) throw "Too many Vixen2 profiles found at " + where;
    var top = load(this.filename);

    this.isVixenPro = true;
//    debugger;
//    this.getChannels(m_top.bynme.ChannelObjects, m_numch);
    this.channels = {length: numch}; //tell caller #ch even if they have no data; http://stackoverflow.com/questions/18947892/creating-range-in-javascript-strange-syntax
    if (!((top.byname.ChannelObjects || {}).children || {}).length) throw "No channels";
//    if (top.byname.Channels.children.length != numch) console.log("#ch mismatch: %d vs. %d", top.byname.Channels.children.length, numch);
//    var wrstream = fs.createWriteStream(path.join(filename, '..', shortname(filename) + '-channels.txt'), {flags: 'w', });
//    wrstream.write(sprintf("#%d channels:\n", top.byname.Channels.children.length));
    var numch = top.byname.ChannelObjects.children.length;
    this.channels = {length: numch}; //tell caller #ch even if they have no data
    top.byname.ChannelObjects.children.forEach(function(child, inx)
    {
        if (!(this instanceof Vixen2Profile)) throw "Wrong this type";
        /*var line =*/ this.channels[child.value || '??'] = {/*name: child.value,*/ enabled: child.attr.enabled == "True" /*|| true*/, index: inx, output: 1 * child.attr.output || inx, color: '#' + (child.attr.color >>> 0).toString(16).substr(-6) /*|| '#FFF'*/, };
//        wrstream.write(sprintf("'%s': %s,\n", child.value || '??', JSON.stringify(line)));
    }.bind(this));
//    wrstream.end('#eof\n');
}


function load(abspath, cb)
{
//    var abspath = rel2abs(filepath);
    if (!cb) return parse(fs.readFileSync(abspath, 'utf8')); //sync
    var seq = "";
    fs.createReadStream(abspath) //async, streamed
        .on('data', function(chunk) { seq += chunk; console.log("got xml chunk len " + chunk.length); })
        .on('end', function() { console.log("total xml read len " + seq.length); cb(parse(seq)); });
}


function parse(str)
{
//    console.log("loaded " + (typeof str));
////    assert(typeof str === 'string');
//    console.log(("file " + str).substr(0, 200) + "...");

    var doc = new xmldoc.XmlDocument(str);
//    console.log(doc);
    var xml = traverse({}, doc);
//    src = JSON.stringify(xml); //TODO: just return parsed object rather than serialize + parse again?
    if (xml.children.length != 1) throw (xml.children.length? "Ambiguous": "Missing") + " top-level node";
    return xml.children[0];
}


function traverse(parent, child) //recursive
{
    var newnode =
    {
        name: child.name,
        attr: child.attr, //dictionary
        value: child.val, //string
//        children: [], //array
//        byname: {},
    };
    if (!parent.children) parent.children = [];
    parent.children.push(newnode);
    if (!parent.byname) parent.byname = {};
    parent.byname[child.name.replace(/[0-9]+$/, "")] = newnode; //remember last node for each unindexed name
    child.eachChild(function(grandchild) { traverse(newnode, grandchild); });
    return parent;
}


/*
function analyze(top)
{
    if (top.name != "Program") error("Unrecognized top-level node: " + top.name);
//    if (!$.isEmptyObject(top.attr)) error("Unhandled attrs on top-level node");
    var duration = 1 * top.byname.Time.value; //msec
    var interval = 1 * top.byname.EventPeriodInMilliseconds.value;
    var numfr = Math.ceil(duration / interval);
    var partial = (numfr * interval != duration);
    console.log("duration: %d msec, interval %d msec, #frames %d, last partial? %d", duration, interval, numfr, !!partial);
    console.log("contains " + (top.byname.Channels.children || []).length + " channels");
//    top.PlugInData.PlugIn.[name = "Adjustable preview"].BackgroundImage base64
    var chvals = top.byname.EventValues.value;
    console.log("ch val encoded len " + chvals.length);
    chvals = new Buffer(chvals, 'base64').toString("ascii"); //http://stackoverflow.com/questions/14573001/nodejs-how-to-decode-base64-encoded-string-back-to-binary
    console.log("decoded " + chvals.length + " ch vals");
    var numch = Math.floor(chvals.length / numfr);
    partial = (numch * numfr != chvals.length);
    console.log("num ch# %d, partial frame? %d", numch, !!partial);
//    top.decoded = chvals;
    for (var chofs = 0; chofs < chvals.length; chofs += numch)
    {
        var buf = "", nonnull = false;
        for (var ch = 0; ch < numch; ++ch)
        {
            var chval = chvals.charCodeAt(chofs + ch); //chvals[chofs + ch];
            if (chval) nonnull = true;
            buf += ", " + chval;
        }
        if (nonnull) console.log("frame [%d/%d]: " + buf.substr(2), chofs / numch, numfr);
    }
}


function main()
{
    glob('my-projects/songs/xmas/Amaz* / *.vix', function(err, files)
    {
        if (err) { console.log("ERROR: ", err); return; }
        (files || []).forEach(function(filename)
        {
            var seq = load(filename, function(seq)
            {
                console.log("loaded " + filename);
//    outln(seq);
                console.log((seq + "").substr(0, 200) + "...");
                analyze(seq);
            });
        });
    });
}

main();
*/

//eof

/*
    var doc = new xmldoc.XmlDocument(src);
//    console.log(doc);
    var xml = traverse({children: []}, doc);
    src = JSON.stringify(xml); //TODO: just return parsed object rather than serialize + parse again?
    if (xml.children.length != 1) throw "XML error: file '" + filename + "' has too many (" + xml.children.length + ") top-level nodes".replace(/too many \(0\)/, "no"); //should only have one
//    console.log("XML:", src); //xml.children[0]);
    return src;
});
function traverse(parent, child) //recursive
{
    var newnode =
    {
        name: child.name,
        '@': child.attr,
        '#': child.val,
        children: [],
    };
    parent.children.push(newnode);
    child.eachChild(function(grandchild) { traverse(newnode, grandchild); });
    return parent;
}
*/
