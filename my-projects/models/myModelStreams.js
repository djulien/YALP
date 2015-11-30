//create custom model object streams

'use strict';

var colors = require('colors'); //require('colors/safe'); //https://www.npmjs.com/package/colors; http://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
var inherits = require('inherits'); //my-plugins/utils/class-stuff').inherits;
var fs = require('fs');
//var allow_opts = require('my-plugins/utils/class-stuff').allow_opts;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/*
//add some customization:
var YalpSplitter = require('my-plugins/streamers/YalpStreams').YalpSplitter;
YalpSplitter.DefaultOptions =
{
    want_strline: true, //easier debug
    dedup: true, //avoid redundant updates
//use .all instead    auto_export: true, //other other modules to access my streams
    zinit: false, //allow smoother xition from previous seq
};
YalpSplitter.prototype.warn = function(msg)
{
    if (isNaN(++this.stats.warnings)) this.stats.warnings = 1;
    var args = Array.from(arguments);
    args[0] = colors.yellow("warning: " + args[0]);
    console.error.apply(null, args);
}
*/


//add custom behavior:
function Model2D(opts)
{
    if (!(this instanceof Model2D)) return makenew(Model2D, arguments);
    var args = Array.from(arguments);
    if (opts.vix2ch) { opts.firstch = opts.vix2ch[0]; opts.numch = opts.vix2ch[1]; }
    if (opts.vix2alt) { opts.altch = opts.vix2alt[0]; assert(opts.vix2alt[1] == opts.vix2ch[1]); }
    args[0] = opts;
//    YalpSplitter.apply(this, args); //base class ctor
    Model2D.all = YalpSplitter.all;
}
//inherits(Model2D, YalpSplitter);


//TODO var Model2D = module.exports.Model2D = require('my-projects/models/model-2d'); //generic

//var RenXt = {AddProtocol: function(port) { console.log("TODO: assign RenXt protocol to port '%s'", port.name || port.device); }}; //require('my-plugins/hw/RenXt');
var RenXt = require('my-plugins/hw/RenXt');

//NOTE: vixch should match Vixen2 profile info
//use this model for entire-house fx:
//var entire = module.exports.CustomModels.entire = new Model2D('tutorial'); //.fill(toRGBA(11, 22, 33));

//use bottom row of canvas for virtual fx:

/*
//show_group('fx', [395, +5]);
var fx = new Model2D({name: 'fx', x: 0, y: 0, w: 5, h: 1, zinit: false, vix2ch: [395, +5], color_a: 395, color_r: 396, color_g: 397, color_b: 398, text: 399});
fx.vix2render = function() {} //TODO

//show_group('snglobe', [300, +2], [418, +2]);
var snglobe_fx = new Model2D({name: 'snglobe', y: 0, w: 2, zinit: false, vix2ch: [300, +2], vix2alt: [418, +2], macro: +0, bitmap: +1});
snglobe_fx.vix2render = function() {} //TODO

var gdoor_fx = new Model2D({name: 'gdoor-fx', y: 0, w: 2, zinit: false, vix2ch: [298, +2], vix2alt: [416, +1], macro: +0, bitmap: +1});
gdoor_fx.vix2render = function() {} //TODO
*/


//archfans near bottom:
//var archfans = new Model2D({name: 'TODO: AF', x: 0, y: 1, w: 4 * 8, h: 8});
/*
//show_group('af', [117, +64]);
//show_group('arches', [117, +32]);
//show_group('fans', [149, +32]);
//var af = aport.alloc(Rect2D, {name: 'af', w: 8, h: 8, zinit: false, vix2ch: [117, +64]});
var arches = new Model2D(Rect2D, {name: 'arches', w: 8, h: 4, zinit: false, vix2ch: [117, +32]});
arches.vix2render = function() {} //TODO
var fans = new Model2D(Rect2D, {name: 'fans', w: 8, h: 4, zinit: false, vix2ch: [133, +32]});
fans.vix2render = function() {} //TODO

//show_group('tuneto', 205);
var tuneto = new Model2D(Single0D, {name: 'tune-to', numch: 1, zinit: false, vix2ch: 205, tuneto: 205});
tuneto.vix2render = function() {} //TODO
*/


