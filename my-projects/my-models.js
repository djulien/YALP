//YALP custom hardware + model setup

'use strict'; //help catch errors

var path = require('path');
require('my-plugins/my-extensions/object-enum');


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

var noport = /*xmas.ports.no_port =*/ new ChannelPool('null'); //dummy port for fx or virt channels
var yport = /*xmas.ports.FTDI_y =*/ new ChannelPool({name: 'FTDI-Y', device: '/dev/ttyUSB0'}); //2100 Ic + 150 Cols ~= 2250 nodes
var gport = /*xmas.ports.FTDI_g =*/ new ChannelPool({name: 'FTDI-G', device: '/dev/ttyUSB1'}); //16 Floods + 1188 Mtree + 640 Angel + 384 Star (reserved) ~= 2228 nodes
var bport = /*xmas.ports.FTDI_b =*/ new ChannelPool({name: 'FTDI-B', device: '/dev/ttyUSB2'}); //1536 Shep + 256 Gift (reserved) ~= 1792 nodes
var wport = /*xmas.ports.FTDI_w =*/ new ChannelPool({name: 'FTDI-W', device: '/dev/ttyUSB3'}); //7 * 56 AC (5 * 56 unused) + 768 gdoor + 3 * 384 (AB-future) ~= 2312 nodes


//then add hardware drivers and protocol handlers:
var serial = require("serialport"); //https://github.com/voodootikigod/node-serialport
var RenXt = require('my-plugins/hw/RenXt');

const FPS = 20;
ChannelPool.all.forEach(function(chpool, inx)
{
    if (!chpool.device) return;
    chpool.port = new serial.SerialPort(chool.device, { baudrate: 242500, dataBits: 8, parity: 'none', stopBits: 1, buffersize: Math.floor(242500 / (1 + 8 + 2) / FPS) /*2048*10*/ }, false), //false => don't open immediately (default = true)
    RenXt.Mixin(chpool); //protocol handler
});


//show list of available ports:
serial.list(function(err, ports)
{
    if (err) console.log("serial port enum ERR: %j".red, err);
    else console.log("found %d serial ports:".cyan, ports.length);
    ports.forEach(function(port, inx)
    {
        console.log("  serial[%s/%s]: '%s' '%s' '%s'".cyan, inx, ports.length, port.comName, port.manufacturer, port.pnpId);
    });
});


///////////////////////////////////////////////////////////////////////////////////////////////////////
// Define custom models:

var models = require('my-projects/models/model'); //generic models
var Rect2D = models.Rect2D;
var Strip1D = models.Strip1D;
var Single0D = models.Single0D;

var IcicleBank = require('my-projects/models/icicles');


///////////////////////////////////////////////////////////////////////////////////////////////////////
// Vixen2 profile mapping:

var vix2 = require('my-projects/shared/vixen2');

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


var vix2prof = vix2.Profile(path.join(__dirname, '**', '!(*RGB*).pro'));
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
// Assign models to ports and Vixen2 channels:
// each model is analogous to a "universe", except they can be any size

//show_group('fx', [395, +4]);
var fx = noport.alloc(Strip1D, {w: 5, vix2ch: [395, +4], color_a: 395, color_r: 396, color_g: 397, color_b: 398, text: 399});

//show_group('snglobe', [300, +1], [418, +1]);
var snglobe = noport.alloc(Strip1D, {w: 2, vix2ch: [300, +1], vix2alt: [418, +1], macro: +0, bitmap: +1});


//show_group('col', [181, +23]);
var cols_LMR = yport.alloc(Rect2D, {w: 3, h: 8, vix2ch: [181, +23], noop: [181, 182, 189, 197, 198]});
//show_group('colL', [181, +7]);
//var colL = yport.alloc(Strip1D, {w: 6, adrs: cols_, startch: cols_LMR.startch}); //, vix2ch: [183, +5], top: 183, bottom: 188}); //overlay
//show_group('colM', [189, +7]);
//var colM = yport.alloc(Strip1D, {w: 7, startch: cols_LMR.startchvix2ch: [190, +6], top: 190, bottom: 196});
//show_group('colR', [197, +7]);
//var colR = yport.alloc(Strip1D, {w: 6, vix2ch: [199, +5], top: 199, bottom: 204});

//show_group('ic', [2, +13]);
var ic1 = yport.alloc(IcicleBank, {w: 33, h: 10});
var ic2 = yport.alloc(IcicleBank, {w: 30, h: 10});
var ic3 = yport.alloc(IcicleBank, {w: 30, h: 10});
var ic4 = yport.alloc(IcicleBank, {w: 24+8, h: 10});
var ic5 = yport.alloc(IcicleBank, {w: 34, h: 10});
var icbig = yport.alloc(IcicleBank, {w: 15+33, h:10});
var ic_all = noport.alloc(IcicleBank.all, {w: 207, h: 10, vix2ch: [2, +13]});

icbig.xy2node = function(x, y)
{
    const ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 9, 10, 11, 12, 13, 16, 15, 14];
    if (x < 15) return (15+33-1 - x) * 10 + 10-1 - y;
    if (x < 15 + 33) return (ORDER[x - 15] - 1) * 10 + 10-1 - y;
}

