//Vixen2 Sequence with custom mapping
'use strict';

var path = require('path');
var glob = require('glob');
var vix2 = require('my-projects/shared/vixen2');
var bufdiff = require('my-plugins/utils/buf-diff');
var inherits = require('inherits');

var MappedSequence = module.exports.Sequence = function(opts)
{
    if (!(this instanceof MappedSequence)) return new (MappedSequence.bind.apply(MappedSequence, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    vix2.Sequence.apply(this, arguments);

    var m_buffers = [], m_ff = 0;
    for (var i = 0; i < 2; ++i) m_buffers.push(new Buffer(this.channels.length)); //425
    this.render = function(frtime, buf)
    {
        var vix2buf = m_buffers[m_ff ^= 1]; //alternating buffers for diff
        this.getFrame(Math.floor(frtime / this.fixedInterval), vix2buf); //first get Vixen2 frame
        var dirty = !frtime || bufdiff(m_buffers[0], m_buffers[1]); //this.prevbuf.compare(buf);
        if (dirty) //render mapped data
        {
            Model.all.forEach(function(model, inx, all)
            {
                model.vix2set(frtime, vix2buf); //set this.frtime, this.buf, this.dirty
                model.render_renxt();
            });
            vix2.Sequence.prototype.render.call(this, frtime, buf);
        }
//        return {frnext: Math.min(frtime + this.fixedInterval, this.duration), dirty: dirty, buf: dirty? frbuf: undefined};
    }
}
inherits(MappedSequence, vix2.Sequence);


require('my-plugins/my-extensions/object-enum');

var GroupNames =
{
    timing: '^Timing|^Beat', //2 beat + 2x (lsb, mid, msb) = 8
    unused: 'unused|spare|dead|^blank|^Channel|^was color HC',
    floods: '^Flood ', //2 copies x 4 x RGBW = 32
//    af: '^ArchFan ',
    arches: '^ArchFan [0-9.]+A',
    fans: '^ArchFan [0-9.]+F',
    colL: '^(HC )?Column L',
    colM: '^(HC )?Column M',
    colR: '^(HC )?Column R',
    she_bank: '^(She|Cane).* Bank ',
    shep: '^Shep ',
    sheep: '^Sheep ',
    mtree_bank: '^Mtree .* Bank[AB] ',
    mtree: '^Mtree ',
    tuneto: '^Tune To',
    tb: '^Tree Ball ',
    ab: '^AngelBell ',
    angel: '^Angel ',
    gift: '^(Hidden )?Gift |^CityHills',
    ic: '^Chasecicle ',
    star: '^Star ',
    acc_bank: '^Acc Bank ',
    acc: 'FPArch|Instr|Sidewalk|Heart',
    nat: '^Mary|^Joseph|^Cradle|^Cross|^King |Stable|^Fireplace|^donkey',
    fx: '^fx',
    gdoor: '^Gdoor', //vix2
    snglobe: '^Snglobe',
    gdoor_rgb_L: '^Lgdoor ',
    gdoor_rgb_R: '^Rgdoor ',
    snglobe_rgb: '^Snglobe \\[',
};

GroupNames.forEach(function(pattern, inx, ary)
{
    ary[inx] = new RegExp(pattern, 'i'); //avoid repetitive regex creation by converting once at start
});


var chmap = {}, mapped = 0;
function map(group, inx)
{
    if (!chmap[group]) chmap[group] = {length: 0};
    chmap[group][inx] = vix2pro.channels[inx];
    delete vix2pro.channels[inx];
    ++chmap[group].length;
    ++mapped;
//    --vix2pro.channels.length;
}

function profile(pro)
{
//if (vix2pro) for (var chname in vix2pro.channels) //.forEach(function(ch, chname)
    vix2pro.channels.forEach(function(ch, chname)
    {
//    var ch = vix2pro.channels[chname];
//    if (typeof ch !== 'object') return; //continue;
//    if (chname.match(/unused|spare|dead|^Channel/)) { map('unused', chname); continue; } //{ ++unused; delete vix2pro.channels[inx]; --vix2pro.channels.length; continue; }
        var notfound = GroupNames.every(function(re, grpname)
        {
            var matches;
            if (matches = chname.match(re)) { map(grpname, chname); return false; } //break;
            return true; //continue
        });
        if (notfound) console.log("unmapped channel[%s/%s]: %j", chname, vix2pro.channels.length, ch);
    });
}

function show_group(name, range_check)
{
    chmap[name].forEach(function(ch, chname, grp)
    {
        console.log("%s[%s/%s]: %j", name, chname, grp.length, ch);
    });
    var okch = {};
    var ranges = Array.from(arguments).slice(1);
    if (!ranges.length) return;
//    var minch = 9999, maxch = 0;
    ranges.forEach(function(range, inx)
    {
        if (!Array.isArray(range) /*typeof range !== 'object'*/) range = [range, +0];
        for (var ch = range[0]; ch <= range[0] + range[1]; ++ch) okch[ch] = inx;
    });
    var ok = chmap[name].every(function(ch, chname, grp)
    {
//        if (ch.index < minch) minch = ch.index;
//        if (ch.index > maxch) maxch = ch.index;
        if (typeof okch[ch.index] !== 'undefined') return true;
        console.log("BAD RANGE [%s/%s]: %j".red, chname, grp.length, ch);
        return false;
    });
    if (ok) console.log("%s RANGE OK".green, name);
    else throw name + " RANGE BAD";
}


var vix2pro = vix2.Profile(glob.sync(path.join(__dirname, '**', '!(*RGB*).pro'))[0]);
if (vix2pro) profile(vix2pro);

//var unused = (chmap.unused || []).length + (chmap.spare || []).length + (chmap.dead || []).length + (chmap.Channel || []).length;
console.log("%d/%d unused (%d%%)"[(chmap.unused || []).length? 'red': 'green'], (chmap.unused || []).length, vix2pro.channels.length, Math.round(100 * (chmap.unused || []).length / vix2pro.channels.length));
console.log("%d/%d unmapped ch remain (%d%%)"[(mapped != vix2pro.channels.length)? 'red': 'green'], vix2pro.channels.length - mapped, vix2pro.channels.length, Math.round(100 * (vix2pro.channels.length - mapped) / vix2pro.channels.length));
if (false) chmap.forEach(function(chgrp, grpname)
{
    console.log("mapped group '%s' contains %d channels", grpname, chgrp.length);
});

/*
chmap = {}; mapped = 0;
vix2pro = vix2.Profile(glob.sync(path.join(__dirname, '**', '*RGB*.pro'))[0]);
if (vix2pro) profile(vix2pro);
console.log("%d/%d unused (%d%%)"[(chmap.unused || []).length? 'red': 'green'], (chmap.unused || []).length, vix2pro.channels.length, Math.round(100 * (chmap.unused || []).length / vix2pro.channels.length));
console.log("%d/%d unmapped ch remain (%d%%)"[(mapped != vix2pro.channels.length)? 'red': 'green'], vix2pro.channels.length - mapped, vix2pro.channels.length, Math.round(100 * (vix2pro.channels.length - mapped) / vix2pro.channels.length));
chmap.forEach(function(chgrp, grpname)
{
    console.log("mapped group '%s' contains %d channels", grpname, chgrp.length);
});
*/


function ChannelPool(opts)
{
    if (!(this instanceof ChannelPool)) return new (ChannelPool.bind.apply(ChannelPool, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    var add_prop = function(name, value) //expose prop but leave it read-only
    {
//        console.log("this is ", this, this.constructor.name, this.constructor + '');
//        if (thing[name]) return; //already there
        Object.defineProperty(this, name, {value: value});
//        console.log("extended %s with %s".blue, thing.constructor.name, name);
    }.bind(this);

    add_prop('opts', (typeof opts !== 'object')? {name: opts}: opts || {});
    add_prop('name', this.opts.name || 'UNKNOWN');
    var m_last_adrs = 0;
    this.getadrs = function(count)
    {
        if (typeof count === 'undefined') count = 1; //default but allow caller to specify 0
        return m_last_adrs += count;
    }
    var m_numch = 0;
    this.getch = function(count)
    {
        if (typeof count === 'undefined') count = 16; //default but allow caller to specify 0
        return (m_numch += count) - count;
    }
    var m_buf = null; //CAUTION: delay alloc until all ch counts known
    add_prop('buf', function()
    {
        if (!m_numch) throw "Chpool: no channel buffer needed";
        console.log("chpool: %s buf len %d", m_numch, m_buf? "return": "alloc");
        if (!m_buf) m_buf = new Buffer(m_numch);
        return m_buf;
    });
    this.alloc = function(model, opts)
    {
//    debugger;
        if (m_buf) throw "Chpool buffer already allocated";
        if (!(this instanceof ChannelPool)) throw "Don't call ChannelPool.alloc with \"new\"";
//        var m_opts = (typeof opts !== 'object')? {numch: opts}: opts || {};
//        m_opts.chpool = this;
////        ++chpool.last_adrs;
//        var retval = new model(m_opts); //{adrs: chpool.last_adrs, startch: chpool.numch, getbuf: chpool.getbuf});
////        chpool.numch += numch;
//        return retval;
        var args = Array.prototype.slice.call(arguments, 1); //Array.from(arguments); args.shift()
        args[0] = (typeof args[0] !== 'object')? {first_param: args[0]}: args[0] || {};
        args[0].chpool = this; //NOTE: "this" needs to refer to parent ChannelPool here
//        console.log("alloc model args", args);
        return model.apply(null, args);
    }
}

var inherits = require('inherits');

//var Model = require('my-projects/models/base_model');
function Model(opts)
{
//    console.log("model args", arguments);
    if (!(this instanceof Model)) return new (Model.bind.apply(Model, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    var add_prop = function(name, value) //expose prop but leave it read-only
    {
//        console.log("this is ", this, this.constructor.name, this.constructor + '');
        Object.defineProperty(this, name, {value: value});
    }.bind(this);

    add_prop('opts', opts); //preserve unknown options for subclasses
//    console.log("model opts %j", opts);
//    var chpool = opts.chpool;
    add_prop('adrs', opts.chpool.getadrs());
    add_prop('numch', opts.numch || 16);
    add_prop('startch', opts.chpool.getch(this.numch));
//    this.getbuf = function opts.getbuf;
    var m_buf = null; //CAUTION: don't alloc until all ch assigned
    add_prop('buf', function()
    {
        if (!m_buf) m_buf = opts.chpool.buf.slice(this.startch, this.numch);
        return m_buf;
    });
    if (!Model.all) Model.all = [];
    Model.all.push(this);
}

//Model.prototype.render = function(force_dirty)
//{
//    if (!this.dirty && !force_dirty) return;
//}


function Single0D(opts)
{
    if (!(this instanceof Single0D)) return new (Single0D.bind.apply(Single0D, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    var args = Array.from(arguments);
    args[0] = (typeof args[0] !== 'object')? {numch: args[0]}: args[0] || {};
    if (!args[0].numch) args[0].numch = args[0].w || 1;
    Model.apply(this, args);
}
inherits(Single0D, Model);

function Strip1D(opts)
{
    if (!(this instanceof Strip1D)) return new (Strip1D.bind.apply(Strip1D, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    var args = Array.from(arguments);
    args[0] = (typeof args[0] !== 'object')? {numch: args[0]}: args[0] || {};
    if (!args[0].numch) args[0].numch = args[0].w || 8; //16F688 typically drives 8 channels, so use that as default
    Model.apply(this, args);
}
inherits(Strip1D, Model);


function Rect2D(opts) //w, h, more_args)
{
//    console.log("rect2d args", arguments);
//    console.log("fiixup", [null].concat.apply(arguments));
//    console.log("fix2", [null].concat(Array.from(arguments)));
    if (!(this instanceof Rect2D)) return new (Rect2D.bind.apply(Rect2D, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    var args = Array.from(arguments);
    args[0] = (typeof args[0] !== 'object')? {numch: args[0]}: args[0] || {};
    if (!args[0].numch) args[0].numch = (args[0].w || 16) * (args[0].h || 16); //16 x 16 is good for simple icons, so use that as default
    Model.apply(this, args);
}
inherits(Rect2D, Model);


function AddVix2Methods(model)
{
    var vix2ch = Array.isArray(model.opts.vix2ch)? model.opts.vix2ch: [model.opts.vix2ch, +0];
    var vix2alt = Array.isArray(model.opts.vix2alt)? model.opts.vix2alt: model.opts.vix2alt? [model.opts.vix2alt, +0]: null;
    model.vix2set = function(frtime, vix2buf)
    {
//    var vix2ch = chbuf.slice(400, 16);
//    var dirty = this.buf.compare(vix2ch);
//    chbuf.copy(this.buf, 0, 400); //slice(400, 16);
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
        var chbuf = vix2buf.slice(vix2ch[0], vix2ch[1]); //this.opts.vix2ch[0], this.opts.vix2ch[1]);
        var altbuf = vix2alt? vix2buf.slice(vix2alt[0], vix2alt[1]): null; //this.opts.vix2alt? chbuf.slice(this.opts.vix2alt[0], this.opts.vix2alt[1]): null;
        if (altbuf && altbuf.compare(chbuf)) console.log("Vixen2 alt buf %j doesn't match %j".red, /*this.opts.*/vix2alt, /*this.opts.*/vix2ch);
        if (this.buf.compare(chbuf)) { this.dirty = true; chbuf.copy(this.buf); }
        this.frtime = frtime;
    }.bind(model);
}

/*use ChannelPool.alloc factory instead
ChannelPool.prototype.Rect2D = function(args)
{
    console.log("chpool.p.rect2d args %j", arguments);
//no    if (!(this instanceof ChannelPool.prototype.Rect2D)) return new (ChannelPool.prototype.Rect2D.bind.apply(ChannelPool.prototype.Rect2D, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
Rect2D;
    if (this instanceof ChannelPool.prototype.Rect2D) throw "Don't call this with \"new\"";
    var args = Array.from(arguments);
    args[0] = (typeof args[0] !== 'object')? {first_param: args[0]}: args[0] || {};
    args[0].chpool = this; //NOTE: "this" needs to refer to parent ChannelPool here
//    args.unshift(null);
//    return new (Rect2D.bind.apply(Rect2D, args))();
    Rect2D.apply(this, args);
}
//no inherits(ChannelPool.prototype.Rect2D, Rect2D);
*/

var aport = new ChannelPool('generic');


//show_group('floods', [282, +15], [400, +15]);
var floods = aport.alloc(Rect2D, {w: 4, h: 4, vix2ch: [282, +15], vix2alt: [400, +15]}); //, chpool: aport}); //new Model();

//Model.prototype.render = function(force_dirty)
//{
//    if (!this.dirty && !force_dirty) return;
//}


//show_group('ic', [2, +13]);
var ic = aport.alloc(Strip1D, {w: 14, vix2ch: [2, +13]});

//show_group('ab', [16, +23]);
var ab = aport.alloc(Rect2D, {w: 3, h: 8, vix2ch: [16, +23], body: +0, wings: +1, bell: +2});

//show_group('angel', [40, +2]);
var angel = aport.alloc(Strip1D, {w: 3, vix2ch: [40, +2], body: 40, wings: 41, trumpet: 42});

//show_group('star', [43, +2]);
var angel = aport.alloc(Strip1D, {w: 3, vix2ch: [43, +2], aura_B: 43, inner_Y: 44, outer_W: 45});

//show_group('mtree', [47, +23]);
var mtree = aport.alloc(Strip1D, {w: 24, vix2ch: [47, +23]});
//show_group('mtree_bank', [71, +3]);
var mtree_bank = aport.alloc(Strip1D, {w: 4, vix2ch: [71, +3], onA_BW_offA_GR: 71, onA_RW_offA_GB: 72, onB_BW_offB_GR: 73, onB_RW_offB_GB: 74});

//show_group('nat', 46, [83, +7], 232);
var cross = aport.alloc(Single0D, {numch: 1, vix2ch: 46, cross: 46});
var nat = aport.alloc(Strip1D, {w: 9, vix2ch: [83, +7], mary: 83, joseph: 84, cradle: 85, stable: 86, king_R1: 87, king_B2: 88, king_G3: 89, fireplace: 90});
var donkey = aport.alloc(Single0D, {numch: 1, vix2ch: 232, donkey: 232});

//show_group('tb', [75, +1]);
var tb = aport.alloc(Strip1D, {w: 2, vix2ch: [75, +1], ball1: 75, ball2: 76});

//show_group('gift', [77, +4], 82);
var gift = aport.alloc(Strip1D, {w: 6, vix2ch: [77, +4], gift_1M: 77, gift_2R: 78, gift_3B_top: 79, gift_3B_bot: 80, tags: 81});
var city = aport.alloc(Single0D, {numch: 1, vix2ch: 82, city: 82});

//show_group('shep', [103, +3]);
var shep = aport.alloc(Strip1D, {w: 4, vix2ch: [103, +3], shep_1guitar: 103, shep_2drums: 104, shep_3oboe: 105, shep_4sax: 106});
//show_group('sheep', [107, +5]);
var sheep = aport.alloc(Strip1D, {w: 6, vix2ch: [107, +5], sheep_1: 107, sheep_2: 108, sheep_3cymbal: 109, sheep_4: 110, sheep_5snare: 111, sheep_6tap: 112});
//show_group('she_bank', [113, +3]);
var she_bank = aport.alloc(Strip1D, {w: 4, vix2ch: [113, +3], onShep_RG_offShep_WB: 113, onCane: 114, onSh_BG_offSh_WR: 115, onSheep_RB_offSheep_WG: 116});

//show_group('acc', [96, +4]);
var acc = aport.alloc(Strip1D, {w: 5, vix2ch: [96, +4], guitar_1: 96, stick_2a: 97, stick_2b: 98, oboe: 99, sax: 100});
//show_group('acc_bank', [101, +1]);
var acc_bank = aport.alloc(Strip1D, {w: 2, vix2ch: [101, +1], on23_off01: 101, on13_off02: 102});

//show_group('col', [181, +23]);
//var cols = aport.alloc(Strip2D, {w: 3, h: 8, vix2ch: [181, +23], noop: [181, 182, 189, 197, 198]});
//show_group('colL', [181, +7]);
var colL = aport.alloc(Strip1D, {w: 6, vix2ch: [183, +5], top: 183, bottom: 188});
//show_group('colM', [189, +7]);
var colM = aport.alloc(Strip1D, {w: 7, vix2ch: [190, +6], top: 190, bottom: 196});
//show_group('colR', [197, +7]);
var colR = aport.alloc(Strip1D, {w: 6, vix2ch: [199, +5], top: 199, bottom: 204});

//show_group('tuneto', 205);
var tuneto = aport.alloc(Single0D, {numch: 1, vix2ch: 205, tuneto: 205});

//show_group('af', [117, +63]);
//show_group('arches', [117, +31]);
//show_group('fans', [149, +31]);
//var af = aport.alloc(Rect2D, {w: 8, h: 8, vix2ch: [117, +63]});
var arches = aport.alloc(Rect2D, {w: 8, h: 4, vix2ch: [117, +31]});
var fans = aport.alloc(Rect2D, {w: 8, h: 4, vix2ch: [133, +31]});

//show_group('gdoor', [298, +1], [416, +1]);
var gdoor = aport.alloc(Strip1D, {w: 2, vix2ch: [298, +1], vix2alt: [416, +1], macro: +0, bitmap: +1});
//show_group('snglobe', [300, +1], [418, +1]);
var snglobe = aport.alloc(Strip1D, {w: 2, vix2ch: [300, +1], vix2alt: [418, +1], macro: +0, bitmap: +1});
//show_group('fx', [395, +4]);
var fx = aport.alloc(Strip1D, {w: 5, vix2ch: [395, +4], color_a: 395, color_r: 396, color_g: 397, color_b: 398, text: 399});

Model.all.forEach(function(model, inx)
{
    AddVix2Methods(model);
});

//eof