//nat figures next row:
//var nat = new Model2D({name: 'TODO: Nat-fig', x: 0, y: 9, w: 4 * 12, h: 24});

/*
//show_group('shep', [103, +4]);
var shep = new Model2D({name: 'shep', w: 4, zinit: false, vix2ch: [103, +4], shep_1guitar: 103, shep_2drums: 104, shep_3oboe: 105, shep_4sax: 106});
shep.vix2render = function() {} //TODO
//show_group('sheep', [107, +6]);
var sheep = new Model2D({name: 'sheep', w: 6, zinit: false, vix2ch: [107, +6], sheep_1: 107, sheep_2: 108, sheep_3cymbal: 109, sheep_4: 110, sheep_5snare: 111, sheep_6tap: 112});
sheep.vix2render = function() {} //TODO
//show_group('she_bank', [113, +4]);
var sh_bank = new Model2D({name: 'sh-bank', w: 4, zinit: false, vix2ch: [113, +4], onShep_RG_offShep_WB: 113, onCane: 114, onSh_BG_offSh_WR: 115, onSheep_RB_offSheep_WG: 116});
sh_bank.vix2render = function() {} //TODO
*/

/*
//show_group('nat', 46, [83, +8], 232);
var cross = new Model2D({name: 'cross', numch: 1, zinit: false, vix2ch: 46, cross: 46});
cross.vix2render = function() {} //TODO
var nat = new Model2D({name: 'nat-people', w: 9, vix2ch: [83, +9], mary: 83, joseph: 84, cradle: 85, stable: 86, king_R1: 87, king_B2: 88, king_G3: 89, fireplace: 90});
nat.vix2render = function() {} //TODO
var donkey = new Model2D({name: 'donkey', numch: 1, zinit: false, vix2ch: 232, donkey: 232});
donkey.vix2render = function() {} //TODO

//show_group('gift', [77, +5], 82);
var gift = new Model2D({name: 'gift', w: 6, zinit: false, vix2ch: [77, +5], gift_1M: 77, gift_2R: 78, gift_3B_top: 79, gift_3B_bot: 80, tags: 81});
gift.vix2render = function() {} //TODO
var city = new Model2D({name: 'city', numch: 1, zinit: false, vix2ch: 82, city: 82});
city.vix2render = function() {} //TODO

//show_group('acc', [96, +5]);
var acc = new Model2D({name: 'acc', w: 5, zinit: false, vix2ch: [96, +5], guitar_1: 96, stick_2a: 97, stick_2b: 98, oboe: 99, sax: 100});
acc.vix2render = function() {} //TODO
//show_group('acc_bank', [101, +2]);
var acc_bank = new Model2D({name: 'acc-bank', w: 2, zinit: false, vix2ch: [101, +2], on23_off01: 101, on13_off02: 102});
acc_bank.vix2render = function() {} //TODO
*/


//gdoor, cols, tree, angel, gifts:

//show_group('gdoor', [298, +2], [416, +2]);
var gdoorL = new Model2D({name: 'gdoorL', x: 0, y: 33, w: 24, h: 16, zinit: false, order: Model2D.prototype.B2T_R2L, output: 'GRB'});
var gdoorR = new Model2D({name: 'gdoorR', y: 33, zinit: false, order: Model2D.prototype.B2T_L2R, output: 'GRB'});
var gdoor_all = new Model2D({name: 'gdoor-all', x: gdoorL.left, y: 33, w: gdoorR.right - gdoorL.left, zinit: false});

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

//maps sparse 42 x 51 rect to 4 x 80 rect
//(0, 0) in lower left corner
Model2D.prototype.ColumnNodes = function()
{
//    console.log("columns: %s x %s @(%s..%s, %s..%s)", this.width, this.height, this.left, this.right, this.bottom, this.top);
    for (var i = 0; i < 37+42+1; ++i)
        if (i < 37) this.nodelist.push(this.pixelXY(0, this.T2B(i))); //colL is upper part of left edge of canvas
        else if (i < 37+42) this.nodelist.push(this.pixelXY(i - 37, 0)); //colH is bottom edge of canvas
        else this.nodelist.push(null); //pad out remaining nodes
    for (var y = 0; y < 50+30; ++y)
        this.nodelist.push((y < 50)? this.pixelXY(Math.round((this.left + this.right) / 2), this.T2B(y)): null);
    for (var y = 0; y < 50+30; ++y)
        this.nodelist.push((y < 50)? this.pixelXY(this.right - 1, this.T2B(y)): null);
    for (var y = 0; y < 80; ++y)
        this.nodelist.push(null); //set 4th parallel string even tho there is no hardware; this reduces parallel palette entropy
//    console.log("columns %d nodes", this.nodelist.length);
}