ic_all.xy2node = function(x, y)
{
    if (x < 33) return ic1.xy2node(x, y); //(33-1 - x) * 10 + 10-1 - y;
    if (x < 33 + 30) return ic2.xy2node(x - 33, y); //(33+30-1 - x) * 10 + 10-1 - y;
    if (x < 33 + 30 + 30) return ic3.xy2node(x - 33 - 30, y); //(33+30+30-1 - x) * 10 + 10-1 - y;
    if (x < 33 + 30 + 30 + 24+8) return ic4.xy2node(x - 33 - 30 - 30, y); //(33+30+30+24+8-1 - x) * 10 + 10-1 - y;
    if (x < 33 + 30 + 30 + 24+8 + 34) return ic5.xy2node(x - 33 - 30 - 30 - 24-8, y); //(33+30+30+24+8-1 - x) * 10 + 10-1 - y;
    return icbig.xy2node(x - 33 - 30 - 30 - 24-8 - 34, y);
}

//show_group('floods', [282, +15], [400, +15]);
var floods = gport.alloc(Rect2D, {w: 4, h: 4, vix2ch: [282, +15], vix2alt: [400, +15]}); //, chpool: aport}); //new Model();

//show_group('mtree', [47, +23]);
var mtree = gport.alloc(Strip1D, {w: 24, vix2ch: [47, +23]});
//show_group('mtree_bank', [71, +3]);
var mtree_bank = noport.alloc(Strip1D, {w: 4, vix2ch: [71, +3], onA_BW_offA_GR: 71, onA_RW_offA_GB: 72, onB_BW_offB_GR: 73, onB_RW_offB_GB: 74});
//show_group('tb', [75, +1]);
var tb = noport.alloc(Strip1D, {w: 2, vix2ch: [75, +1], ball1: 75, ball2: 76});

//show_group('angel', [40, +2]);
var angel = gport.alloc(Strip1D, {w: 3, vix2ch: [40, +2], body: 40, wings: 41, trumpet: 42});

//show_group('star', [43, +2]);
var star = noport.alloc(Strip1D, {w: 3, vix2ch: [43, +2], aura_B: 43, inner_Y: 44, outer_W: 45});


//show_group('shep', [103, +3]);
var shep = bport.alloc(Strip1D, {w: 4, vix2ch: [103, +3], shep_1guitar: 103, shep_2drums: 104, shep_3oboe: 105, shep_4sax: 106});
//show_group('sheep', [107, +5]);
var sheep = bport.alloc(Strip1D, {w: 6, vix2ch: [107, +5], sheep_1: 107, sheep_2: 108, sheep_3cymbal: 109, sheep_4: 110, sheep_5snare: 111, sheep_6tap: 112});
//show_group('she_bank', [113, +3]);
var she_bank = bport.alloc(Strip1D, {w: 4, vix2ch: [113, +3], onShep_RG_offShep_WB: 113, onCane: 114, onSh_BG_offSh_WR: 115, onSheep_RB_offSheep_WG: 116});


//show_group('gdoor', [298, +1], [416, +1]);
var gdoor = wport.alloc(Strip1D, {w: 2, vix2ch: [298, +1], vix2alt: [416, +1], macro: +0, bitmap: +1});

//show_group('ab', [16, +23]);
var ab = wport.alloc(Rect2D, {w: 3, h: 8, vix2ch: [16, +23], body: +0, wings: +1, bell: +2});

//show_group('nat', 46, [83, +7], 232);
var cross = wport.alloc(Single0D, {numch: 1, vix2ch: 46, cross: 46});
var nat = wport.alloc(Strip1D, {w: 9, vix2ch: [83, +7], mary: 83, joseph: 84, cradle: 85, stable: 86, king_R1: 87, king_B2: 88, king_G3: 89, fireplace: 90});
var donkey = wport.alloc(Single0D, {numch: 1, vix2ch: 232, donkey: 232});

//show_group('gift', [77, +4], 82);
var gift = wport.alloc(Strip1D, {w: 6, vix2ch: [77, +4], gift_1M: 77, gift_2R: 78, gift_3B_top: 79, gift_3B_bot: 80, tags: 81});
var city = wport.alloc(Single0D, {numch: 1, vix2ch: 82, city: 82});

//show_group('acc', [96, +4]);
var acc = wport.alloc(Strip1D, {w: 5, vix2ch: [96, +4], guitar_1: 96, stick_2a: 97, stick_2b: 98, oboe: 99, sax: 100});
//show_group('acc_bank', [101, +1]);
var acc_bank = wport.alloc(Strip1D, {w: 2, vix2ch: [101, +1], on23_off01: 101, on13_off02: 102});

//show_group('tuneto', 205);
var tuneto = wport.alloc(Single0D, {numch: 1, vix2ch: 205, tuneto: 205});

//show_group('af', [117, +63]);
//show_group('arches', [117, +31]);
//show_group('fans', [149, +31]);
//var af = aport.alloc(Rect2D, {w: 8, h: 8, vix2ch: [117, +63]});
var arches = wport.alloc(Rect2D, {w: 8, h: 4, vix2ch: [117, +31]});
var fans = wport.alloc(Rect2D, {w: 8, h: 4, vix2ch: [133, +31]});


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// apply custom model extensions:

models.Model.all.forEach(function(model, inx)
{
    vix2.AddMixin(model); //allow Vixen2 channel values to be set/mapped
});

//xmas.songs.forEach(function(seq, inx)
//{
//    vix2.AddMixin(seq); //render using mapped Vixen channel values
//});

/*TODO
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
*/


//eof
