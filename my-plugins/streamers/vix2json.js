
'use strict';
//TODO: async file load
//xml-stream is broken, so just load the xml manually
//maybe xml-object-stream works?


require('colors'); //var colors = require('colors/safe'); //https://www.npmjs.com/package/colors; http://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
const fs = require('fs'); //'fs-extra');
const path = require('path');
const assert = require('insist');
const inherits = require('inherits');
const glob = require('my-plugins/utils/glob-unique');
const clock = require('my-plugins/utils/clock');
const filetime = require('my-plugins/utils/filetime');
//var inherits_etc = require('my-plugins/utils/class-stuff').inherits_etc;
//var allow_opts = require('my-plugins/utils/class-stuff').allow_opts;
require('my-plugins/my-extensions/object-enum'); //allow forEach() on objects
const Color = require('tinycolor2'); //'onecolor').color;
//TODO? const Color = require('parse-color'); //css color parser
const color_cache = require('my-projects/models/color-cache').cache;
const color_cache_stats = require('my-projects/models/color-cache').stats;
const makenew = require('my-plugins/utils/makenew');
const bufdiff = require('my-plugins/utils/buf-diff');
const logger = require('my-plugins/utils/logger')();
const timescale = require('my-plugins/utils/time-scale');
/*var sprintf =*/ require('sprintf.js'); //.sprintf;
//NOTE: async var xml2js = require('xml2js'); //https://github.com/Leonidas-from-XIV/node-xml2js
//var parser = new xml2js.Parser();
const xmldoc = require('xmldoc'); //https://github.com/nfarina/xmldoc
const shortname = require('my-plugins/utils/shortname');
const rdwr = require('my-plugins/streamers/stmon').rdwr;
//var models = require('my-projects/models/model'); //generic models
//var ChannelPool = require('my-projects/models/chpool'); //generic ports
//var models = require('my-projects/shared/my-models').models;
//var Model2D = require('my-projects/models/model-2d');


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Streaming:
//

function Vixen2json(outstream, profile, seqfile)
{
    var vix2prof = new Vixen2Profile(profile);
    var vix2seq = new Vixen2Sequence({filename: seqfile, profile: vix2prof});

//no    outs.write("["); //wrap in one large json array
    outstream.svwrite = outstream.write;
    outstream.write = function(buf) { outstream.svwrite(JSON.stringify(buf) + '\n'); }; //',\n'
    vix2prof.toJSON(outstream); //put channel + profile info in front of seq
    vix2seq.toJSON(outstream);
    outstream.write = outstream.svwrite;
//no    outs.write(JSON.stringify("eof") + "]");
//    outstream.end(); //eof
    logger("vix2 prof + seq written".cyan);
    return outstream; //fluent
}
module.exports.Vixen2json = Vixen2json;


function Vixen2Stream(profile, seqfile, cb)
{
    var passthru = rdwr('vix2 in-out', cb);
    process.nextTick(function() { Vixen2json(passthru, profile, seqfile); }); //kludge: give caller time to connect pipe before filling it
    return passthru; //fluent (pipes)
}
module.exports.Vixen2Stream = Vixen2Stream;


