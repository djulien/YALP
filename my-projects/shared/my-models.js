//YALP custom hardware + model setup

'use strict'; //help catch errors

var path = require('path');
var caller = require('my-plugins/utils/caller').stack;
var hfmt = require('human-format');
function not_hfmt(val, scale) { return val; }
var makenew = require('my-plugins/utils/makenew');
var inherits = require('inherits');
require('my-plugins/my-extensions/object-enum');

module.exports.Playlist = CustomPlaylist;
module.exports.Sequence = CustomSequence;
//module.exports.ChannelPools = ChannelPools;
module.exports.Ports = PortBase;


///////////////////////////////////////////////////////////////////////////////////////////////////////
// Custom playlist extensions:

var Playlist = require('my-projects/shared/playlist'); //base class
function CustomPlaylist(opts)
{
    if (!(this instanceof CustomPlaylist)) return makenew(CustomPlaylist, arguments);
    Playlist.apply(this, arguments);
    console.log("TODO: sequence extensions: if (glob(*.vix|*.fseq)load; ??");
}
inherits(CustomPlaylist, Playlist);


///////////////////////////////////////////////////////////////////////////////////////////////////////
// Custom sequence extensions:

var vix2 = require('my-plugins/adapters/vixen2');
var xlnc3 = require('my-plugins/adapters/xlights3');

var Sequence = require('my-projects/shared/sequence'); //base class
function CustomSequence(opts)
{
//    console.log("custom seq args", arguments);
    if (!(this instanceof CustomSequence)) return makenew(CustomSequence, arguments);
//    debugger;
//    var parent = caller(1);
//    if (parent == __filename) parent = caller(2);
//    for (var i = 0; i < 5; ++i) console.log("seq caller(%d) %s", i, caller(i));
    var seq, args = arguments;
    args[0] = (typeof opts !== 'object')? {param: opts}: opts || {};
    if (!args[0].folder) args[0].folder = path.dirname(caller(1, __filename));
//    console.log("custom seq folder ", args[0].folder);
//    [vix2, xlnc3].forEach(function(adapter)
    /*try*/ { return new makenew(vix2.Sequence, args); }
//    catch (exc) { console.log("nope vix2, try next".red, exc); };
    try { return new makenew(xlnc3.Sequence, args); }
    catch (exc) { console.log("nope xlnc3, try uncustomized".red, exc); };
    Sequence.apply(this, args);
}
inherits(CustomSequence, Sequence);


///////////////////////////////////////////////////////////////////////////////////////////////////////
// Vixen2 profile mapping:

var vix2 = require('my-plugins/adapters/vixen2');

