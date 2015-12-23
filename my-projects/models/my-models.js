
'use strict';

const path = require('path');
const hfmt = require('human-format');
const inherits = require('inherits');
function not_hfmt(val, scale) { return val; }
const dim = require('my-projects/models/color-fx').dim;
const hex = require('my-projects/models/color-fx').hex;
var bufdiff = require('my-plugins/utils/buf-diff');
require('my-plugins/my-extensions/array-ends');
const logger = require('my-plugins/utils/logger')();
/*var sprintf =*/ require('sprintf.js'); //.sprintf;

//function hex8(val) { return ('00000000' + (val >>> 0).toString(16)).slice(-8); }


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Vixen2 profile mapping, design-time info, etc:
//

const vix2 = require('my-plugins/streamers/vix2json');
const files =
[
    'my-projects/playlists/!(*RGB*).pro',
//    'my-projects/songs/xmas/Amaz*/*Amaz*.vix',
];

var vix2prof = new require('my-plugins/streamers/vix2json').Profile(files[0]);
//var vix2seq = new require('my-plugins/streamers/vix2json').Sequence({filename: files[1], profile: vix2prof});


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
    sh_bank: '^(She|Cane).* Bank ',
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
        if (notfound) logger("unmapped channel[%s/%s]: %j", chname, vix2prof.channels.length, ch);
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
        logger("%s[%s/%s]: %j", name, chname, grp.length, ch);
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
        logger("BAD RANGE [%s/%s]: %j".red, chname, grp.length, ch);
        return false;
    });
    if (ok) logger("%s RANGE OK".green, name);
    else throw name + " RANGE BAD";
}


//NOTE: assume parent is playlist, and vix2 profiles are in same folder:
var vix2prof = vix2.Profile(path.join('my-projects/playlists', '**', '!(*RGB*).pro'));
if (!vix2prof) throw "no Vixen2 profile";
profile(vix2prof);

//var unused = (chmap.unused || []).length + (chmap.spare || []).length + (chmap.dead || []).length + (chmap.Channel || []).length;
logger("%d/%d unused (%d%%)"[(chmap.unused || []).length? 'red': 'green'], (chmap.unused || []).length, vix2prof.channels.length, Math.round(100 * (chmap.unused || []).length / vix2prof.channels.length));
logger("%d/%d unmapped ch remain (%d%%)"[(mapped != vix2prof.channels.length)? 'red': 'green'], vix2prof.channels.length - mapped, vix2prof.channels.length, Math.round(100 * (vix2prof.channels.length - mapped) / vix2prof.channels.length));
//if (false)
chmap.forEach(function(chgrp, grpname)
{
    logger("mapped group '%s' contains %s channels".blue, grpname, chgrp.length);
});

/*
chmap = {}; mapped = 0;
vix2prof = vix2.Profile(glob.sync(path.join(__dirname, '**', '*RGB*.pro'))[0]);
if (vix2prof) profile(vix2prof);
logger("%d/%d unused (%d%%)"[(chmap.unused || []).length? 'red': 'green'], (chmap.unused || []).length, vix2prof.channels.length, Math.round(100 * (chmap.unused || []).length / vix2prof.channels.length));
logger("%d/%d unmapped ch remain (%d%%)"[(mapped != vix2prof.channels.length)? 'red': 'green'], vix2prof.channels.length - mapped, vix2prof.channels.length, Math.round(100 * (vix2prof.channels.length - mapped) / vix2prof.channels.length));
chmap.forEach(function(chgrp, grpname)
{
    logger("mapped group '%s' contains %d channels", grpname, chgrp.length);
});
*/


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// custom model definitions:
//

const Model2D = require('my-projects/models/model-2d');
module.exports.models = Model2D.all; //export all model instances from below
const RenXt = require('my-plugins/hw/RenXt');

//apply vix2prof.chcolors;
const WHITE = '#FCA'; //warm white to simulate incandescent bulbs

//RenXT chipiplexed SSRs:
//8 "rows" of 7 "columns" = 56 channels
function ACSSR(opts)
{
    if (!(this instanceof ACSSR)) return makenew(ACSSR, arguments);
    var opts = (typeof opts == 'string')? {name: opts}: opts || {};
    opts.output = 'mono';
    if (!opts.w) opts.w = 7;
    if (!opts.h) opts.h = 8;
    if (!opts.order) opts.order = Model2D.prototype.B2T_L2R;
    Model2D.apply(this, arguments); //base class
}
inherits(ACSSR, Model2D);


//show_group('fx', [395, +5]);
var macro_fx = new Model2D({name: 'macro-fx', x: 0, y: 0, w: 5, h: 1, zinit: false, vix2ch: [395, +5], color_a: 395, color_r: 396, color_g: 397, color_b: 398, text: 399});
macro_fx.vix2render = function(frtime, vix2buf)
{
//    this.textinx = vix2buf[399];
    switch (vix2buf[399])
    {
        case 0: break;
        case 100: this.text = "Testing, one, two, three, testing"; break; //font="5x7font" hscroll="-1/10" loop="-1">
        case 101: this.text = "TUNE TO 92.1 FM"; break; //font="5x5font" hscroll="-1/7" xofs="15" loop="-1">
        case 102: this.text = "Merry Christmas"; break; //font="5x5font" hscroll="-1/5" xofs="15" loop="-1">
        case 103: this.text = "Thanks for watching!"; break; //font="5x5font" hscroll="-1/7" xofs="15" loop="-1">
        default: throw "Unhandled fx text: " + vix2buf[399];
    }
    this.rgba = (vix2buf[396] << 24) | (vix2buf[397] << 16) | (vix2buf[398] << 8) | vix2buf[395];
    var ch = this.opts.vix2ch[0];
//    this.vix2buf = vix2buf; //just save the values
    logger("%s vix2render[%s] '%s: %s %s %s %s %s => text %s color %s", this.name, frtime, ch, vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], this.text || '(none)', hex(this.rgba || 0, 8));
}

