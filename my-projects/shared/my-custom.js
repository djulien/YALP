//YALP custom hardware + model setup

'use strict'; //help catch errors

var path = require('path');
var caller = require('my-plugins/utils/caller').stack;
var makenew = require('my-plugins/utils/makenew');
var inherits = require('inherits');
require('my-plugins/my-extensions/object-enum');

module.exports.Playlist = CustomPlaylist;
module.exports.Sequence = CustomSequence;
//module.exports.ChannelPools = ChannelPools;


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
    try { return new makenew(vix2.Sequence, args); }
    catch (exc) { console.log("nope vix2, try next".red, exc); };
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
// Ports:

var ChannelPool = require('my-projects/models/chpool');

//first define abstract channel pools:
//var chpools = module.exports.chpools =
//{
//    nullport: new ChannelPool('null'),
//    bport: new ChannelPool({name: 'FTDI-B', device: "/dev/ttyUSB0"}),
//    gport: new ChannelPool({name: 'FTDI-G', device: "/dev/ttyUSB1"}),
//    wport: new ChannelPool({name: 'FTDI-W', device: "/dev/ttyUSB2"}),
//    yport: new ChannelPool({name: 'FTDI-Y', device: "/dev/ttyUSB3"}),
//};

var noport = /*xmas.ports.no_port =*/ new ChannelPool('no-hw'); //dummy port for fx or virt channels
var yport = /*xmas.ports.FTDI_y =*/ new ChannelPool({name: 'FTDI-Y', device: '/dev/ttyUSB0'}); //2100 Ic + 150 Cols ~= 2250 nodes
var gport = /*xmas.ports.FTDI_g =*/ new ChannelPool({name: 'FTDI-G', device: '/dev/ttyUSB1'}); //16 Floods + 1188 Mtree + 640 Angel + 384 Star (reserved) ~= 2228 nodes
var bport = /*xmas.ports.FTDI_b =*/ new ChannelPool({name: 'FTDI-B', device: '/dev/ttyUSB2'}); //1536 Shep + 256 Gift (reserved) ~= 1792 nodes
var wport = /*xmas.ports.FTDI_w =*/ new ChannelPool({name: 'FTDI-W', device: '/dev/ttyUSB3'}); //7 * 56 AC (5 * 56 unused) + 768 gdoor + 3 * 384 (AB-future) ~= 2312 nodes


//then add hardware drivers and protocol handlers:
var serial = require('serialport'); //https://github.com/voodootikigod/node-serialport
var RenXt = require('my-plugins/hw/RenXt');

const FPS = 20; //target 50 msec frame rate
ChannelPool.all.forEach(function(chpool, inx)
{
    if (!chpool.opts.device) return;
    console.log("port ", chpool.name, chpool.opts.device);
    chpool.port = new serial.SerialPort(chpool.opts.device, { baudrate: 242500, dataBits: 8, parity: 'none', stopBits: 1, buffersize: Math.floor(242500 / (1 + 8 + 2) / FPS) /*2048*10*/ }, false), //false => don't open immediately (default = true)
    RenXt.AddProtocol(chpool); //protocol handler
});


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


///////////////////////////////////////////////////////////////////////////////////////////////////////
// Assign models to ports and Vixen2 channels:
// each model is analogous to a "universe", except they can be any size

//generic model definitions:
var models = require('my-projects/models/model'); //generic models
var Rect2D = models.Rect2D;
var Strip1D = models.Strip1D;
var Single0D = models.Single0D;


//custom models:
var IcicleSegment2D = require('my-projects/models/icicles');
//var Columns2D = require('my-projects/models/columns');

//NOTE: set zinit to allow smoother xition from previous seq
//NOTE: vixch should match profile info from above


//show_group('fx', [395, +5]);
var fx = noport.alloc(Strip1D, {name: 'fx', w: 5, zinit: false, vix2ch: [395, +5], color_a: 395, color_r: 396, color_g: 397, color_b: 398, text: 399});
fx.vix2render = function() {} //TODO

//show_group('snglobe', [300, +2], [418, +2]);
var snglobe = noport.alloc(Strip1D, {name: 'snglobe', w: 2, zinit: false, vix2ch: [300, +2], vix2alt: [418, +2], macro: +0, bitmap: +1});
snglobe.vix2render = function() {} //TODO