//analyze old Vixen2 profiles:
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
function profile(pro)
{
//if (vix2prof) for (var chname in vix2prof.channels) //.forEach(function(ch, chname)
    vix2prof.channels.forEach(function(ch, chname)
    {
//    var ch = vix2prof.channels[chname];
//    if (typeof ch !== 'object') return; //continue;
//    if (chname.match(/unused|spare|dead|^Channel/)) { map('unused', chname); continue; } //{ ++unused; delete vix2prof.channels[inx]; --vix2prof.channels.length; continue; }
        var notfound = GroupNames.every(function(re, grpname)
        {
            var matches;
            if (matches = chname.match(re)) { map(grpname, chname); return false; } //break;
            return true; //continue
        });
        if (notfound) console.log("unmapped channel[%s/%s]: %j", chname, vix2prof.channels.length, ch);
    });

    function map(group, inx)
    {
        if (!chmap[group]) chmap[group] = {length: 0};
        chmap[group][inx] = vix2prof.channels[inx];
        delete vix2prof.channels[inx];
        ++chmap[group].length;
        ++mapped;
//    --vix2prof.channels.length;
    }
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
        if (!Array.isArray(range) /*typeof range !== 'object'*/) range = [range, +1];
        for (var ch = range[0]; ch < range[0] + range[1]; ++ch) okch[ch] = inx;
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


//NOTE: assume parent is playlist, and vix2 profiles are in same folder:
var vix2prof = vix2.Profile(path.join(module.parent.filename, '..', '**', '!(*RGB*).pro'));
if (!vix2prof) throw "no Vixen2 profile";
profile(vix2prof);

//var unused = (chmap.unused || []).length + (chmap.spare || []).length + (chmap.dead || []).length + (chmap.Channel || []).length;
console.log("%d/%d unused (%d%%)"[(chmap.unused || []).length? 'red': 'green'], (chmap.unused || []).length, vix2prof.channels.length, Math.round(100 * (chmap.unused || []).length / vix2prof.channels.length));
console.log("%d/%d unmapped ch remain (%d%%)"[(mapped != vix2prof.channels.length)? 'red': 'green'], vix2prof.channels.length - mapped, vix2prof.channels.length, Math.round(100 * (vix2prof.channels.length - mapped) / vix2prof.channels.length));
//if (false)
chmap.forEach(function(chgrp, grpname)
{
    console.log("mapped group '%s' contains %s channels".blue, grpname, chgrp.length);
});

/*
chmap = {}; mapped = 0;
vix2prof = vix2.Profile(glob.sync(path.join(__dirname, '**', '*RGB*.pro'))[0]);
if (vix2prof) profile(vix2prof);
console.log("%d/%d unused (%d%%)"[(chmap.unused || []).length? 'red': 'green'], (chmap.unused || []).length, vix2prof.channels.length, Math.round(100 * (chmap.unused || []).length / vix2prof.channels.length));
console.log("%d/%d unmapped ch remain (%d%%)"[(mapped != vix2prof.channels.length)? 'red': 'green'], vix2prof.channels.length - mapped, vix2prof.channels.length, Math.round(100 * (vix2prof.channels.length - mapped) / vix2prof.channels.length));
chmap.forEach(function(chgrp, grpname)
{
    console.log("mapped group '%s' contains %d channels", grpname, chgrp.length);
});
*/


///////////////////////////////////////////////////////////////////////////////////////////////////////
// Canvas (logical devices):
// A master canvas is created for whole-house effects.
// Portions of master canvas are assigned to each model similar to Million Dollar Home Page
// This allows models to be fx targets and overlap as desired
// Each model is analogous to a DMX "universe", except they can be any number of nodes
// Models are also assigned to Vixen2 and xLights/Nutcracker 3 channels in order to allow those sequences to be run as-is or augmented

var Model2D = module.exports.models = require('my-projects/models/model-2d');

//NOTE: set zinit to false to allow smoother xition from previous seq
//NOTE: vixch should match profile info from above

//use this model for entire-house fx:
var entire = new Model2D('tutorial'); //.fill(toRGBA(11, 22, 33));


//use bottom row of canvas for virtual fx:

//show_group('fx', [395, +5]);
var fx = new entire.Model2D({name: 'fx', x: 0, y: 0, w: 5, h: 1, zinit: false, vix2ch: [395, +5], color_a: 395, color_r: 396, color_g: 397, color_b: 398, text: 399});
fx.vix2render = function() {} //TODO

//show_group('snglobe', [300, +2], [418, +2]);
var snglobe_fx = new entire.Model2D({name: 'snglobe', y: 0, w: 2, zinit: false, vix2ch: [300, +2], vix2alt: [418, +2], macro: +0, bitmap: +1});
snglobe_fx.vix2render = function() {} //TODO

var gdoor_fx = new entire.Model2D({name: 'gdoor-fx', y: 0, w: 2, zinit: false, vix2ch: [298, +2], vix2alt: [416, +1], macro: +0, bitmap: +1});
gdoor_fx.vix2render = function() {} //TODO


//archfans near bottom:
//var archfans = new entire.Model2D({name: 'TODO: AF', x: 0, y: 1, w: 4 * 8, h: 8});
/*
//show_group('af', [117, +64]);
//show_group('arches', [117, +32]);
//show_group('fans', [149, +32]);
//var af = aport.alloc(Rect2D, {name: 'af', w: 8, h: 8, zinit: false, vix2ch: [117, +64]});
var arches = wport.alloc(Rect2D, {name: 'arches', w: 8, h: 4, zinit: false, vix2ch: [117, +32]});
arches.vix2render = function() {} //TODO
var fans = wport.alloc(Rect2D, {name: 'fans', w: 8, h: 4, zinit: false, vix2ch: [133, +32]});
fans.vix2render = function() {} //TODO

//show_group('tuneto', 205);
var tuneto = wport.alloc(Single0D, {name: 'tune-to', numch: 1, zinit: false, vix2ch: 205, tuneto: 205});
tuneto.vix2render = function() {} //TODO
*/


//nat figures next row:
//var nat = new entire.Model2D({name: 'TODO: Nat-fig', x: 0, y: 9, w: 4 * 12, h: 24});

/*
//show_group('shep', [103, +4]);
var shep = bport.alloc(Strip1D, {name: 'shep', w: 4, zinit: false, vix2ch: [103, +4], shep_1guitar: 103, shep_2drums: 104, shep_3oboe: 105, shep_4sax: 106});
shep.vix2render = function() {} //TODO
//show_group('sheep', [107, +6]);
var sheep = bport.alloc(Strip1D, {name: 'sheep', w: 6, zinit: false, vix2ch: [107, +6], sheep_1: 107, sheep_2: 108, sheep_3cymbal: 109, sheep_4: 110, sheep_5snare: 111, sheep_6tap: 112});
sheep.vix2render = function() {} //TODO
//show_group('she_bank', [113, +4]);
var sh_bank = bport.alloc(Strip1D, {name: 'sh-bank', w: 4, zinit: false, vix2ch: [113, +4], onShep_RG_offShep_WB: 113, onCane: 114, onSh_BG_offSh_WR: 115, onSheep_RB_offSheep_WG: 116});
sh_bank.vix2render = function() {} //TODO
*/

/*
//show_group('nat', 46, [83, +8], 232);
var cross = wport.alloc(Single0D, {name: 'cross', numch: 1, zinit: false, vix2ch: 46, cross: 46});
cross.vix2render = function() {} //TODO
var nat = wport.alloc(Strip1D, {name: 'nat-people', w: 9, vix2ch: [83, +9], mary: 83, joseph: 84, cradle: 85, stable: 86, king_R1: 87, king_B2: 88, king_G3: 89, fireplace: 90});
nat.vix2render = function() {} //TODO
var donkey = wport.alloc(Single0D, {name: 'donkey', numch: 1, zinit: false, vix2ch: 232, donkey: 232});
donkey.vix2render = function() {} //TODO

//show_group('gift', [77, +5], 82);
var gift = wport.alloc(Strip1D, {name: 'gift', w: 6, zinit: false, vix2ch: [77, +5], gift_1M: 77, gift_2R: 78, gift_3B_top: 79, gift_3B_bot: 80, tags: 81});
gift.vix2render = function() {} //TODO
var city = wport.alloc(Single0D, {name: 'city', numch: 1, zinit: false, vix2ch: 82, city: 82});
city.vix2render = function() {} //TODO

//show_group('acc', [96, +5]);
var acc = wport.alloc(Strip1D, {name: 'acc', w: 5, zinit: false, vix2ch: [96, +5], guitar_1: 96, stick_2a: 97, stick_2b: 98, oboe: 99, sax: 100});
acc.vix2render = function() {} //TODO
//show_group('acc_bank', [101, +2]);
var acc_bank = wport.alloc(Strip1D, {name: 'acc-bank', w: 2, zinit: false, vix2ch: [101, +2], on23_off01: 101, on13_off02: 102});
acc_bank.vix2render = function() {} //TODO
*/


//gdoor, cols, tree, angel, gifts:

//show_group('gdoor', [298, +2], [416, +2]);
var gdoorL = entire.Model2D({name: 'gdoorL', x: 0, y: 33, w: 24, h: 16, zinit: false, order: Model2D.prototype.B2T_R2L, output: 'GRB'});
var gdoorR = entire.Model2D({name: 'gdoorR', y: 33, zinit: false, order: Model2D.prototype.B2T_L2R, output: 'GRB'});
var gdoor_all = entire.Model2D({name: 'gdoor-all', x: gdoorL.left, y: 33, w: gdoorR.right - gdoorL.left, zinit: false});

//show_group('col', [181, +24]);
var cols_LMRH = new entire.Model2D({name: 'cols-LMRH', y: 33, w: 42, h: 51, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB', parallel: true}); //, vix2ch: [181, +24], noop: [181, 182, 189, 197, 198]}); //w: 42, h: 51, numnodes: 3 * 80,
//show_group('colL', [181, +8]);
var colL = new entire.Model2D({name: 'colL', x: cols_LMRH.left, y: cols_LMRH.top - 37, w: 1, h: 37, zinit: false, vix2ch: [183, +6]}); //, adrs: cols_, startch: cols_LMR.startch}); //, top: 183, bottom: 188}); //overlay
colL.vix2render = function() {} //TODO
//show_group('colM', [189, +8]);
var colM = new entire.Model2D({name: 'colM', x: Math.round((cols_LMRH.left + cols_LMRH.right) / 2), y: cols_LMRH.top - 50, h: 50, zinit: false, vix2ch: [190, +7]}); //, startch: cols_LMR.startch, top: 190, bottom: 196});
colM.vix2render = function() {} //TODO
//show_group('colR', [197, +8]);
var colR = new entire.Model2D({name: 'colR', x: cols_LMRH.right - 1, y: cols_LMRH.top - 50, zinit: false, vix2ch: [199, +6]}); //, top: 199, bottom: 204});
colR.vix2render = function() {} //TODO

/*
//show_group('mtree', [47, +24]);
var mtree = gport.alloc(Strip1D, {name: 'mtree', w: 24, zinit: false, vix2ch: [47, +24]});
mtree.vix2render = function() {} //TODO
//show_group('mtree_bank', [71, +4]);
var mtree_bank = noport.alloc(Strip1D, {name: 'mtree-bank', w: 4, zinit: false, vix2ch: [71, +4], onA_BW_offA_GR: 71, onA_RW_offA_GB: 72, onB_BW_offB_GR: 73, onB_RW_offB_GB: 74});
mtree_bank.vix2render = function() {} //TODO
//show_group('tb', [75, +2]);
var tb = noport.alloc(Strip1D, {name: 'tb', w: 2, zinit: false, vix2ch: [75, +2], ball1: 75, ball2: 76});
tb.vix2render = function() {} //TODO

//show_group('angel', [40, +3]);
var angel = gport.alloc(Strip1D, {name: 'angel', w: 3, zinit: false, vix2ch: [40, +3], body: 40, wings: 41, trumpet: 42});
angel.vix2render = function() {} //TODO

//show_group('star', [43, +3]);
var star = noport.alloc(Strip1D, {name: 'star', w: 3, zinit: false, vix2ch: [43, +3], aura_B: 43, inner_Y: 44, outer_W: 45});
star.vix2render = function() {} //TODO
*/


//ic, floods, ab:
//function R2L(nested) { return ['R2L', nested, ]; }
//function T2B(nested) { return ['T2B', nested, ]; }
//function R2L_T2B(n)
//{
//    var col = this.R2L(Math.floor(n / this.height)), row = this.T2B(n % this.height);
//    return col * this.height + row;
//}
//var nodelist = [XY(32, 9..0), XY(31, 9..0), ..., XY(0, 9..0)];

Model2D.prototype.CustomX_T2B = function(x_ranges)
//CustomX_T2B = function(x_ranges)
{
//    console.log("custom t2b, mode", this, x_ranges.length, arguments.length);
    this.nodelist = []; //new Array(w * h);
    arguments.forEach(function(range)
    {
//        console.log("x range", range, range[0] + '++' + range[1], this.top + '--' + this.bottom, range[0] + '--' + range[1], this.top + '--' + this.bottom);
        for (var x = range[0]; x <= range[1]; ++x) //L->R
            for (var y = this.top - 1; y >= this.bottom; --y) //T->B
                this.nodelist.push(this.pixelXY(x, y));
        for (var x = range[0]; x >= range[1]; --x) //R->L
            for (var y = this.top - 1; y >= this.bottom; --y) //T->B
                this.nodelist.push(this.pixelXY(x, y));
    }.bind(this));
//    console.log("node list ", this.nodelist.length);
    return this.nodelist;
}

//show_group('ic', [2, +14]);
//NOTE: previous value of x, y, w, h is used if not specified
//debugger;
var ic1 = entire.Model2D({name: 'ic1', x: 0, y: 100, w: 33, h: 10, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //{from: 32, to: 0}, vorder: {from: 9: to: 0}});
var ic2 = entire.Model2D({name: 'ic2', y: 100, w: 30, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //[{from: 30, to: 1}]});
var ic3 = entire.Model2D({name: 'ic3', y: 100, w: 30, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //[{from: 30, to: 1}]});
var ic4 = entire.Model2D({name: 'ic4', y: 100, w: 24+8, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //[{from: 24+8, to: 1+8}, {from: 8, to: 1}]});
var ic5 = entire.Model2D({name: 'ic5', y: 100, w: 34, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //[{from: 34, to: 1}]});
//var icbig = entire.Model2D({name: 'icbig', y: 100, w: 15+33, zinit: false, order: Model2D.prototype.CustomX_T2B.bind(undefined, [15+33, 1+33], [1, 8], [33, 17], [9, 13], [16, 14]), output: 'GRB'}); //order: [{from: 15+33, to: 1+33}, {from: 1, to: 8}, {from: 33, to: 17}, {from: 9, to: 13}, {from: 16, to: 14}]});
var icbig = entire.Model2D({name: 'icbig', y: 100, w: 15+33, zinit: false, order: function() { Model2D.prototype.CustomX_T2B.bind(this, [15+33, 1+33], [1, 8], [33, 17], [9, 13], [16, 14])(); }, output: 'GRB'}); //order: [{from: 15+33, to: 1+33}, {from: 1, to: 8}, {from: 33, to: 17}, {from: 9, to: 13}, {from: 16, to: 14}]});
//var icbig = entire.Model2D({name: 'icbig', y: 100, w: 15+33, zinit: false, order: function() { (CustomX_T2B.bind(this, [15+33, 1+33], [1, 8], [33, 17], [9, 13], [16, 14]))(); }, output: 'GRB'}); //order: [{from: 15+33, to: 1+33}, {from: 1, to: 8}, {from: 33, to: 17}, {from: 9, to: 13}, {from: 16, to: 14}]});
var ic_all = entire.Model2D({name: 'ic-all', x: ic1.left, y: 100, w: icbig.right - ic1.left, zinit: false, vix2ch: [2, +14]}); //yport.alloc(IcicleSegment2D.all, {name: 'ic-all', x: 0, y: 0, w: 207, h: 10, zinit: false}); //CAUTION: must use same port as segments
ic_all.vix2render = function() {} //TODO

/*
//show_group('floods', [282, +16], [400, +16]);
var floods = gport.alloc(Rect2D, {name: 'floods', w: 4, h: 4, zinit: false, vix2ch: [282, +16], vix2alt: [400, +15]}); //, chpool: aport}); //new Model();
floods.vix2render = function() {} //TODO

//show_group('ab', [16, +24]);
var ab = wport.alloc(Rect2D, {name: 'ab', w: 3, h: 8, zinit: false, vix2ch: [16, +24], body: +0, wings: +1, bell: +2});
ab.vix2render = function() {} //TODO
*/

console.log("entire canvas: %d x %d (%s pixels)", entire.width, entire.height, hfmt(entire.width * entire.height, {scale: 'binary'}));
//summarize composite models:
Model2D.all.forEach(function(model)
{
    if (!(model.name || '').match(/-all$/i)) return;
    console.log("%s: %d x %d = %s pixels @(%d..%d, %d..%d)", model.name, model.width, model.height, not_hfmt(model.width * model.height, {scale: 'binary'}), model.left, model.right, model.bottom, model.top);
});


///////////////////////////////////////////////////////////////////////////////////////////////////////
// Ports (physical devices):
// Models are assigned to physical ports
// Protocols are assigned to ports

var streamBuffer = require('stream-buffers'); //https://github.com/samcday/node-stream-buffer
var serial = require('serialport'); //https://github.com/voodootikigod/node-serialport

//show list of available ports:
serial.list(function(err, ports)
{
    if (err) console.log("serial port enum ERR: %j".red, err);
    else console.log("found %d serial ports:".cyan, ports.length);
    (ports || []).forEach(function(port, inx)
    {
        console.log("  serial[%s/%s]: '%s' '%s' '%s'".cyan, inx, ports.length, port.comName, port.manufacturer, port.pnpId);
    });
});


//supported bit configs (chosen arbitrarily):
var CONFIG =
{
    '8N1': {dataBits: 8, parity: 'none', stopBits: 1},
};
const FPS = 20; //target 50 msec frame rate

function config(baud, bits, fps)
{
    var cfg = CONFIG[bits];
    if (!cfg) throw "Unhandled serial config: '" + bits + "'";
    cfg.baudrate = baud;
//    cfg.buffersize = Math.floor(baud / (1 + cfg.dataBits + cfg.stopBits + 1) / fps); //2048
    cfg.buffersize = 4096; //NOTE: ignore FPS restrictions to simplify special cases such as RenXt enum
}

function named(obj, name) { obj.name = obj.name || name || '(unnamed)'; return obj; } //makes debug easier

//port base class:
//only used to hold port and model collections currently
function PortBase(args)
{
//    if (!(this instanceof PortBase)) return makenew(PortBase, arguments);
//    streamBuffers.WritableStreamBuffer.apply(this, args);

    this.models = [];
    this.assign = function(model)
    {
//        console.log("assigned model '%s' to port '%s'", model.name, this.name || this.device);
        this.models.push(model);
//no; already done        model.port = this;
    }
//    var m_outbufs = [new Buffer(4096), new Buffer(4096)], m_ff = 0;
//    this.dirty = false;
    this.outbuf = new streamBuffer.WritableStreamBuffer(); //default size 8K; should be plenty
    this.render = function(frtime) //{buf, rawbuf, frnext}
    {
        console.log("port '%s' base render %d models", this.name, this.models.length);
//        var buf = null;
        this.outbuf.getContents(); //clear current contents
        var frnext_min = false; //assume no further frames are needed (no animation); //(this.FixedFrameInterval)? frtime + this.FixedFrameInterval: this.duration;
        this.models.forEach(function(model)
        {
            var frnext = model.render(frtime); //render new output if dirty, get next refresh time
            console.log("model '%s' render: frnext %s", this.name, frnext);
            if ((frnext === false) || (frnext === true)) return; //no next frame
            frnext_min = (frnext_min === false)? frnext: Math.min(frnext_min, frnext);
        }.bind(this));
        return {frnext: (frnext_min !== false)? frnext_min: undefined, buf: !!this.outbuf.getContents()};
    }

    if (!PortBase.all) PortBase.all = [];
    PortBase.all.push(this); //allows easier enum over all instances
}
//inherits(PortBase, streamBuffers.WritableStreamBuffer);


//simplified wrapper (sets param defaults):
function SerialPort(path, options, openImmediately, callback)
{
    if (!(this instanceof SerialPort)) return makenew(SerialPort, arguments);
//    serial.SerialPort.apply(this, arguments);
    serial.SerialPort.call(this, path, options || config(242500, '8N1', FPS), openImmediately || false, callback); //false => don't open immediately (default = true)
    PortBase.call(this, arguments); //faked multiple inheritance
    this.device = this.path;
    if (!SerialPort.all) SerialPort.all = [];
    SerialPort.all.push(this); //allows easier enum over all instances
}
inherits(SerialPort, serial.SerialPort);


function OtherPort(args)
{
    if (!(this instanceof OtherPort)) return makenew(OtherPort, arguments);
    if (!OtherPort.all) OtherPort.all = [];
    PortBase.call(this, arguments); //faked multiple inheritance
    OtherPort.all.push(this); //allows easier enum over all instances
}


//first define hardware ports:
var yport = named(new SerialPort('/dev/ttyUSB0'), 'FTDI-Y'); //2100 Ic + 150 Cols ~= 2250 nodes
var gport = named(new SerialPort('/dev/ttyUSB1'), 'FTDI-G'); //16 Floods + 1188 Mtree + 640 Angel + 384 Star (reserved) ~= 2228 nodes
var bport = named(new SerialPort('/dev/ttyUSB2'), 'FTDI-B'); //1536 Shep + 256 Gift (reserved) ~= 1792 nodes
var wport = named(new SerialPort('/dev/ttyUSB3'), 'FTDI-W'); //7 * 56 AC (5 * 56 unused) + 768 gdoor + 3 * 384 (AB-future) ~= 2312 nodes

//then assign protocol handlers:
//var RenXt = {AddProtocol: function(port) { console.log("TODO: assign RenXt protocol to port '%s'", port.name || port.device); }}; //require('my-plugins/hw/RenXt');
var RenXt = require('my-plugins/hw/RenXt');

SerialPort.all.forEach(function(port, inx)
{
//    if (!chpool.opts.device) return;
//    chpool.port = new serial.SerialPort(chpool.opts.device, config(242500, '8N1', FPS), false); //false => don't open immediately (default = true)
    RenXt.AddProtocol(port); //protocol handler
});


//var ChannelPool = require('my-projects/models/chpool');
//var chpools = module.exports.chpools =
//{
//    nullport: new ChannelPool('null'),
//    bport: new ChannelPool({name: 'FTDI-B', device: "/dev/ttyUSB0"}),
//    gport: new ChannelPool({name: 'FTDI-G', device: "/dev/ttyUSB1"}),
//    wport: new ChannelPool({name: 'FTDI-W', device: "/dev/ttyUSB2"}),
//    yport: new ChannelPool({name: 'FTDI-Y', device: "/dev/ttyUSB3"}),
//};
//var noport = /*xmas.ports.no_port =*/ new ChannelPool('no-hw'); //dummy port for fx or virt channels
//var yport = /*xmas.ports.FTDI_y =*/ new ChannelPool({name: 'FTDI-Y', device: '/dev/ttyUSB0'}); //2100 Ic + 150 Cols ~= 2250 nodes
//var gport = /*xmas.ports.FTDI_g =*/ new ChannelPool({name: 'FTDI-G', device: '/dev/ttyUSB1'}); //16 Floods + 1188 Mtree + 640 Angel + 384 Star (reserved) ~= 2228 nodes
//var bport = /*xmas.ports.FTDI_b =*/ new ChannelPool({name: 'FTDI-B', device: '/dev/ttyUSB2'}); //1536 Shep + 256 Gift (reserved) ~= 1792 nodes
//var wport = /*xmas.ports.FTDI_w =*/ new ChannelPool({name: 'FTDI-W', device: '/dev/ttyUSB3'}); //7 * 56 AC (5 * 56 unused) + 768 gdoor + 3 * 384 (AB-future) ~= 2312 nodes


debugger;
/*
var numext = [0, 0];
ChannelPool.all.forEach(function(chpool)
{
    console.log("ch pool '%s' has %s channels, %s models", chpool.name, chpool.numch, chpool.models.length);
    chpool.models.forEach(function(model, inx, all)
    {
        if (vix2.ExtendModel(model)) ++numext[0]; //allow Vixen2 channel values to be set/mapped
        ++numext[1];
    });
});
console.log("Vixen2 ch map: extended %d/%d models".yellow, numext[0], numext[1]);
*/

//assign models to ports:
[cols_LMRH, ic1, ic2, ic3, ic4, ic5, icbig].forEach(function(model, inx) { model.port = yport; });
//{
//    console.log("enum", model, inx, yport);
//    console.log("assign model '%s' to port '%s'", model.name, yport.name);
//    model.port = yport;
//});


//summary info:
var total_ports = 0, total_models = 0, total_nodes = 0;
function classname(thing) { return thing.constructor.name; } //.prototype.constructor.name
[SerialPort, OtherPort].forEach(function(porttype)
{
    var num_ports = 0, num_models = 0, num_nodes = 0;
    (porttype.all || []).forEach(function(port, pinx, all)
    {
        if (!(port.models || []).length) return;
        console.log("%s[%s/%s]: '%s', %s models:", classname(porttype), pinx, all.length, port.device, (port.models || []).length);
        ++num_ports;
        (port.models || []).forEach(function(model, minx)
        {
            console.log("  model[%s/%s]: '%s', canvas: x %s..%s, y %s..%s, w %s, h %s, nodes: %s", minx, port.models.length, model.name, model.left, model.right, model.bottom, model.top, model.width, model.height, (model.nodelist || []).length);
            num_nodes += (model.nodelist || []).length;
            ++num_models;
        });
    });
    total_ports += num_ports; total_models += num_models; total_nodes += num_nodes;
    console.log("#active %s: %d, #real models: %d, #nodes: %d, avg %d nodes/model, %d nodes/port", classname(porttype), num_ports, num_models, num_nodes, num_models? Math.round(num_nodes / num_models): 0, num_ports? Math.round(num_nodes / num_ports): 0);
});
console.log("total: active ports: %d, #real models: %d, #nodes: %d, avg %d nodes/model, %d nodes/port", total_ports, total_models, total_nodes, total_models? Math.round(total_nodes / total_models): 0, total_ports? Math.round(total_nodes / total_ports): 0);

Model2D.all.forEach(function(model, inx)
{
    console.log("model[%s/%s]: '%s' %s x %s, port '%s'", inx, Model2D.all.length, model.name, model.width, model.height, (model.port || {}).name || '(none)');
});


//eof