//show_group('col', [181, +24]);
var cols_LMRH = new Model2D({name: 'cols-LMRH', y: 33, w: 42, h: 51, zinit: false, order: Model2D.prototype.ColumnNodes, output: 'GRB', nodetype: RenXt.WS2811(RenXt.PARALLEL)}); //, vix2ch: [181, +24], noop: [181, 182, 189, 197, 198]}); //w: 42, h: 51, numnodes: 3 * 80,
//show_group('colL', [181, +8]);
var colL = new Model2D({name: 'colL', x: cols_LMRH.left, y: cols_LMRH.top - 37, w: 1, h: 37, zinit: false, vix2ch: [183, +6]}); //, adrs: cols_, startch: cols_LMR.startch}); //, top: 183, bottom: 188}); //overlay
colL.vix2render = function() {} //TODO
//show_group('colM', [189, +8]);
var colM = new Model2D({name: 'colM', x: Math.round((cols_LMRH.left + cols_LMRH.right) / 2), y: cols_LMRH.top - 50, h: 50, zinit: false, vix2ch: [190, +7]}); //, startch: cols_LMR.startch, top: 190, bottom: 196});
colM.vix2render = function() {} //TODO
//show_group('colR', [197, +8]);
var colR = new Model2D({name: 'colR', x: cols_LMRH.right - 1, y: cols_LMRH.top - 50, zinit: false, vix2ch: [199, +6]}); //, top: 199, bottom: 204});
colR.vix2render = function() {} //TODO

/*
//show_group('mtree', [47, +24]);
var mtree = new Model2D({name: 'mtree', w: 24, zinit: false, vix2ch: [47, +24]});
mtree.vix2render = function() {} //TODO
//show_group('mtree_bank', [71, +4]);
var mtree_bank = new Model2D({name: 'mtree-bank', w: 4, zinit: false, vix2ch: [71, +4], onA_BW_offA_GR: 71, onA_RW_offA_GB: 72, onB_BW_offB_GR: 73, onB_RW_offB_GB: 74});
mtree_bank.vix2render = function() {} //TODO
//show_group('tb', [75, +2]);
var tb = new Model2D({name: 'tb', w: 2, zinit: false, vix2ch: [75, +2], ball1: 75, ball2: 76});
tb.vix2render = function() {} //TODO

//show_group('angel', [40, +3]);
var angel = new Model2D({name: 'angel', w: 3, zinit: false, vix2ch: [40, +3], body: 40, wings: 41, trumpet: 42});
angel.vix2render = function() {} //TODO

//show_group('star', [43, +3]);
var star = new Model2D({name: 'star', w: 3, zinit: false, vix2ch: [43, +3], aura_B: 43, inner_Y: 44, outer_W: 45});
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
//    this.nodelist = []; //new Array(w * h);
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
//    return this.nodelist;
}

//show_group('ic', [2, +14]);
//NOTE: previous value of x, y, w, h is used if not specified
debugger;
var ic1 = new Model2D({name: 'ic1', x: 0, y: 100, w: 33, h: 10, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //{from: 32, to: 0}, vorder: {from: 9: to: 0}});
var ic2 = new Model2D({name: 'ic2', y: 100, w: 30, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //[{from: 30, to: 1}]});
var ic3 = new Model2D({name: 'ic3', y: 100, w: 30, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //[{from: 30, to: 1}]});
var ic4 = new Model2D({name: 'ic4', y: 100, w: 24+8, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //[{from: 24+8, to: 1+8}, {from: 8, to: 1}]});
var ic5 = new Model2D({name: 'ic5', y: 100, w: 34, zinit: false, order: Model2D.prototype.R2L_T2B, output: 'GRB'}); //[{from: 34, to: 1}]});
//var icbig = new Model2D({name: 'icbig', y: 100, w: 15+33, zinit: false, order: Model2D.prototype.CustomX_T2B.bind(undefined, [15+33, 1+33], [1, 8], [33, 17], [9, 13], [16, 14]), output: 'GRB'}); //order: [{from: 15+33, to: 1+33}, {from: 1, to: 8}, {from: 33, to: 17}, {from: 9, to: 13}, {from: 16, to: 14}]});
var icbig = new Model2D({name: 'icbig', y: 100, w: 15+33, zinit: false, order: function() { Model2D.prototype.CustomX_T2B.bind(this, [15+33, 1+33], [1, 8], [33, 17], [9, 13], [16, 14])(); }, output: 'GRB'}); //order: [{from: 15+33, to: 1+33}, {from: 1, to: 8}, {from: 33, to: 17}, {from: 9, to: 13}, {from: 16, to: 14}]});
//var icbig = new Model2D({name: 'icbig', y: 100, w: 15+33, zinit: false, order: function() { (CustomX_T2B.bind(this, [15+33, 1+33], [1, 8], [33, 17], [9, 13], [16, 14]))(); }, output: 'GRB'}); //order: [{from: 15+33, to: 1+33}, {from: 1, to: 8}, {from: 33, to: 17}, {from: 9, to: 13}, {from: 16, to: 14}]});
var ic_all = new Model2D({name: 'ic-all', x: ic1.left, y: 100, w: icbig.right - ic1.left, zinit: false, vix2ch: [2, +14]}); //yport.alloc(IcicleSegment2D.all, {name: 'ic-all', x: 0, y: 0, w: 207, h: 10, zinit: false}); //CAUTION: must use same port as segments
ic_all.vix2render = function() {} //TODO

/*
//show_group('floods', [282, +16], [400, +16]);
var floods = new Model2D({name: 'floods', w: 4, h: 4, zinit: false, vix2ch: [282, +16], vix2alt: [400, +15]}); //, chpool: aport}); //new Model();
floods.vix2render = function() {} //TODO

//show_group('ab', [16, +24]);
var ab = new Model2D({name: 'ab', w: 3, h: 8, zinit: false, vix2ch: [16, +24], body: +0, wings: +1, bell: +2});
ab.vix2render = function() {} //TODO
*/