/*
//show_group('col', [181, +24]);
var cols_LMRH = yport.alloc(Columns2D, {name: 'cols-LMRH', rgb: 'GRB', zinit: false, vix2ch: [181, +24], noop: [181, 182, 189, 197, 198]}); //w: 42, h: 51, numnodes: 3 * 80,
//show_group('colL', [181, +8]);
//var colL = yport.alloc(Strip1D, {name: 'colL', w: 6, zinit: false, adrs: cols_, startch: cols_LMR.startch}); //, vix2ch: [183, +6], top: 183, bottom: 188}); //overlay
//show_group('colM', [189, +8]);
//var colM = yport.alloc(Strip1D, {name: 'colM', w: 7, zinit: false, startch: cols_LMR.startchvix2ch: [190, +7], top: 190, bottom: 196});
//show_group('colR', [197, +8]);
//var colR = yport.alloc(Strip1D, {name: 'colR', w: 6, zinit: false, vix2ch: [199, +6], top: 199, bottom: 204});
*/


/*
debugger;
var aprop = {}; //noport.alloc(Strip1D, {name: 'aprop', w: 14, zinit: false, vix2ch: [2, +14]});
aprop.vix2render = function()
{
//    debugger;
    for (var i = 0; i < 14; ++i) this.pixel(i, this.vix2buf[i]);
}
var ic1 = noport.alloc(Strip1D, {name: 'ic1', w: 2, zinit: false, vix2ch: [2, +2]});
ic1.vix2render = function() { this.pixel(0, this.vix2buf[0]).pixel(1, this.vix2buf[1]); }
var ic2 = noport.alloc(Strip1D, {name: 'ic2', w: 2, zinit: false, vix2ch: [4, +2]});
ic2.vix2render = function() { this.pixel(0, this.vix2buf[0]).pixel(1, this.vix2buf[1]); }
var ic3 = noport.alloc(Strip1D, {name: 'ic3', w: 2, zinit: false, vix2ch: [6, +2]});
ic3.vix2render = function() { this.pixel(0, this.vix2buf[0]).pixel(1, this.vix2buf[1]); }
var ic4 = noport.alloc(Strip1D, {name: 'ic4', w: 2, zinit: false, vix2ch: [8, +2]});
ic4.vix2render = function() { this.pixel(0, this.vix2buf[0]).pixel(1, this.vix2buf[1]); }
var ic5 = noport.alloc(Strip1D, {name: 'ic5', w: 2, zinit: false, vix2ch: [10, +2]});
ic5.vix2render = function() { this.pixel(0, this.vix2buf[0]).pixel(1, this.vix2buf[1]); }
var ic6 = noport.alloc(Strip1D, {name: 'ic6', w: 2, zinit: false, vix2ch: [12, +2]});
ic6.vix2render = function() { this.pixel(0, this.vix2buf[0]).pixel(1, this.vix2buf[1]); }
var ic7 = noport.alloc(Strip1D, {name: 'ic7', w: 2, zinit: false, vix2ch: [14, +2]});
ic7.vix2render = function() { this.pixel(0, this.vix2buf[0]).pixel(1, this.vix2buf[1]); }
*/