//TODO: stream a Vixen2 sequence?
function broken()
{
const XmlStream = require('xml-stream'); //https://codeforgeek.com/2014/10/parse-large-xml-files-node/

const infile = "my-projects/songs/xmas/Amaz*/!(*-bk).vix";
const outfile = "zout.json";

var filename = glob.unique(infile);
var ins = fs.createReadStream(filename);
var xml = new XmlStream(ins);
var outs = stmon(fs.createWriteStream(outfile));
outs.write(JSON.stringify(xml)) //+ '\n');
outs.end(); //eof
logger("file written".cyan); //"%d frames written".cyan, frags.length);
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// load the most interesting parts of Vixen2 sequence or profile:
//

//Vixen2 sequence:
//contains channel values and maybe channel info
function Vixen2Sequence(opts)
{
    if (!(this instanceof Vixen2Sequence)) return makenew(Vixen2Sequence, arguments);
    this.opts = (typeof opts == 'string')? {filename: opts}: opts || {};
    this.filename = glob.unique(this.opts.filename || path.join(caller(1, __filename), '..', '**', '!(*-bk).pro'));
    this.top = parse(fs.readFileSync(this.filename, 'utf8')); //sync
    this.name = shortname(this.filename);

    var m_duration = this.duration = 1 * this.top.byname.Time.value; //msec
//    if (!this.opts.use_media_len) this.addCue({to: m_duration}); //kludge: create dummy cue to force duration length; //add_prop('duration', m_duration);
    this.FixedFrameInterval = 1 * this.top.byname.EventPeriodInMilliseconds.value;
    var m_numfr = Math.ceil(m_duration / this.FixedFrameInterval);
    var partial = this.partial = (m_numfr * this.FixedFrameInterval != m_duration);
    if (partial) logger("'%s' duration: %d msec, interval %d msec, #frames %d, last partial? %s, #seq channels %d".blue, shortname(this.filename), m_duration, this.FixedFrameInterval, m_numfr, !!partial, (this.top.byname.Channels.children || []).length);
////    top.PlugInData.PlugIn.[name = "Adjustable preview"].BackgroundImage base64
    var m_chvals = this.top.byname.EventValues.value;
//    console.log("ch val encoded len " + this.chvals.length);
    m_chvals = new Buffer(m_chvals, 'base64'); //no.toString("ascii"); //http://stackoverflow.com/questions/14573001/nodejs-how-to-decode-base64-encoded-string-back-to-binary
//    console.log("decoded " + chvals.length + " ch vals");
    var m_numch = Math.floor(m_chvals.length / m_numfr);
    if (partial = (m_numch * m_numfr != m_chvals.length)) this.partial = true;
    if (partial) console.log("num ch# %d, partial frame? %d", m_numch, !!partial);
////    top.decoded = chvals;

    this.chcolors = (this.opts.profile? this.opts.profile.chcolors: null) || get_channels.call(this, this.top.byname.Channels, m_numch);

    var pivot = new Buffer(4 * m_chvals.length); //convert monochrome to RGBA at start so colors can be handled uniformly downstream
//    var rgba = new DataView(pivot);
    var m_color_cache = {};
    for (var chinx = 0, chofs = 0; chinx < m_numch; ++chinx, chofs += m_numfr)
        for (var frinx = 0, frofs = 0; frinx < m_numfr; ++frinx, frofs += m_numch)
        {
//            pivot[frofs + chinx] = m_chvals[chofs + frinx]; //pivot ch vals for faster frame retrieval
            var rgba = this.chcolors[chinx], brightness = m_chvals[chofs + frinx];
            if (!rgba) throw "Channel# " + (chinx + 1) + " no color found"; //this will cause dropped data so check it first
            rgba = color_cache(rgba + '^' + brightness, function()
            {
                if (brightness != 255) rgba = dim(rgba, brightness);
                return rgba;
            });
            pivot.writeUInt32BE(rgba, 4 * (chofs + frinx));
        }
    m_chvals = pivot; pivot = null;
//    console.log("pivot color cache vix2 '%s': hits %d, misses %d", this.name, color_cache_stats.hits, color_cache_stats.misses);
//    var m_frbuf = new Buffer(m_numch);
    this.chvals = function(frinx, chinx)
    {
        if (arguments.length < 2) return m_chvals.slice(4 * frinx * m_numch, 4 * (frinx + 1) * m_numch); //all ch vals for this frame; NOTE: returns different buffer segment for each frame; this allows dedup with no mem copying
        return ((chinx < m_numch) && (frinx < m_numfr))? m_chvals.readUInt32BE(4 * (chinx * m_numfr + frinx)): 0; //[chinx * m_numfr + frinx]: 0; //single ch val
    }

    if (this.top.byname.Audio) //set audio after channel vals in case we are overriding duration
    {
        var m_audio = path.join(this.filename, '..', this.top.byname.Audio.value);
        this.audiolen = this.top.byname.Audio.attr.duration;
        if (this.opts.use_media_len) this.duration = this.audiolen;
        if (this.top.byname.Audio.attr.filename != this.top.byname.Audio.value) console.log("audio filename mismatch: '%s' vs. '%s'".red, this.top.byname.Audio.attr.filename || '(none)', this.top.byname.Audio.value || '(none)');
//        if (this.opts.audio !== false) this.addMedia(m_audio);
    }

//just write selected data, not everything:
    this.toJSON = function(outstream)
    {
        outstream.write({comment: "sequence begin " + clock.asDateTimeString()});
        outstream.write({filename: this.filename, filetime: filetime.asString(this.filename), duration: this.duration, interval: this.FixedFrameInterval,
            numfr: m_numfr, numch: m_numch, last_partial: this.partial,
            audiofile: this.top.byname.Audio.attr.filename, audiofile2: (this.top.byname.Audio.attr.filename != this.top.byname.Audio.value)? this.top.byname.Audio.value: undefined,
            audiolen: this.top.byname.Audio.attr.duration, fx: "vix2json.Sequence",
        });
        outstream.write({comment: (this.channels || this.chcolors).length + " channel defs"});
//        this.channels.forEach(function(channel)
//        {
//            outstream.write(channel); //this.var line = this.channels[child.value || '??'] = {/*name: child.value,*/ enabled: child.attr.enabled == "True" /*|| true*/, index: 1 * child.attr.output || inx, color: child.attr.color? '#' + (child.attr.color >>> 0).toString(16).substr(-6): '#FFF'};
//        });
        outstream.write({pivot_color_cache_stats: color_cache_stats});
        outstream.write({comment: "channel values"});
        var m_prior;
        for (var frinx = 0; frinx < m_numfr; ++frinx)
        {
            var frbuf = this.chvals(frinx), nonz = bufdiff(frbuf, null);
            var outfr = {frame: frinx, time: frinx * this.FixedFrameInterval, fx: 'rawbuf'}; //, buf: frbuf};
            if (this.opts.dedup === false) { outfr.buf = frbuf; outfr.buflen = frbuf.length; }
            var ofs = m_prior? bufdiff(frbuf, m_prior): 1; //abs(ofs) - 1 == ofs first diff
            if (!ofs) outfr.dup = true; //flag dups even if dedup is not wanted
            else
            {
                var ofs2 = m_prior? bufdiff.reverse(frbuf, m_prior): frbuf.length & ~3;
                if (ofs < 0) ++ofs; else --ofs; //adjust to actual ofs
                if (ofs2 < 0) ++ofs2; else --ofs2;
                if (!ofs && (Math.abs(ofs2) == frbuf.length & ~3)) //nothing to trim
                {
                    outfr.buf = frbuf;
                    outfr.buflen = frbuf.length;
                }
                else if (this.opts.dedup !== false)
                {
                    outfr.buf = frbuf.slice(Math.abs(ofs), Math.abs(ofs2) + 4); //just keep the part that changed
                    outfr.buflen = outfr.buf.length;
                    outfr.diff = [ofs, ofs2];
                }
            }
            if (nonz) outfr.nonzofs = nonz - 1;
//            var dup = (m_prior && !bufdiff(frbuf, m_prior)); //tag dups now while they are sure to be using different buffer areas
            outstream.write(outfr);
            m_prior = frbuf;
        }
        logger("wrote %d frames".cyan, m_numfr);
//        if (outfr.time < this.duration) //TODO: do we need a partial/dummy frame at end?
        outstream.write({comment: "sequence end"});
    }
}
module.exports.Sequence = Vixen2Sequence;


if (false)
process.nextTick(function() //NOTE: this will clog up memory
{
    rows.forEach(function(row) { outs.write(JSON.stringify(row) + '\n'); });
    logger("%d hardwired frames written".cyan, rows.length);
//outs.write = outs.svwrite;
//outs.write(JSON.stringify("eof")); //NO + "]");
    outs.end(); //eof
});
else send_next(0); //throttle writes to match destination
return outs; //fluent (pipes)

function send_next(inx)
{
    if (inx < rows.length)
    {
        outs.write(JSON.stringify(rows[inx]) + '\n');
        setTimeout(function() { send_next(inx + 1); }, 50);
    }
    else outs.end(); //eof
}


//Vixen2 profile:
//channel info is defined in profile (typically)
function Vixen2Profile(opts)
{
    if (!(this instanceof Vixen2Profile)) return makenew(Vixen2Profile, arguments);
    this.opts = (typeof opts == 'string')? {filename: opts}: opts || {};
    this.filename = glob.unique(this.opts.filename || path.join(caller(1, __filename), '..', '**', '!(*-bk).pro'));
    this.top = parse(fs.readFileSync(this.filename, 'utf8')); //sync
    this.name = shortname(this.filename);

    if (!((this.top.byname.ChannelObjects || {}).children || {}).length) throw "No channels";
    var m_numch = this.top.byname.ChannelObjects.children.length;

//    this.channels = {length: numch}; //tell caller #ch even if they have no data; http://stackoverflow.com/questions/18947892/creating-range-in-javascript-strange-syntax
    this.chcolors = get_channels.call(this, this.top.byname.ChannelObjects, m_numch, true);

//just write selected data, not everything:
    this.toJSON = function(outstream)
    {
        outstream.write({comment: "profile begin " + clock.asDateTimeString()});
        outstream.write({filename: this.filename, filetime: filetime.asString(this.filename), numch: m_numch, fx: "vix2json.Profile"});
        outstream.write({comment: this.channels.length + " channel defs"});
        this.channels.forEach(function(channel)
        {
            outstream.write(channel); //this.var line = this.channels[child.value || '??'] = {/*name: child.value,*/ enabled: child.attr.enabled == "True" /*|| true*/, index: 1 * child.attr.output || inx, color: child.attr.color? '#' + (child.attr.color >>> 0).toString(16).substr(-6): '#FFF'};
        });
        logger("wrote %d channels".cyan, this.channels.length);
        outstream.write({comment: "profile end"});
    }
}
module.exports.Profile = Vixen2Profile;


//load channel names, colors:
function get_channels(m_top_Channels, m_numch, chk)
{
//    this.getChannels(m_top.bynme.Channels, m_numch);
    if (!(this instanceof Vixen2Sequence) && !(this instanceof Vixen2Profile)) throw "Called wrongly";
    this.channels = {length: m_numch}; //tell caller #ch even if they have no data; http://stackoverflow.com/questions/18947892/creating-range-in-javascript-strange-syntax
    var m_chcolors = [];
    if ((m_top_Channels || {}).children) //get channels before chvals so colors can be applied (used for mono -> RGB mapping)
    {
        if (m_top_Channels.children.length != m_numch) logger("#ch mismatch: %d vs. %d".red, m_top_Channels.children.length, m_numch);
        else logger(10, "#ch matches okay %d".green, m_top_Channels.children.length);
        var wrstream = (this.opts || {}).dump_ch? fs.createWriteStream(path.join(this.vix2filename, '..', shortname(this.vix2filename) + '-channels.txt'), {flags: 'w', }): {write: function() {}, end: function() {}};
        wrstream.write(sprintf("#%d channels:\n", m_top_Channels.children.length));
        m_top_Channels.children.forEach(function(child, inx) //NOTE: ignore output order
        {
            if (child.attr.color === 0) throw "ch# " + (m_chcolors.count + 1) + "  is black, won't show up";
//            if (!(this instanceof Vixen2Sequence)) throw "Wrong this type";
//            if (!(this instanceof Vixen2Profile)) throw "Wrong this type";
//TODO?            var color = Color().rgba; color.a *= 255;
            var line = this.channels[child.value || '??'] = {name: child.value, enabled: child.attr.enabled == "True" /*|| true*/, index: 1 * child.attr.output || inx, color: child.attr.color? '#' + (child.attr.color >>> 0).toString(16).substr(-6): '#FFF'};
//            /*var line =*/ this.channels[child.value || '??'] = {/*name: child.value,*/ enabled: child.attr.enabled == "True" /*|| true*/, index: inx, output: 1 * child.attr.output || inx, color: '#' + (child.attr.color >>> 0).toString(16).substr(-6) /*|| '#FFF'*/, };
            wrstream.write(sprintf("'%s': %s,\n", child.value || '??', JSON.stringify(line)));
            m_chcolors.push(((child.attr.color || 0xFFFFFF) << 8 | 0xFF) >>> 0); //full alpha; //Color(line.color));
        }.bind(this));
        wrstream.end('#eof\n');
    }
//    var buf = '';
//    m_chcolors.forEach(function(color) { buf += ', #' + color.toString(16); });
//    console.log("%d channels, ch colors: ".cyan, m_chcolors.length, buf.slice(2)); //m_chcolors);
//    console.log("channels", m_top_Channels);
    if (chk && (m_chcolors.length < 1)) throw "No channels found?";
    if (chk && (m_chcolors.length != this.channels.length)) throw "Missing channels? found " + m_chcolors + ", expected " + m_numch;
    return m_chcolors;
}


//convert rgba color to hsv and then dim it:
var rgba_split = new Buffer([255, 255, 255, 255]);
function dim(rgba, brightness)
{
    rgba_split.writeUInt32BE(rgba, 0);
//    if (rgba_split[3] != 255) throw "Unusual color: " + rgba;
    var c = Color({r: rgba_split[0], g: rgba_split[1], b: rgba_split[2], a: rgba_split[3]}); //color >> 24, g: color >> 16));
//TODO?   c = Color(hex8(rgba)).hsv(); c.v *= brightness/255; c = c.rgba(); c.a *= 255;
    c = c.darken(100 * (255 - brightness) / 255).toRgb(); //100 => completely dark
    rgba_split[0] = c.r; rgba_split[1] = c.g; rgba_split[2] = c.b; rgba_split[3] = c.a * 255; //1.0 => 255
    return rgba_split.readUInt32BE(0); //>>> 0;
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// XML helpers
//

function parse(str)
{
    var doc = new xmldoc.XmlDocument(str);
    var xml = traverse({}, doc);
    if (xml.children.length != 1) throw (xml.children.length? "Ambiguous": "Missing") + " top-level node";
    return xml.children[0]; //return top-level node
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


//eof