//show_group('snglobe', [300, +2], [418, +2]);
var snglobe_fx = new Model2D({name: 'snglobe', y: true, w: 2, zinit: false, vix2ch: [300, +2], vix2alt: [418, +2], macro: +0, bitmap: +1});
snglobe_fx.vix2render = function(frtime, vix2buf)
{
    var ch = this.opts.vix2ch[0];
//    this.vix2buf = vix2buf; //just save the values
    logger("%s vix2render[%s] '%s: %s %s => TODO", this.name, frtime, ch, vix2buf[ch++], vix2buf[ch++]);
}

var gdoor_fx = new Model2D({name: 'gdoor-fx', y: true, w: 2, zinit: false, vix2ch: [298, +2], vix2alt: [416, +2], macro: +0, bitmap: +1});
gdoor_fx.onfinish = function()
{
    if (!this.unknowns) return;
    var buf = '';
    this.unknowns.forEach(function(count, key) { buf += ', ' + key + '=' + count; }); //logger("gdoor unknown: %s occurs %s", key, count); });
    logger("gdoor unknowns: %s", buf.substr(2));
} //opc, this.unknowns.toString()); }
gdoor_fx.vix2render = function(frtime, vix2buf)
{
//from CustomFx.cs 2013:
    var macro = '', bitmap = '';
    switch (vix2buf[416]) //macro
    {
        case 0: macro = 'Noop'; break;
        case 180: macro = 'EqBar0'; break; this.MyFx.vix2.EqBar0.call(this); break;
        case 181: macro = 'EqBar1'; break; this.MyFx.vix2.EqBar1.call(this); break;
        case 182: macro = 'EqBar2'; break; this.MyFx.vix2.EqBar2.call(this); break;
        case 183: macro = 'EqBar3'; break; this.MyFx.vix2.EqBar3.call(this); break;
        case 184: macro = 'EqBar4'; break; this.MyFx.vix2.EqBar4.call(this); break;
        case 200: macro = 'FillBkg'; break; this.MyFx.vix2.FillBkg.call(this); break;
        case 201: macro = 'FillFg'; break; this.MyFx.vix2.FillFg.call(this); break;
        case 202: macro = 'FillRGBTest'; break; this.MyFx.vix2.FillRGBTest.call(this); break;
        case 203: macro = 'BTWipe'; break; this.MyFx.vix2.BTWipe.call(this); break;
        case 204: macro = 'TBWipe'; break; this.MyFx.vix2.TBWipe.call(this); break;
        case 205: macro = 'LRWipe'; break; this.MyFx.vix2.LRWipe.call(this); break;
        case 206: macro = 'MidWipe'; break; this.MyFx.vix2.MidWipe.call(this); break;
        case 207: macro = 'EdgeWipe'; break; this.MyFx.vix2.EdgeWipe.call(this); break;
        case 208: macro = 'Spiral'; break; this.MyFx.vix2.Spiral.call(this); break;
        case 209: macro = 'GECETest_zzud'; break; this.MyFx.vix2.GECETest_zzud.call(this); break;
        case 210: macro = 'FECETest_zzlr'; break; this.MyFx.vix2.GECETest_zzlr.call(this); break;
        case 211: macro = 'DrawBorder'; break; this.MyFx.vix2.DrawBorder.call(this); break;
        case 212: macro = 'BTLine'; break; this.MyFx.vix2.BTLine.call(this); break;
        case 213: macro = 'LRLine'; break; this.MyFx.vix2.LRLine.call(this); break;
        case 214: macro = 'SpiralLine'; break; this.MyFx.vix2.SpiralLine.call(this); break;
        case 215: macro = 'DrawColumn0'; break; this.MyFx.vix2.DrawColumn0.call(this); break;
        case 216: macro = 'DrawColumn1'; break; this.MyFx.vix2.DrawColumn1.call(this); break;
        case 217: macro = 'DrawColumn2'; break; this.MyFx.vix2.DrawColumn2.call(this); break;
        case 218: macro = 'DrawColumn3'; break; this.MyFx.vix2.DrawColumn3.call(this); break;
        case 219: macro = 'DrawRow'; break; this.MyFx.vix2.DrawRow.call(this); break;
        case 220: macro = 'Snow'; break; this.MyFx.vix2.Snow.call(this); break;
        case 221: macro = 'DrawCorners'; break; this.MyFx.vix2.DrawCorners.call(this); break;
        case 222: macro = 'Fade'; break; this.MyFx.vix2.Fade.call(this); break;
        case 223: macro = 'Ramp'; break; this.MyFx.vix2.Ramp.call(this); break;
        case 224: macro = 'TreeEcho'; break; this.MyFx.vix2.TreeEcho.call(this); break;
        case 225: macro = 'SwirlCw'; break; this.MyFx.vix2.SwirlCw.call(this); break;
        case 226: macro = 'SwirlCcw'; break; this.MyFx.vix2.SwirlCcw.call(this); break;
        case 227: macro = 'Burst'; break; this.MyFx.vix2.Burst.call(this); break;
        case 233: macro = 'ShowBitmap'; break; this.MyFx.vix2.ShowBitmap.call(this); break;
        case 234: macro = 'ShowText'; break; this.MyFx.vix2.ShowText.call(this); break;
        case 235: macro = 'Countdown'; break; this.MyFx.vix2.Countdown.call(this); break;
        case 236: macro = 'Timer'; break; this.MyFx.vix2.Timer.call(this); break;
        case 240: macro = 'Chase'; break; this.MyFx.vix2.Chase.call(this); break;
        case 241: macro = 'Talk'; break; this.MyFx.vix2.Talk.call(this); break;
        case 242: macro = 'One2Many'; break; this.MyFx.vix2.One2Many.call(this); break;
        case 243: macro = 'SpiralXition'; break; this.MyFx.vix2.SpiralXition.call(this); break;
//        case 244:
//        case 247:
//        case 251:
//        case 255:
        default:
            macro = '??' + vix2buf[416] + '??';
            if (!this.unknowns) this.unknowns = {};
            if (!++this.unknowns['M' + vix2buf[416]] /*isNaN*/) this.unknowns['M' + vix2buf[416]] = 1;
//            logger(10, "Gdoor: unknown macro: %d".red, vix2buf[416]); break; //TODO
//        default: throw "Gdoor: unhandled macro " + vix2buf[416];
    }
    if (macro == 'ShowBitmap')
    switch (vix2buf[417]) //bitmap
    {
        case 0: this.bitmap = ''; break;
        case 120: this.bitmap = "Cross-Scroll+Fade.bmp"; break; //loop="-1" hscroll="-1/4"
        case 121: this.bitmap = "globe-ani.bmp"; break; //loop="-1" hscroll="-1/4"
        case 122: this.bitmap = "Emmanuel-static+rainbow.bmp"; break; //loop="-1" hscroll="-1/4"
        case 123: this.bitmap = "Hippo-earwig-ani.bmp"; break; //loop="-1" hscroll="-32/5"
        case 124: this.bitmap = "Hippo-peek-ani.bmp"; break; //loop="-1" hscroll="-32/5"
        case 125: this.bitmap = "Hippo-fade-ani.bmp"; break; //loop="-1" hscroll="-32/5"
        case 126: this.bitmap = "HeartsDown32x13-ani.bmp"; break; //loop="-1" hscroll="-32/5"
        case 127: this.bitmap = "SquaresMeet32x13-ani.bmp"; break; //loop="-1" hscroll="-32/5"
        case 128: this.bitmap = "Crown-ani.bmp"; break; //loop="-1" hscroll="-1/4"
        case 129: this.bitmap = "CapitalC-ani.bmp"; break; //loop="-1" yofs="-1" hscroll="-32/2"
        case 130: this.bitmap = "other1.bmp"; break; //loop="-1" hscroll="-1/4"
        case 131: this.bitmap = "other2.bmp"; break; //loop="-1" hscroll="-1/4"
//        case 169:
//        case 172:
//        case 174:
//        case 177:
//        case 180:
        default:
            this.bitmap = '??' + vix2buf[417] + '??';
            if (!this.unknowns) this.unknowns = {};
            if (!++this.unknowns['B' + vix2buf[417]] /*isNaN*/) this.unknowns['B' + vix2buf[417]] = 1;
//            logger(10, "Gdoor: unknown bitmap: %d".red, vix2buf[417]); break; //TODO
//        default: throw "Gdoor: unhandled bitmap " + vix2buf[417];
    }
    var ch = this.opts.vix2ch[0];
//    this.vix2buf = vix2buf; //just save the values
    logger("%s vix2render[%s] '%s: %s %s => fx %s", this.name, frtime, ch, vix2buf[ch++], vix2buf[ch++], (macro != 'ShowBitmap')? macro: this.bitmap);
}

