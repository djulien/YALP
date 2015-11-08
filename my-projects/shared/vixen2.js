//Vixen 2.x sequence class (subclass of Sequence)
//loader, plug-in to load xml files as js object
'use strict';

require('colors'); //var colors = require('colors/safe'); //https://www.npmjs.com/package/colors; http://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
var fs = require('fs'); //'fs-extra');
var assert = require('insist');
/*var sprintf =*/ require('sprintf.js'); //.sprintf;
var path = require('path');
//NOTE: async var xml2js = require('xml2js'); //https://github.com/Leonidas-from-XIV/node-xml2js
//var parser = new xml2js.Parser();
var xmldoc = require('xmldoc'); //https://github.com/nfarina/xmldoc
var glob = require('glob');
var shortname = require('my-plugins/utils/shortname');
var inherits = require('inherits');


var Sequence = require('my-projects/shared/sequence'); //base class
//var Vixen2seq = module.exports.vix2seq = function(filename)
var Vixen2Sequence = module.exports.Sequence = function(opts)
{
//    if (!(this instanceof Vixen2seq)) return new Vixen2seq(filename);
    if (!(this instanceof Vixen2Sequence)) return new (Vixen2Sequence.bind.apply(Vixen2Sequence, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    var args = Array.from(arguments);
    var m_opts = args[0] = (typeof args[0] !== 'object')? {filename: args[0]}: args[0] || {};
    Sequence.apply(this, args);

    var where, files;
    this.filename = m_opts.filename || (files = glob.sync(where = m_opts.path || path.join(path.dirname(caller(2)), '**', '!(*-bk).vix')))[0];
    if (!this.filename) throw "Can't find Vixen2 at " + where;
    if (files.length > 1) throw "Too many Vixen2 files found at " + where;
    var top = load(this.filename);

    this.isVixenSeq = true;
    this.duration = 1 * top.byname.Time.value; //msec
    var m_interval = 1 * top.byname.EventPeriodInMilliseconds.value;
    var m_numfr = Math.ceil(this.duration / m_interval);
    var partial = (m_numfr * m_interval != this.duration);
    if (partial)
        console.log("'%s' duration: %d msec, interval %d msec, #frames %d, last partial? %d, #channels %d", shortname(this.filename), this.duration, m_interval, m_numfr, !!partial, (top.byname.Channels.children || []).length);
////    top.PlugInData.PlugIn.[name = "Adjustable preview"].BackgroundImage base64
    var m_chvals = top.byname.EventValues.value;
//    console.log("ch val encoded len " + this.chvals.length);
    m_chvals = new Buffer(m_chvals, 'base64'); //no.toString("ascii"); //http://stackoverflow.com/questions/14573001/nodejs-how-to-decode-base64-encoded-string-back-to-binary
//    console.log("decoded " + chvals.length + " ch vals");
    var m_numch = Math.floor(m_chvals.length / m_numfr);
    partial = (m_numch * m_numfr != m_chvals.length);
    if (partial)
        console.log("num ch# %d, partial frame? %d", m_numch, !!partial);
////    top.decoded = chvals;
    var m_frbuf = new Buffer(m_numch);
    this.chvals = function(frinx, chinx)
    {
        if (typeof chinx === 'undefined') //return all ch vals for a frame
        {
//            for (var chinx = 0; chinx < numch; ++chinx)
//                frbuf[chinx] = chvals[chinx * this.numfr + frinx];
            this.getFrame(frinx, m_frbuf);
            return m_frbuf;
        }
        return ((chinx < m_numch) && (frinx < m_numfr))? m_chvals[chinx * m_numfr + frinx]: 0;
//no        return this.chvals.charCodeAt(frinx * numch + chinx); //chinx * this.numfr + frinx);
    }
    this.getFrame = function(frinx, frbuf)
    {
        for (var chinx = 0, chofs = 0; chinx < m_numch; ++chinx, chofs += m_numfr)
            frbuf[chinx] = m_chvals[/*chinx * m_numfr*/ chofs + frinx];
        return m_numch;
    }
//    debugger;
    this.channels = {length: m_numch}; //tell caller #ch even if they have no data; http://stackoverflow.com/questions/18947892/creating-range-in-javascript-strange-syntax
    if ((top.byname.Channels || {}).children)
    {
        if (top.byname.Channels.children.length != m_numch) console.log("#ch mismatch: %d vs. %d".red, top.byname.Channels.children.length, m_numch);
        var wrstream = m_opts.dump_ch? fs.createWriteStream(path.join(this.filename, '..', shortname(this.filename) + '-channels.txt'), {flags: 'w', }): {write: function() {}, end: function() {}};
        wrstream.write(sprintf("#%d channels:\n", top.byname.Channels.children.length));
        top.byname.Channels.children.forEach(function(child, inx)
        {
            if (!(this instanceof Vixen2Sequence)) throw "Wrong this type";
            var line = this.channels[child.value || '??'] = {/*name: child.value,*/ enabled: child.attr.enabled == "True" /*|| true*/, index: 1 * child.attr.output || inx, color: '#' + (child.attr.color >>> 0).toString(16).substr(-6) /*|| '#FFF'*/, };
            wrstream.write(sprintf("'%s': %s,\n", child.value || '??', JSON.stringify(line)));
        }.bind(this));
        wrstream.end('#eof\n');
    }
    if (top.byname.Audio)
    {
        var m_audio = path.join(this.filename, '..', top.byname.Audio.value);
        var m_audiolen = top.byname.Audio.attr.duration;
        if (top.byname.Audio.attr.filename != top.byname.Audio.value) console.log("audio filename mismatch: '%s' vs. '%s'".red, top.byname.Audio.attr.filename || '(none)', top.byname.Audio.value || '(none)');
        if (m_opts.audio !== false) this.addMedia(m_audio);
    }

//    console.log("loaded '%s'".green, filename);
//    console.log("audio '%s'".blue, seq.audio || '(none)');
    console.log("duration %s, interval %s, #fr %d, #ch %d, audio %s".blue, timescale(this.duration), timescale(m_interval), m_numfr, this.channels.length, m_audio);
    if (m_audiolen != this.duration) console.log("seq len %d != audio len %d".red, this.duration, m_audiolen);
//    this.setDuration(this.duration, "vix2");
    if (m_opts.cues !== false) this.fixedInterval = m_interval; //addFixedFrames(vix2.interval, 'vix2');
    console.log("opts.cues %s, fixint %s, vixint %s".cyan, opts.cues, this.fixedInterval, m_interval);

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


var Vixen2Profile = module.exports.Profile = function(filename)
{
    if (!(this instanceof Vixen2Profile)) return new Vixen2Profile(filename);
    this.filename = filename;
    var top = load(filename);

    this.isVixenPro = true;
//    debugger;
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
