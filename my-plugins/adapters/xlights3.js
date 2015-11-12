
'use strict';

require('colors'); //var colors = require('colors/safe'); //https://www.npmjs.com/package/colors; http://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
var fs = require('fs'); //'fs-extra');
//var assert = require('insist');
var inherits = require('inherits');
var makenew = require('my-plugins/utils/makenew');
var bufdiff = require('my-plugins/utils/buf-diff');
/*var sprintf =*/ require('sprintf.js'); //.sprintf;
var path = require('path');
//NOTE: async var xml2js = require('xml2js'); //https://github.com/Leonidas-from-XIV/node-xml2js
//var parser = new xml2js.Parser();
var xmldoc = require('xmldoc'); //https://github.com/nfarina/xmldoc
var glob = require('glob');
var shortname = require('my-plugins/utils/shortname');

function isdef(thing) { return (typeof thing !== 'undefined'); }

module.exports.Sequence = xLights3Sequence;


//console.log("TODO: move to mixin");
var Sequence = require('my-projects/shared/sequence'); //base class
function xLights3Sequence(opts)
{
//    console.log("xlnc3 seq opts", arguments);
    if (!(this instanceof xLights3Sequence)) return makenew(xLights3Sequence, arguments);
    var add_prop = function(name, value, vis) { if (!this[name]) Object.defineProperty(this, name, {value: value, enumerable: vis !== false}); }.bind(this); //expose prop but leave it read-only
//    var args = Array.from(arguments);
//    var m_opts = (typeof opts !== 'object')? {param: opts}: opts || {};
    Sequence.apply(this, arguments);

    var where, files;
    files = glob.sync(where = path.join(this.opts.folder, '**', '!(*-bk).{xml,xseq,fseq}'));
    if (!files.length) throw "Can't find xLights3 seq at " + where;
    if (files.length > 1) throw "Too many xLights3 seq found at " + where;
    add_prop('xlnc3filename', files[0]);
    var m_top = load(this.xlnc3filename);

//TODO:
    add_prop('isxLightsSeq', true);
    add_prop('duration', 1 * m_top.byname.Time.value); //msec
    add_prop('FixedFrameInterval', 1 * m_top.byname.EventPeriodInMilliseconds.value);
    var m_numfr = Math.ceil(this.duration / this.FixedFrameInterval);
    var partial = (m_numfr * this.FixedFrameInterval != this.duration);
    if (partial)
        console.log("'%s' duration: %d msec, interval %d msec, #frames %d, last partial? %d, #channels %d", shortname(this.vix2filename), this.duration, this.FixedFrameInterval, m_numfr, !!partial, (m_top.byname.Channels.children || []).length);
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
        if (!isdef(chinx)) return m_chvals.slice(frinx * m_numch, m_numch); //all ch vals for this frame
        return ((chinx < m_numch) && (frinx < m_numfr))? m_chvals[chinx * m_numfr + frinx]: 0; //single ch val
    }
//    debugger;
    var m_prevbuf;
    this.render = function(frtime)
    {
        var chvals = this.chvals(Math.floor(frtime / this.FixedFrameInterval));
        if (frtime && (this.opts.dedup !== false) && !bufdiff(chvals, m_prevbuf)) return {frnext: frtime + this.FixedFrameInterval, bufs: null}; //no change
        if (this.opts.dedup !== false) m_prevbuf = chvals;
        ChannelPool.all.forEach(function(chpool)
        {
            chpool.models.forEach(function(model, inx, all)
            {
                model.xlnc3set(frtime, chvals); //apply vix2 ch vals to model
            });
        });
        return Sequence.prototype.render.call(this, frtime);
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
        var m_audio = path.join(this.vixfilename, '..', m_top.byname.Audio.value);
        var m_audiolen = m_top.byname.Audio.attr.duration;
        if (m_top.byname.Audio.attr.filename != m_top.byname.Audio.value) console.log("audio filename mismatch: '%s' vs. '%s'".red, m_top.byname.Audio.attr.filename || '(none)', m_top.byname.Audio.value || '(none)');
        if (this.opts.audio !== false) this.addMedia(m_audio);
    }

//    console.log("loaded '%s'".green, filename);
//    console.log("audio '%s'".blue, seq.audio || '(none)');
    console.log("duration %s, interval %s, #fr %d, #ch %d, audio %s".blue, timescale(this.duration), timescale(m_interval), m_numfr, this.channels.length, m_audio);
    if (m_audiolen != this.duration) console.log("seq len %d != audio len %d".red, this.duration, m_audiolen);
//    this.setDuration(this.duration, "vix2");
//    if (m_opts.cues !== false) this.fixedInterval = m_interval; //addFixedFrames(vix2.interval, 'vix2');
//    console.log("opts.cues %s, fixint %s, vixint %s".cyan, opts.cues, this.fixedInterval, m_interval);

}
inherits(xLights3Sequence, Sequence);

//eof