//show_group('tuneto', 205);
var tune_to = new Model2D({name: 'tune-to', y: true, w: 1, zinit: false, zorder: 2, vix2ch: 205, tuneto: 205});
tune_to.vix2render = function(frtime, vix2buf)
{
    var ch = this.opts.vix2ch[0];
//    this.vix2buf = vix2buf; //just save the values
    logger("%s vix2render[%s] '%s: %s", this.name, frtime, ch, vix2buf[ch++]);
}

//archfans near bottom:
//var archfans = new Model2D({name: 'TODO: AF', x: 0, y: 1, w: 4 * 8, h: 8});
/*
//show_group('af', [117, +64]);
//show_group('arches', [117, +32]);
//show_group('fans', [149, +32]);
//var af = aport.alloc(Rect2D, {name: 'af', w: 8, h: 8, zinit: false, vix2ch: [117, +64]});
var arches = new Model2D(Rect2D, {name: 'arches', x: 0, w: 8, h: 4, zinit: false, vix2ch: [117, +32]});
//A1.1 .. A1.8, A2.1, ... A4.8
//F1.1 .. F1.8, F2.1, ... F4.8
arches.vix2render = function(frtime, vix2buf) {} //TODO
var fans = new Model2D(Rect2D, {name: 'fans', y: true, zinit: false, vix2ch: [133, +32]});
fans.vix2render = function(frtime, vix2buf) {} //TODO
*/

/*
var acssr1 = new ACSSR({name: 'ACSSR1', zinit: false});
var acssr2 = new ACSSR({name: 'ACSSR2', zinit: false});
var acssr3 = new ACSSR({name: 'ACSSR3', zinit: false});
var acssr4 = new ACSSR({name: 'ACSSR4', zinit: false});
var acssr5 = new ACSSR({name: 'ACSSR5', zinit: false});
var acssr6 = new ACSSR({name: 'ACSSR6', zinit: false});
var acssr7 = new ACSSR({name: 'ACSSR7', zinit: false});
*/


/*
//nat figures next row:
//var nat = new Model2D({name: 'TODO: Nat-fig', x: 0, w: 4 * 12, h: 24});
*/