/*
console.log("entire canvas: %d x %d (%s pixels)", entire.width, entire.height, hfmt(entire.width * entire.height, {scale: 'binary'}));
//summarize composite models:
Model2D.all.forEach(function(model)
{
    if (!(model.name || '').match(/-all$/i)) return;
    console.log("%s: %d x %d = %s pixels @(%d..%d, %d..%d)", model.name, model.width, model.height, not_hfmt(model.width * model.height, {scale: 'binary'}), model.left, model.right, model.bottom, model.top);
});
*/


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var Vix2YalpSource = require('my-plugins/adapters/vixen2').Vixen2YalpSource;

//test sequence to play:
var demo = new Vix2YalpSource({folder: 'my-projects/songs/xmas/Amaz*', xyalp2yalp: true, dedup: true, want_stats: true, want_strline: true, xspeed: true});
console.log("got %s frames", demo.frames.length);
//demo.rewind(); //force sort
//Array.prototype.splice.call(demo.frames, 5, demo.frames.length + 1);
//demo.dirty = true;
//demo.rewind();
//console.log("now %s frames", demo.frames.length, demo.frames);


demo
    .once('my-end', function() { console.error("timing perf:".blue, JSON.stringify(demo.timing_perf)); }) //NOTE: need to do this on Yalp, not stdout
//    .pipe(xform)
//    .pipe(splitter)
//    .pipe(process.stdout); //echo to stdout
    .pipe(fs.createWriteStream('zout.txt', {encoding: 'utf-8'})); //capture to file

//send source sequence to each model:
//NOTE: this only works if all models take ~ same amount of time
//Otherwise, models need to be kept in sync to avoid backpressure problems
demo.setMaxListeners(Model2D.all.length + 1); //avoid warnings but catch bugs
Model2D.all.forEach(function(model, name)
{
    console.log("vix2 seq piped to model2d stream", name);
    demo.pipe(model).pipe(fs.createWriteStream(model.name + '.out', {encoding: 'utf-8'})); //capture to file

});
console.log("Source seq '%s' streamed to %d models".cyan, demo.name, Model2D.all.length);


//eof