//show_group('ic', [2, +14]);
var ic1 = yport.alloc(IcicleSegment2D, {name: 'ic1', w: 33, h: 10, zinit: false, order: [{from: 33, to: 1}]});
var ic2 = yport.alloc(IcicleSegment2D, {name: 'ic2', w: 30, h: 10, zinit: false, order: [{from: 30, to: 1}]});
var ic3 = yport.alloc(IcicleSegment2D, {name: 'ic3', w: 30, h: 10, zinit: false, order: [{from: 30, to: 1}]});
var ic4 = yport.alloc(IcicleSegment2D, {name: 'ic4', w: 24+8, h: 10, zinit: false, order: [{from: 24+8, to: 1+8}, {from: 8, to: 1}]});
var ic5 = yport.alloc(IcicleSegment2D, {name: 'ic5', w: 34, h: 10, zinit: false, order: [{from: 34, to: 1}]});
var icbig = yport.alloc(IcicleSegment2D, {name: 'icbig', w: 15+33, h:10, zinit: false, order: [{from: 15+33, to: 1+33}, {from: 1, to: 8}, {from: 33, to: 17}, {from: 9, to: 13}, {from: 16, to: 14}]});
var ic_all = noport.alloc(IcicleSegment2D.all, {name: 'ic-all', w: 207, h: 10, zinit: false, vix2ch: [2, +14]});
//var ic1 = yport.alloc(IcicleSegment2D, {name: 'ic1', w: 2, h: 2, zinit: false, order: [{from: 2, to: 1}]});
//var ic2 = yport.alloc(IcicleSegment2D, {name: 'ic2', w: 2, h: 2, zinit: false, order: [{from: 2, to: 1}]});
//var ic3 = yport.alloc(IcicleSegment2D, {name: 'ic3', w: 2, h: 2, zinit: false, order: [{from: 2, to: 1}]});
//var ic4 = yport.alloc(IcicleSegment2D, {name: 'ic4', w: 4, h: 2, zinit: false, order: [{from: 4, to: 3}, {from: 2, to: 1}]});
//var ic5 = yport.alloc(IcicleSegment2D, {name: 'ic5', w: 2, h: 2, zinit: false, order: [{from: 2, to: 1}]});
//var icbig = yport.alloc(IcicleSegment2D, {name: 'icbig', w: 4, h:2, zinit: false, order: [{from: 4, to: 3}, {from: 2, to: 1}]});
//var ic_all = yport.alloc(IcicleSegment2D.all, {name: 'ic-all', w: 16, h: 2, zinit: false, vix2ch: [2, +14]});


/*
//show_group('floods', [282, +16], [400, +16]);
var floods = gport.alloc(Rect2D, {name: 'floods', w: 4, h: 4, zinit: false, vix2ch: [282, +16], vix2alt: [400, +15]}); //, chpool: aport}); //new Model();
floods.vix2render = function() {} //TODO

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


//show_group('shep', [103, +4]);
var shep = bport.alloc(Strip1D, {name: 'shep', w: 4, zinit: false, vix2ch: [103, +4], shep_1guitar: 103, shep_2drums: 104, shep_3oboe: 105, shep_4sax: 106});
shep.vix2render = function() {} //TODO
//show_group('sheep', [107, +6]);
var sheep = bport.alloc(Strip1D, {name: 'sheep', w: 6, zinit: false, vix2ch: [107, +6], sheep_1: 107, sheep_2: 108, sheep_3cymbal: 109, sheep_4: 110, sheep_5snare: 111, sheep_6tap: 112});
sheep.vix2render = function() {} //TODO
//show_group('she_bank', [113, +4]);
var sh_bank = bport.alloc(Strip1D, {name: 'sh-bank', w: 4, zinit: false, vix2ch: [113, +4], onShep_RG_offShep_WB: 113, onCane: 114, onSh_BG_offSh_WR: 115, onSheep_RB_offSheep_WG: 116});
sh_bank.vix2render = function() {} //TODO


//show_group('gdoor', [298, +2], [416, +2]);
var gdoor = wport.alloc(Strip1D, {name: 'gdoor', w: 2, zinit: false, vix2ch: [298, +2], vix2alt: [416, +1], macro: +0, bitmap: +1});
gdoor.vix2render = function() {} //TODO

//show_group('ab', [16, +24]);
var ab = wport.alloc(Rect2D, {name: 'ab', w: 3, h: 8, zinit: false, vix2ch: [16, +24], body: +0, wings: +1, bell: +2});
ab.vix2render = function() {} //TODO

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

//show_group('tuneto', 205);
var tuneto = wport.alloc(Single0D, {name: 'tune-to', numch: 1, zinit: false, vix2ch: 205, tuneto: 205});
tuneto.vix2render = function() {} //TODO

//show_group('af', [117, +64]);
//show_group('arches', [117, +32]);
//show_group('fans', [149, +32]);
//var af = aport.alloc(Rect2D, {name: 'af', w: 8, h: 8, zinit: false, vix2ch: [117, +64]});
var arches = wport.alloc(Rect2D, {name: 'arches', w: 8, h: 4, zinit: false, vix2ch: [117, +32]});
arches.vix2render = function() {} //TODO
var fans = wport.alloc(Rect2D, {name: 'fans', w: 8, h: 4, zinit: false, vix2ch: [133, +32]});
fans.vix2render = function() {} //TODO
*/


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// apply custom model extensions:

debugger;
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


//xmas.songs.forEach(function(seq, inx)
//{
//    vix2.AddMixin(seq); //render using mapped Vixen channel values
//});


//eof