/*
//show_group('shep', [103, +4]);
var shep = new Model2D({name: 'shep', x: 0, w: 4, h: 1, zinit: false, zorder: 1, vix2ch: [103, +4], shep_1guitar: 103, shep_2drums: 104, shep_3oboe: 105, shep_4sax: 106});
const ShepInstr = ['Guitar', 'Drums', 'Oboe-shorter', 'Sax-longer'];
shep.vix2render = function(frtime, vix2buf) {} //TODO
//show_group('sheep', [107, +6]);
var sheep = new Model2D({name: 'sheep', y: true, w: 6, zinit: false, zorder: 1, vix2ch: [107, +6], sheep_1: 107, sheep_2: 108, sheep_3cymbal: 109, sheep_4: 110, sheep_5snare: 111, sheep_6tap: 112});
const SheepRoles = [null, null, 'Cymbal', null, 'Snare', 'Tap'];
sheep.vix2render = function(frtime, vix2buf) {} //TODO
*/
//show_group('sh_bank', [113, +4]);
var sh_bank = new Model2D({name: 'sh-bank', y: true, w: 4, zinit: false, vix2ch: [113, +4], onShep_RG_offShep_WB: 113, onCane: 114, onSh_BG_offSh_WR: 115, onSheep_RB_offSheep_WG: 116});
const SheColors = [WHITE, '#0F0', '#F00', '#00F', 0, 0, WHITE, WHITE];
const CaneColors = [0, 0, 0, 0, WHITE, '#F00', WHITE, '#F00'];
sh_bank.vix2render = function(frtime, vix2buf)
{
    this.shepColor = SheColors[(vix2buf[113]? 1: 0) + (vix2buf[115]? 2: 0) + (vix2buf[114]? 4: 0)];
    this.caneColor = CaneColors[(vix2buf[113]? 1: 0) + (vix2buf[115]? 2: 0) + (vix2buf[114]? 4: 0)];
    this.sheepColor = SheColors[(vix2buf[116]? 1: 0) + (vix2buf[115]? 2: 0)];
    var ch = this.opts.vix2ch[0];
//    this.vix2buf = vix2buf; //just save the values
    logger("%s vix2render[%s] '%s: %s %s %s %s => shep %s, canes %s, sheep %s", this.name, frtime, ch, vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], this.shepColor, this.caneColor, this.sheepColor);
}

/*
//show_group('nat', 46, [83, +8], 232);
var cross = new Model2D({name: 'cross', y: true, w: 1, numch: 1, zinit: false, zorder: 2, vix2ch: 46, cross: 46});
cross.vix2render = function(frtime, vix2buf) {} //TODO
var nat = new Model2D({name: 'nat-people', y: true, w: 9, vix2ch: [83, +9], mary: 83, joseph: 84, cradle: 85, stable: 86, king_R1: 87, king_B2: 88, king_G3: 89, fireplace: 90});
nat.vix2render = function(frtime, vix2buf) {} //TODO
var donkey = new Model2D({name: 'donkey', y: true, w: 1, numch: 1, zinit: false, vix2ch: 232, donkey: 232});
donkey.vix2render = function(frtime, vix2buf) {} //TODO

//show_group('gift', [77, +5], 82);
var gift = new Model2D({name: 'gift', y: true, w: 6, zinit: false, vix2ch: [77, +5], gift_1M: 77, gift_2R: 78, gift_3B_top: 79, gift_3B_bot: 80, tags: 81});
const GiftColors = ['#F0F', '#F00', '#00F'];
gift.vix2render = function(frtime, vix2buf) {} //TODO
var city = new Model2D({name: 'city', numch: 1, zinit: false, vix2ch: 82, city: 82});
city.vix2render = function(frtime, vix2buf) {} //TODO
*/

//show_group('acc', [96, +5]);
var acc = new Model2D({name: 'acc', y: true, w: 5, zinit: false, vix2ch: [96, +5], guitar_1: 96, stick_2a: 97, stick_2b: 98, oboe: 99, sax: 100});
acc.vix2render = function(frtime, vix2buf)
{
    var ch = this.opts.vix2ch[0];
//    this.vix2buf = vix2buf; //just save the values
    logger("%s vix2render[%s] '%s: %s %s %s %s %s", this.name, frtime, ch, vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++]);
}
//show_group('acc_bank', [101, +2]);
var acc_bank = new Model2D({name: 'acc-bank', y: true, w: 2, zinit: false, vix2ch: [101, +2], on23_off01: 101, on13_off02: 102});
const AccBanks = ['FPArch', 'Instr', 'Sidewalk', 'Heart'];
acc_bank.vix2render = function(frtime, vix2buf)
{
    this.bankAcc = AccBanks[(vix2buf[101]? 2: 0) + (vix2buf[102]? 1: 0)];
    var ch = this.opts.vix2ch[0];
//    this.vix2buf = vix2buf; //just save the values
    logger("%s vix2render[%s] '%s: %s %s => %s", this.name, frtime, ch, vix2buf[ch++], vix2buf[ch++], this.bankAcc);
}


//gdoor, cols, tree, angel, gifts:
/*
//show_group('gdoor', [298, +2], [416, +2]);
var gdoorL = new Model2D({name: 'gdoorL', x: 0, w: 24, h: 16, zinit: false, order: Model2D.prototype.B2T_R2L, output: 'GRB'});
var gdoorR = new Model2D({name: 'gdoorR', y: true, zinit: false, order: Model2D.prototype.B2T_L2R, output: 'GRB'});
var gdoor_all = new Model2D({name: 'gdoor-all', x: gdoorL.left, y: gdoorL.bottom, w: gdoorR.right - gdoorL.left, zinit: false});
*/

//custom column layout:
//
// L  M  R
// L  M  R
// :  :  :
// HHHHH
//
//L = 37 nodes (0..36 first string, T2B)
//M = 50 nodes (0..49 second string, T2B)
//R = 50 nodes (0..49 third string, T2B)
//H = 42 nodes (37..78 first string, L2R)
//
//canvas is 2D rectangle (sparsely populated)
//Vixen2 channels are T2B

//maps sparse 42 x 51 rect to 3 columns of 1 x 50 + 1 row of 42 x 1
//(0, 0) in lower left corner
Model2D.prototype.ColumnNodes = function()
{
//    logger("columns: %s x %s @(%s..%s, %s..%s)", this.width, this.height, this.left, this.right, this.bottom, this.top);
    for (var i = 0; i < 37+42+1; ++i)
        if (i < 37) this.nodelist.push(this.pixelXY(/*this.left +*/ 0, /*this.bottom +*/ i)); //colL is upper part of left edge of canvas
        else if (i < 37+42) this.nodelist.push(this.pixelXY(/*this.left +*/ i - 37, /*this.bottom +*/ 0)); //colH is bottom edge of canvas
        else this.nodelist.push(null); //pad out remaining nodes
    for (var y = 0; y < 50+30; ++y)
        this.nodelist.push((y < 50)? this.pixelXY(Math.round((/*this.left + this.right*/ this.width) / 2), /*this.bottom +*/ y): null);
    for (var y = 0; y < 50+30; ++y)
        this.nodelist.push((y < 50)? this.pixelXY(/*this.right*/ this.width - 1, /*this.bottom +*/ y): null);
    for (var y = 0; y < 80; ++y)
        this.nodelist.push(null); //set 4th parallel string even tho there is no hardware; this reduces parallel palette entropy
//    logger("columns %d nodes", this.nodelist.length);
}

//show_group('col', [181, +24]);
var cols_LMRH = new Model2D({name: 'cols-LMRH', x: 0, w: 42, h: 51, zinit: false, order: Model2D.prototype.ColumnNodes, output: 'GRB', nodetype: RenXt.WS281X(RenXt.PARALLEL)}); //, vix2ch: [181, +24], noop: [181, 182, 189, 197, 198]}); //w: 42, h: 51, numnodes: 3 * 80,
//show_group('colL', [181, +8]);
var colL = new Model2D({name: 'colL', x: cols_LMRH.left, y: cols_LMRH.top - 37, w: 1, h: 37, zinit: false, zorder: 1, vix2ch: [183, +6]}); //, adrs: cols_, startch: cols_LMR.startch}); //, top: 183, bottom: 188}); //overlay
//L.8 .. L.1
colL.vix2render = function(frtime, vix2buf) {} //TODO
//show_group('colM', [189, +8]);
var colM = new Model2D({name: 'colM', x: Math.round((cols_LMRH.left + cols_LMRH.right) / 2), y: cols_LMRH.top - 50, h: 50, zinit: false, zorder: 1, vix2ch: [190, +7]}); //, startch: cols_LMR.startch, top: 190, bottom: 196});
//M.8 .. M.1
colM.vix2render = function(frtime, vix2buf) {} //TODO
//show_group('colR', [197, +8]);
var colR = new Model2D({name: 'colR', x: cols_LMRH.right - 1, y: cols_LMRH.top - 50, zinit: false, zorder: 1, vix2ch: [199, +6]}); //, top: 199, bottom: 204});
//R.8 .. R.1
colR.vix2render = function(frtime, vix2buf) {} //TODO
//var colH = new Model2D({name: 'colH', x: cols_LMRH.left, y: cols_LMRH.bottom, zinit: false}); //, top: 199, bottom: 204});
//colH.vix2render = function(frtime, vix2buf) { this.vix2buf = vix2buf; } //just save the values


//show_group('mtree', [47, +24]);
var mtree = new Model2D({name: 'mtree', y: true, w: 36, h: 32, zinit: false, zorder: 1, vix2ch: [47, +24]}); //1A, 1B, 2A, ..., 12A, 12B; NOTE: tree must come after banks
mtree.vix2render = function(frtime, vix2buf)
{
    var ch = this.opts.vix2ch[0];
    logger("%s vix2render[%s] '%s: %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s", this.name, frtime, ch, vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++]);
    for (var br = 0; br < 36; ++br) //24 branches => 36 columns == 1.5 columns per branch
    {
        var brcolor = dim(((br & 1)? this.bankAcolor: this.bankBcolor) || '#0F0', vix2buf[47 + Math.floor(24 * br / 36)]);
        this.MyFx.column.call(this, br, brcolor);
    }
    this.dirty = true;
}

//show_group('mtree_bank', [71, +4]);
var mtree_bank = new Model2D({name: 'mtree-bank', y: true, w: 4, h: 1, zinit: false, vix2ch: [71, +4], onA_BW_offA_GR: 71, onA_RW_offA_GB: 72, onB_BW_offB_GR: 73, onB_RW_offB_GB: 74});
const MtreeColors = ['#0F0', '#00F', '#F00', WHITE];
mtree_bank.vix2render = function(frtime, vix2buf)
{
    mtree.bankAcolor = MtreeColors[(vix2buf[71]? 1: 0) + (vix2buf[72]? 2: 0)];
    mtree.bankBcolor = MtreeColors[(vix2buf[73]? 1: 0) + (vix2buf[74]? 2: 0)];
    var ch = this.opts.vix2ch[0];
//    this.vix2buf = vix2buf; //just save the values
    logger("%s vix2render[%s] '%s: %s %s => A %s, B %s", this.name, frtime, ch, vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], hex(mtree.bankAcolor, 8), hex(mtree.bankBcolor, 8));
    mtree.dirty = true; //already deduped
}

/*
//show_group('tb', [75, +2]);
var tb = new Model2D({name: 'tb', y: true, w: 2, zinit: false, zorder: 2, vix2ch: [75, +2], ball1: 75, ball2: 76});
const TBColors = ['#FF0', WHITE];
tb.vix2render = function(frtime, vix2buf) {} //TODO

//show_group('angel', [40, +3]);
var angel = new Model2D({name: 'angel', y: true, w: 3, zinit: false, vix2ch: [40, +3], body: 40, wings: 41, trumpet: 42});
angel.vix2render = function(frtime, vix2buf) {} //TODO

//show_group('star', [43, +3]);
var star = new Model2D({name: 'star', y: true, w: 3, zinit: false, vix2ch: [43, +3], aura_B: 43, inner_Y: 44, outer_W: 45});
star.vix2render = function(frtime, vix2buf) {} //TODO
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

/*
//show_group('floods', [282, +16], [400, +16]);
var floods = new Model2D({name: 'floods', w: 4, h: 4, zinit: false, vix2ch: [282, +16], vix2alt: [400, +15]}); //, chpool: aport}); //new Model();
//RGBW 1, RGBW 2, RGBW 3, RGBW 4
floods.vix2render = function(frtime, vix2buf) {} //TODO
*/

Model2D.prototype.CustomX_T2B = Model2D.prototype.R2L_T2B; function custom(x_ranges)
//CustomX_T2B = function(x_ranges)
{
//    logger("custom t2b, mode", this, x_ranges.length, arguments.length);
//    this.nodelist = []; //new Array(w * h);
    arguments.forEach(function(range)
    {
//        logger("x range", range, range[0] + '++' + range[1], this.top + '--' + this.bottom, range[0] + '--' + range[1], this.top + '--' + this.bottom);
        for (var x = range[0]; x <= range[1]; ++x) //L->R
            for (var y = /*this.top*/ this.height - 1; y >= 0 /*this.bottom*/; --y) //T->B
                this.nodelist.push(this.pixelXY(/*this.left +*/ x - 1, y));
        for (var x = range[0]; x >= range[1]; --x) //R->L
            for (var y = /*this.top*/ this.height - 1; y >= 0 /*this.bottom*/; --y) //T->B
                this.nodelist.push(this.pixelXY(/*this.left +*/ x - 1, y));
    }.bind(this));
//    logger("node list ", this.nodelist.length);
//    return this.nodelist;
}

//show_group('ic', [2, +14]);
//NOTE: previous value of x, y, w, h is used if not specified
//debugger;
//console.warn("IC SIZE REDUCED".red);
var ic1 = new Model2D({name: 'ic1', x: 0, y: 100, w: 33, h: 10, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //{from: 32, to: 0}, vorder: {from: 9: to: 0}});
var ic2 = new Model2D({name: 'ic2', y: true, w: 30, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //[{from: 30, to: 1}]});
var ic3 = new Model2D({name: 'ic3', y: true, w: 30, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //[{from: 30, to: 1}]});
var ic4 = new Model2D({name: 'ic4', y: true, w: 24+8, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //[{from: 24+8, to: 1+8}, {from: 8, to: 1}]});
var ic5 = new Model2D({name: 'ic5', y: true, w: 34, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //[{from: 34, to: 1}]});
//var icbig = new Model2D({name: 'icbig', y: true, w: 15+33, zinit: false, order: Model2D.prototype.CustomX_T2B.bind(undefined, [15+33, 1+33], [1, 8], [33, 17], [9, 13], [16, 14]), output: 'GRB'}); //order: [{from: 15+33, to: 1+33}, {from: 1, to: 8}, {from: 33, to: 17}, {from: 9, to: 13}, {from: 16, to: 14}]});
var icbig = new Model2D({name: 'icbig', y: true, w: 15+33, zinit: false, order: function() { Model2D.prototype.CustomX_T2B.bind(this, [15+33, 1+33], [1, 8], [33, 17], [9, 13], [16, 14])(); }, output: 'GRB'}); //order: [{from: 15+33, to: 1+33}, {from: 1, to: 8}, {from: 33, to: 17}, {from: 9, to: 13}, {from: 16, to: 14}]});
//var icbig = new Model2D({name: 'icbig', y: true, w: 15+33, zinit: false, order: function() { (CustomX_T2B.bind(this, [15+33, 1+33], [1, 8], [33, 17], [9, 13], [16, 14]))(); }, output: 'GRB'}); //order: [{from: 15+33, to: 1+33}, {from: 1, to: 8}, {from: 33, to: 17}, {from: 9, to: 13}, {from: 16, to: 14}]});
var ic_all = new Model2D({name: 'ic-all', x: ic1.left, y: ic1.bottom, w: icbig.right - ic1.left, zinit: false, vix2ch: [2, +14]}); //yport.alloc(IcicleSegment2D.all, {name: 'ic-all', x: 0, y: 0, w: 207, h: 10, zinit: false}); //CAUTION: must use same port as segments
function x2ic(x)
{
    if (x < 0) return null;
    else if (x < ic1.right) return ic1;
    else if (x < ic2.right) return ic2;
    else if (x < ic3.right) return ic3;
    else if (x < ic4.right) return ic4;
    else if (x < ic5.right) return ic5;
    else if (x < icbig.right) return icbig;
    else return null;
}
const ICSEG_WIDTH = 207.1 / 14; //14 segments => 207 columns ~= 15 columns per segment; add a little to force loop exit even with rounding errors
//NOTE: some ic are not spread evenly, but the original seq took that into acct so just use x as-is
ic_all.vix2render = function(frtime, vix2buf)
{
//debugger;
    var ch = this.opts.vix2ch[0]; //start channel
//    this.vix2buf = vix2buf; //just save the values
    logger(80, "%s vix2render[%s] '%s: %s %s %s %s %s %s %s %s %s %s %s %s %s %s", this.name, frtime, ch, vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++], vix2buf[ch++]);
    for (var x = 0, col = 0; x < 207; x += 207.1/14, ++col)
    {
        var ic = x2ic(Math.round(x)); if (ic) ic.dirty = true;
        ic = x2ic(Math.round(x + 207.1/14)); if (ic) ic.dirty = true; //NOTE: assumes each seg touches at most 2 models
        var color = dim(WHITE, vix2buf[2 + col]);
        logger(100-1, "ic x %s/207, col %s/14, color: #FCA * %s => %s", Math.round(x), col, vix2buf[2 + col], hex(color, 8));
//        this.MyFx.column.call(this, col, color);
//        logger(100, "ic nodes are now: %s", this.imgdata().data.toString());
//        var before = new Buffer(Model2D.entire.imgdata(0, 0, Model2D.entire.width, Model2D.entire.height).data);
//        console.log("before:", before);
        this.fill(Math.round(x), 0, Math.round(x + 207.1/14) - Math.round(x), this.height, '#' + hex(color, 8));
/*
        var buf = [];
        var data = this.imgdata().data;
        for (var i = 0; i < 64; i += 4) buf.push(hex(data.readUInt32BE(i), 8));
        data = null;
        console.log("raw nodes:", buf.join(', '));
*/
//        var after = new Buffer(Model2D.entire.imgdata(0, 0, Model2D.entire.width, Model2D.entire.height).data);
//        console.log("after:", after.slice();
//        after = null;
//        var buf = [];
//        for (;;)
//        {
//            var cmp = bufdiff(before, after);
//            if (!cmp) break;
//            buf.push("'" + cmp + ': #' + hex(before.readUInt32BE(Math.abs(cmp) - 1), 8) + ' => #' + hex(after.readUInt32BE(Math.abs(cmp) - 1), 8));
//        }
//        if (buf.length) console.log("ic fill[%s..%s] style %s %s:\n", Math.round(x), Math.round(x + 207.1/14), buf.join('\n'), this.ctx.fillStyle, hex(color, 8));
//        else console.log("%s is unchanged after fill %s %s: ", before.length, this.ctx.fillStyle, hex(color, 8), '#' + hex(before.readUInt32BE(0), 8), '#' + hex(before.readUInt32BE(128), 8), '...');
//        before = after = null;
//        var readback = this.ctx.getImageData(x, this.T2B(y), 1, 1); //RGBA array
/*
//        var check = '#' + hex(readback.data.readUInt32BE(0), 8); // >>> 8, 6); //want RGBA
//        if (check.toLowerCase() != color.toLowerCase()) console.log("is '%s' pixel (%s, %s) set correctly? wanted %s, got %s", this.name, x, y, color, check);
        var readback = this.imgdata(Math.round(x), 0, Math.round(x + 207.1/14) - Math.round(x), this.height);
        if (readback) readback = readback.data;
        if (readback) for (var i = 0; i < 4*4; i += 4)
            console.log("ic fill readback[%s]:", i, readback.readUInt32BE(i)); //RGBA; endianness doesn't matter here as long as it's preserved
*/
    }
//if (frtime >= 100) process.exit(0);
    this.dirty = true;
}

/*
//show_group('ab', [16, +24]);
var ab = new Model2D({name: 'ab', w: 3, h: 8, zinit: false, zorder: 1, vix2ch: [16, +24], body: +0, headwings: +1, bell: +2});
ab.vix2render = function(frtime, vix2buf) {} //TODO
*/


//dummy object to allow output to be tagged for easier trace/debug:
var trace = new Model2D({name: 'trace', x: 0, w: 1, h: 1, zinit: false, adrs: 0x55, ack: false});
//trace.old_render = trace['render']; //no worky; kludge: use indirect adrs to avoid hoisting function from below
trace.render = function render()
{
//debugger;
    this.dirty = true;
    this.pixel(0, 0, this.port.seqnum); //RGB value; //hex(this.port.seqnum, 6) + 'FF'); // << 8) | 0xFF);
    return Model2D.prototype.render.apply(this, arguments); //this.old_render.apply(this, arguments);
}


//logger("entire canvas: %d x %d (%s pixels)", entire.width, entire.height, hfmt(entire.width * entire.height, {scale: 'binary'}));
//summarize composite models:
//Model2D.all.forEach(function(model)
//{
//    if (!(model.name || '').match(/-all$/i)) return;
//    logger("%s: %d x %d = %s pixels @(%d..%d, %d..%d)", model.name, model.width, model.height, not_hfmt(model.width * model.height, {scale: 'binary'}), model.left, model.right, model.bottom, model.top);
//});


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// additional setup and analysis:
//

//assign models to ports:
//NOTE: order of model definitions above determines geometry within whole-house model (using sticky dimensions, tiling)
//order of models below represents physical connection to ports and must match the hardware layout exactly
//FTDI-Y //2100 Ic + 150 Cols ~= 2250 nodes
//FTDI-G //16 Floods + 1188 Mtree + 640 Angel + 384 Star (reserved) ~= 2228 nodes
//FTDI-B //1536 Shep + 256 Gift (reserved) ~= 1792 nodes
//FTDI-W //7 * 56 AC (5 * 56 unused) + 768 gdoor + 3 * 384 (AB-future) ~= 2312 nodes
//debugger;
var ports = require('my-projects/models/my-ports').all;
ports.forEach(function(port, inx) { if (!inx) ports.byname = {}; ports.byname[port.name || port.device || null] = port; });
//logger("ports by name", ports.byname);
var assts = //kludge: need var name here to keep Javascript happy
{
//    'FTDI-G': [acssr1, acssr2, acssr3, acssr4, acssr5, acssr6, acssr7, gdoorL, gdoorR, /*ab*/], //acssrs = archfans, cross, sheep, nat, donkey
//    'FTDI-B': [angel, mtree, gift, star], //city, tb
    'FTDI-W': [/*cols_LMRH,*/ ic1, ic2, ic3, ic4, ic5, icbig, trace], //ab
//    'FTDI-Y': [gece, floods12, floods34, shep1, shep2, shep3, shep4],
    'none': [cols_LMRH, mtree, macro_fx, snglobe_fx, gdoor_fx, tune_to, sh_bank, acc, acc_bank, colL, colM, colR, mtree_bank, ic_all, Model2D.entire],
}.forEach(function(port_models, portname)
{
    if (/*(portname !== null) &&*/ !ports.byname[portname]) throw "Unknown port: '" + portname + "'";
    port_models.forEach(function(model)
    {
        if (model.port) throw "Model '" + model.name + "' asst to '" + portname + "': already assigned to port '" + model.port.name + "'";
        model.port = ports.byname[portname];  //(portname !== null)? ports.byname[portname]: null; });
    });
});
var unassigned = '';
Model2D.all.forEach(function(model) { if (typeof model.port == 'undefined') unassigned += ', ' + model.name || model.device; });
if (/*num_assigned != models.all.length*/ unassigned) throw "Unassigned models: " + unassigned.substr(2);


//port usage summary:
//var ports = module.exports.ports = {};
process.nextTick(function() //kludge: nodelists aren't generated until next processor tick, so code below must be delayed
{
    logger(180, "TICK port summary");
    ports.forEach(function(port)
    {
//    if (!model.port) return;
//    if (!++model.port.num_models) { model.port.num_models = 1; model.port.num_nodes = 0; }
        /*if (!port.num_nodes)*/ port.num_nodes = 0;
        port.models.forEach(function(model) { port.num_nodes += (model.nodelist || []).length; });
        logger("port '%s': type %s, #models %s, #nodes %s".blue, port.name || port.device, port.constructor.name, port.models.length, port.num_nodes);
    });
});

//model summary:
//logger("entire canvas: %d x %d (%s pixels)", entire.width, entire.height, hfmt(entire.width * entire.height, {scale: 'binary'}));
//var vix2models = module.exports.vix2models = [];
var mapped_vix2ch = {}; //vix2 channel range
Model2D.all.forEach(function(model)
{
//    if (!(model.name || '').match(/-all$/i)) return;
    logger("model '%s': port '%s', adrs %s, %s x %s = %s pixels @(%s..%s, %s..%s)".blue, model.name, (model.port || {}).name, model.adrs, model.width, model.height, not_hfmt(model.width * model.height, {scale: 'binary'}), model.left, model.right, model.bottom, model.top);
    if (typeof model.port == 'undefined') throw "Model '" + model.name + "' not assigned to a port";
/*
//    vix2map(model);
    if (typeof model.opts.vix2ch == 'undefined') return; //{ logger("no vix2 ch ", model.name); return; }
    if (!Array.isArray(model.opts.vix2ch)) model.opts.vix2ch = [model.opts.vix2ch, 1]; //[0] = startch, [1] = count (optional)
    if (model.opts.vix2alt)
    {
        if (!Array.isArray(model.opts.vix2alt)) model.opts.vix2alt = [model.opts.vix2alt, 1];
        if (model.opts.vix2alt[1] != model.opts.vix2ch[1]) throw new Error(sprintf("model '%s' alt ch mismatch: %j vs. %j".red, model.name, model.opts.vix2alt, model.opts.vix2ch));
        for (var ch = model.opts.vix2alt[0]; ch < model.opts.vix2alt[0] + model.opts.vix2alt[1]; ++ch)
            if (!++mapped_vix2ch[ch] /*-isNaN*-/) mapped_vix2ch[ch] = 1;
    }
*/
    if (model.opts.vix2ch)
        for (var ch = model.opts.vix2ch[0]; ch < model.opts.vix2ch[0] + model.opts.vix2ch[1]; ++ch)
            if (!++mapped_vix2ch[ch] /*isNaN*/) mapped_vix2ch[ch] = 1;
//    vix2models.push(model);
//    portmap(model);
});
//logger("mapped vix2 ch", JSON.stringify(mapped_vix2ch)); //TODO: consolidate
var vix2chlist = /*module.exports.vix2chlist =*/ Object.keys(mapped_vix2ch).sort(Array.prototype.numsort); //function(lhs, rhs) { return 1 * lhs - 1 * rhs; });
var buf = '';
vix2chlist.forEach(function(ch, inx, all) //TODO: use Array.reduce()
{
    if (!inx || (1 * all[inx - 1] != 1 * ch - 1)) buf += ', ' + ch;
    if ((inx + 1 == all.length) || (1 * all[inx + 1] != 1 * ch + 1)) buf += ' - ' + ch;
});
logger("mapped ranges: %s".blue, buf.substr(2));
logger("Vixen2 channels mapped: %s/%s (%d%%), %s..%s".cyan, vix2chlist.length, vix2prof.channels.length, Math.round(100 * vix2chlist.length / vix2prof.channels.length), vix2chlist.first, vix2chlist.last);


/*TODO: merge above?
//summary info:
var total_ports = 0, total_models = 0, total_nodes = 0;
function classname(thing) { return thing.constructor.name; } //.prototype.constructor.name
[SerialPort, OtherPort].forEach(function(porttype)
{
    var num_ports = 0, num_models = 0, num_nodes = 0;
    (porttype.all || []).forEach(function(port, pinx, all)
    {
        if (!(port.models || []).length) return;
        logger("%s[%s/%s]: '%s', %s models:", classname(porttype), pinx, all.length, port.device, (port.models || []).length);
        ++num_ports;
        (port.models || []).forEach(function(model, minx)
        {
            logger("  model[%s/%s]: '%s', canvas: x %s..%s, y %s..%s, w %s, h %s, nodes: %s", minx, port.models.length, model.name, model.left, model.right, model.bottom, model.top, model.width, model.height, (model.nodelist || []).length);
            num_nodes += (model.nodelist || []).length;
            ++num_models;
        });
    });
    total_ports += num_ports; total_models += num_models; total_nodes += num_nodes;
    logger("#active %s: %d, #real models: %d, #nodes: %d, avg %d nodes/model, %d nodes/port", classname(porttype), num_ports, num_models, num_nodes, num_models? Math.round(num_nodes / num_models): 0, num_ports? Math.round(num_nodes / num_ports): 0);
});
logger("total: active ports: %d, #real models: %d, #nodes: %d, avg %d nodes/model, %d nodes/port", total_ports, total_models, total_nodes, total_models? Math.round(total_nodes / total_models): 0, total_ports? Math.round(total_nodes / total_ports): 0);
*/


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// helper functions:
//

//eof
