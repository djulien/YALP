#!/usr/bin/env node
//YALP stand-alone prop animation

"use strict"; //find bugs + typos easier
imports(); //hoist std libs



//graphics:
//const hippo = XPM.fromFile("./graphics/hippo-20x13.xpm"); //16x8.xpm");
//const image = XPM.fromFile("./graphics/hello-32x8txt.xpm");


//models:
//const {dev_strip} = require("./models/devpanel21");
const {dev_panel, mini_test, Blank} = require("./models/devpanel21");
const {angel} = require("./models/angel21");
const {wisemen} = require("./models/wisemen22");
const {shepherds} = require("./models/shepherds22");
//const {tree} = require("./models/tree21");
//const {mary} = require("./models/mary21");
//const {joseph} = require("./models/joseph21");
//const {manger} = require("./models/manger21");
const {gdoor} = require("./models/gdoor21");
TODO('standardize "person" prop + size, with "headgear"?');


//procedure:
//1 .emit() individual models to view model pieces and overall model layout + dimensions (or look at model source code)
//2 manually draw or otherwise apply fx or image to a grid matching model's dimensions
//3 render models individually or to a composite linear-mapped layer using .fillinto() if they will be controlled in parallel from 1 PIC
//1b  for composite layers, set bkg to 0 and then render using bitwise "colors" to make it easier to identify active palette entries
//4. emit RLE for each desired frame
//5, import into asm and compile firmware
//6. connect +5 and common ground for prop group, then individual IO pins for prop input; daisy-chaining + nullpx !needed
TODO("combine parallel palette entries, allow frame timing - beef up PIC RLE engine");

const model = shepherds[0]; //angel; //dev_panel; //wisemen[0]; //joseph; //mary; //dev_panel; //gdoor;
const img = XPM.fromFile("./models/devpanel-hello.xpm"); //"./graphics/HappyNewYear-cbm4.xpm"); //models/gdoor-calibrate.xpm"), BKG = 0xFFFFFF; //MerryChristmas-bw3.xpm");
const BKG = Object.values(img.palette)[0];
//    const histogram = img.colorinx.reduce((counts, row) => (row.reduce((counts, key) => (++counts[hex(img.palette[key])] || (counts[hex(img.palette[key])] = 1), counts), counts), counts), {});
img.resize(model.width, model.height);
const histogram = Object.entries(img.palette)
    .map(([key, rgbval]) => ({key, rgbval, count: img.colorinx.reduce((occurs, row) => occurs + row.filter(palinx => palinx == key).length, 0)}))
    .reduce((counts, palent) => (counts[hex(palent.rgbval)] = palent.count, counts), {});
debug({histogram, total: Object.values(histogram).reduce((total, count) => total + count, 0)});
model.fill(BKG); //fill (pad) with first pal ent (assume == bkg) in case img smaller than model
for (let y = 0, yflip = flip(y, img.height); y < img.height; ++y, --yflip) //CAUTION: model origin == bottom left, xpm == top left
//        out.writeln("    DW" + img.colorinx[y].reduce((linebuf, palkey, x) => linebuf + ((x % (BITCHUNK/4))? "": x? ", 0x": " 0x") + hex(Object.keys(img.palette).indexOf(palkey), ""), "") + `${(y == img.height - 1)? " | 0x3000": ""}; //${y * img.width}..${(y + 1) * img.width - 1}`);
    for (let x = 0; x < img.width; ++x)
        model.nodes2D[x][y] = img.palette[img.colorinx[yflip][x]]; //copy rgb vals using xpm palette + model hwmap
//model.emit("test");


//logic:
//setImmediate(main_rom_image_4bpp); //allow in-line code to run first
async function main_rom_image_4bpp()
{
//    const model = gdoor;
//    const img = XPM.fromFile("./graphics/HappyNewYear-cbm4.xpm"), BKG = 0xFFFFFF; //MerryChristmas-bw3.xpm");
    if (numkeys(img.palette) > 16) fatal(`img palette too large: ${numkeys(img.palette)}`);
//debug(img.width, img.height, model.width, model.height);
//    const px = Array.from({length: img.width}, (_, x) => Array.from({length: img.height}, (_, y) => img.pixel(x, y)));
//    for (let x = 0; x < img.width; ++x)
//            Array.from(for (let xofs = 0; xofs < img.width; xofs += 14)
//        Array.from({length: Math.min(img.width - xofs, 14)}, (_, x) => img.palinx(flip(y, img.height), xofs + x).join(""))
//        for (let y = 0; y < img.height; ++y)
//            img.pixel(x, y);

//   const has_color = Object.entries(img.palette) //convert from tones to b&w
//        .reduce((colors, [palkey, color], inx) => (colors[palkey] = color & 0xFFFFFF, colors), {});
//debug(JSON.stringify(has_color));
//    pixel: {value: function(y, x) { return this.palette[this.colorinx[y][x]]; }},// * this.width + x]];
//    palinx: {value: function(y, x) { return this.colorinx[y][x]; }},
    const out = name2file("data/image.asm");
//debug(datestr(), "x", datestr({want_time: 1}));
//    const BITCHUNK = 12; //14; //12 is easier than 14 to unpack in PIC fw
//    const padbits = (BITCHUNK - 1) * img.width % BITCHUNK;
//debug(padbits);
    srcline();
    out.writeln(`image: ;//${img.width} x ${img.height} '${img.name}' at ${datestr({want_time: true})} by ${srcline.func}::${srcline.filename}`); //(+${padbits} pad)
//debug(Array(BITCHUNK - img.width % BITCHUNK).fill(Object.values(img.palette).findIndex(color => !color)));
//    img.width_sv = img.width;
//    if (padbits) img.resize(img.width + padbits, img.height); //colorinx.forEach(row => row.push(...Array(padbits).fill(" "))); //-1))); //Object.values(img.palette).findIndex(color => color)))); //make each row mult of 3; keeps last PIC word-packed alignment correct
//    for (let y = 0, yflip = flip(img.height, y); y < img.height; ++y, --yflip) //CAUTION: my origin == bottom left, xpm == top left
//        out.writeln("    DW" + img.colorinx[y].reduce((linebuf, palkey, x) => linebuf + ((x % (BITCHUNK/4))? "": x? ", 0x": " 0x") + hex(Object.keys(img.palette).indexOf(palkey), ""), "") + `${(y == img.height - 1)? " | 0x3000": ""}; //${y * img.width}..${(y + 1) * img.width - 1}`);
//        for (let x = 0; x < img.width; ++x)
//        out.writeln("  DW " + Array.from({length: img.width}, (_, x) => img.palinx(y, x)).reduce((linebuf, item, inx) => linebuf += ((inx % 14)? "": inx? ", 0b": " 0b") + has_color[item], "") + ";");
//1bpp unmapped:        out.writeln("    DW" + img.colorinx[y].reduce((linebuf, palinx, x) => linebuf + ((x % BITCHUNK)? "": x? "', b'": " b'") + +((img.palette[palinx] & 0xFFFFFF) != BKG), "") + "';");
//4bpp unmapped:        out.writeln("    DW" + img.colorinx[yflip].reduce((linebuf, palkey, x) => linebuf + ((x % (BITCHUNK/4))? "": x? ", 0x": " 0x") + hex(Object.keys(img.palette).indexOf(palkey), ""), "") + `${(y == img.height - 1)? " | 0x3000": ""}; //px[${y * img.width}..${(y + 1) * img.width - 1}]`);
    const CHUNK = 6 * Math.round(model.width / 6); //PIC fw packs 6 nodes/word-pair
    const hwmap_svlen = model.hwmap.length;
    if (model.hwmap.length % 6) model.hwmap.push(...Array(6 - model.hwmap.length % 6).fill({asRGB: BKG}));
//    for (let nodeofs = 0; nodeofs < model.hwmap.length; nodeofs += CHUNK)
    model.hwmap.chunks(CHUNK)
        .forEach((chunk, chunkinx) => out.writeln("    DW" + chunk
            .reduce((buf, node, bufinx) => buf + ((bufinx % 3)? "": bufinx? ", 0x": " 0x") + hex(Object.values(img.palette).map(rgbval => u32(rgbval)).indexOf(node.asRGB), ""), "") + `${((chunkinx + 1) * CHUNK >= model.hwmap.length)? " | 0x3000": ""}; //px[${chunkinx * CHUNK}..${(chunkinx + 1) * CHUNK - 1}]`));
    out.writeln("image_eof: ;//DW 0x30ff; //eof flag");
    out.writeln("  CONSTANT IMAGE_LEN = image_eof - image;");
    out.writeln(`\npalette: ;//${numkeys(histogram)}/${numkeys(img.palette)} x 3:`);
    Object.values(img.palette)
//        .filter(rgbval => histogram[hex(rgbval)])
        .forEach((rgbval, inx, all) => out.writeln(`  DW ${hex((rgbval >> 12) & 0xFFF)}, ${hex(rgbval & 0xFFF)}${(inx == all.length - 1)? " | 0x3000": ""}; //${commas(histogram[hex(rgbval)] || 0)} * [${hex(inx, "")}] ${hex(no_alpha(rgbval))}`));
//    out.writeln("  DW 0x30ff; //eof flag");
//    if (padbits) img.resize(img.width_sv, img.height); //restore img size
    if (hwmap_svlen % 6) model.hwmap.splice(hwmap_svlen); //restore hwmap < padding
    await out.await4close();
}
//setImmediate(main_rom_rle_4bpp); //allow in-line code to run first
async function main_rom_rle_4bpp()
{
    if (numkeys(img.palette) > 16) fatal(`img palette too large: ${numkeys(img.palette)}`);
    const out = name2file("data/rle.asm");
    const rle = []; //list of node1D inx that change from previous color
    model.hwmap.forEach((node, inx, all) =>
    {
        if (!inx || (inx >= rle.at(-1) + 255) || (/*no_alpha*/(node.asRGB) != /*no_alpha*/(all[inx - 1].asRGB))) rle.push(inx); //split longer runs into 256 bytes (for 8-bit counts)
    });
//debug(rle);
//    const BITCHUNK = 12; //14; //12 is easier than 14 to unpack in PIC fw
//  const padbits = (BITCHUNK - 1) * img.width % BITCHUNK;
    srcline();
    out.writeln(`rle: ;//${rle.length} blocks for ${img.width} x ${img.height} '${img.name}' at ${datestr({want_time: true})} by ${srcline.func}::${srcline.filename}`);
//  if (padbits) img.colorinx.forEach(row => row.push(...Array(padbits).fill(" "))); //-1))); //Object.values(img.palette).findIndex(color => color)))); //make each row mult of 3; keeps last PIC word-packed alignment correct
//debug(Object.values(img.palette).map(rgb => hex(rgb)));
//debug(model.hwmap.slice(66, 66+5).map(node => `{hwofs: ${node.hwofs}, x[0]: ${node.xylist[0].x}, y[0]: ${node.xylist[0].y}, rgb: ${hex(node.asRGB)}, palinx: ${Object.values(img.palette).map(rgbval => u32(rgbval)).indexOf(/*u32*/(node.asRGB))}}`)); //Object.values !u32?
//debug(rle.map((blkst, inx) => ({len: (rle[inx + 1] || model.hwmap.length) - blkst, palinx: Object.values(img.palette).map(rgbval => u32(rgbval)).indexOf(/*u32*/(model.hwmap[blkst].asRGB))})).map(ent => JSON.stringify(ent)).join(", "));  
    const CHUNK = 8;
//    for (let ofs = 0; ofs < rle.length; ofs += RLECHUNK)
    rle.chunks(CHUNK)
        .forEach((chunk, chunkinx) => out.writeln("  DW" + chunk
            .map((blkst, inx) => ((rle[chunkinx * CHUNK + inx + 1] || model.hwmap.length) - blkst) | Object.values(img.palette).map(rgbval => u32(rgbval)).indexOf(model.hwmap[blkst].asRGB) << 8) //0xEPLL, P = 4-bit pal inx, L = 8-bit length, E = eof flag; NOTE: need to force rgb to u32 in new list
            .reduce((buf, rleblk, bufinx) => buf + (bufinx? ", ": " ") + hex(rleblk), "")
            + `${((chunkinx + 1) * CHUNK >= rle.length)? " | 0x3000": ""}; //px[${rle[chunkinx * CHUNK]}..${(rle[(chunkinx + 1) * CHUNK] || model.hwmap.length) - 1}]`));
    out.writeln("rle_eof: ;//DW 0x3000; //eof flag");
    out.writeln("  CONSTANT RLE_LEN = rle_eof - rle;");
    out.writeln(`\npalette: ;//${numkeys(histogram)}/${numkeys(img.palette)} x 3:`);
    Object.values(img.palette)
        .forEach((rgbval, inx, all) => out.writeln(`  DW ${hex((rgbval >> 12) & 0xFFF)}, ${hex(rgbval & 0xFFF)}${(inx == all.length - 1)? " | 0x3000": ""}; //${commas(histogram[hex(rgbval)] || 0)} * [${hex(inx, "")}] ${hex(/*no_alpha*/(rgbval))}`));
    await out.await4close();
}
function no_alpha(rgb) { return rgb & 0xFFFFFF; }


//setImmediate(color_wheel); //allow in-line code to run first
async function color_wheel()
{
    const grad = [];
    for (let H = HUE.RED; H < HUE.RED_WRAP; H += 10)
        grad.push(hsv2RGB({H, V: 10}));
    debug(grad.map(rgb => hex(rgb)).join(", "));
}


setImmediate(main_single); //allow in-line code to run first
async function main_single()
{
//    const model = mary; //manger; //joseph; //mary; //wisemen[0];
//debug(JSON.stringify(model));
//    model.fill(PAL.OFF);
//    if (model.body) model.fill(PAL.RED.dim(50), model.body);
//    if (model.hood) model.fill(PAL.WARM_WHITE.dim(50), model.hood);
//    if (model.head) model.fill(PAL.GOLD.dim(50), model.head);
//    model.fill(PAL.YELLOW.dim(50), manger.basket);
//    model.fill(PAL.BROWN.dim(50), manger.legs);
    model.draw(); //default texture
    await model.emit(model.name + "-paint");
}

async function x_main()
{
    const steps = hsvgrad(hsvdim(PAL.RED_FULL, 0xA0/0xFF), hsvdim(PAL.GREEN_FULL, 0xA0/0xFF), 30);
    steps.push(...hsvgrad(hsvdim(PAL.GREEN_FULL, 0xA0/0xFF), hsvdim(PAL.RED_FULL, 0xA0/0xFF), -30));
    steps.map(hsv => hsv2rgb(hsv))
        .forEach((rgb, inx, all) => console.log(`  DW ${hex(rgb.R)}, ${hex(rgb.G)}, ${hex(rgb.B)}`)); // ${inx}/${all.length}`); //  constant PAL_#v(${inx}) = LITERAL(${hex(hsv2RGB(hsv))});`));
//    debug(hsvgrad(PAL.GREEN_FULL, PAL.RED_FULL, -30).map(hsv => hex(hsv2RGB(hsv))).join(", "));
    return;
//    main_wisemen_angel_parallel();
    angel_alone();
    return;
    TODO("actual hsv color palette");
    const model = new Blank({width: /*wisemen[0].width*/ 16, height: 100}); //wisemen[0].height + 10}); //16, height: 100});
    debug("main", model.name, model.numpx, model.area); //, JSON.stringify(model.hwmap));
    const [fgcolor, bgcolor] = [PAL.COOL_WHITE, PAL.OFF]; //{H: HUE.GREEN, V: 60}]; //hsv2HSV({H: HUE.MAGENTA, v: 2/255});
    model.fill(bgcolor);
//    model.setxy([[0, 0], [3], {x:7}, {x:8, y:1}, [9, 0]], fgcolor);
//    model.fill(PAL.YELLOW, {x: 14, y: 3, w: 3, h: 2});
//    model.dump("angel-paint", {linelen: 100});
//debug("body", JSON.stringify(model.body));
//debug("head", JSON.stringify(model.head));
//    model.fill(PAL.CYAN, model.body);
//    model.fill(PAL.GOLD, model.head);
//    model.nodes2D[model.head.X][model.head.Y] = hsv2RGB(PAL.BLUE);
//    model.fill(PAL.OFF);
//    model.fill(image);
//    model.emit(model.name + "-paint");
//composite RLE:
TODO("figure out how to apply exclusions to foreign models? might be related to applying hwmap across models");
//color-code various model parts:
    tree.fillinto(model, PAL.FOREST_GREEN);
    tree.fillinto(model, PAL.ICE_WHITE, {X: 2, Y: 10, W: 2, H: 2});
    model.emit(model.name + "-paint");
    debug("main exit");
}


//setImmediate(main_composite_mjb_tree_parallel); //allow in-line code to run first
async function main_composite_mjb_tree_parallel()
{
    const model = new Blank({width: /*wisemen[0].width*/ 16, height: 100}); //wisemen[0].height + 10}); //16, height: 100});
    model.fill(0); //bgcolor);
//color-code various model parts:
//broken    model.fill(1, wisemen[0].body);
//broken    model.fill(2, wisemen[0].head);
//broken    model.fill(0, wisemen[0].face); //kludge: need explict exclusion when writing to a different model
    mary.fillinto(model, 0, mary.body, px => px | 0x01);
    mary.fillinto(model, 0, mary.hood, px => px | 0x02);
    joseph.fillinto(model, 0, joseph.body, px => px | 0x10);
    joseph.fillinto(model, 0, joseph.hood, px => px | 0x20);
    manger.fillinto(model, 0, manger.basket, px => px | 0x100);
    manger.fillinto(model, 0, manger.legs, px => px | 0x200);
    tree.fillinto(model, 0, tree, px => px | 0x1000);
    model.emit(model.name + "-paint");
    debug("main exit");
}
//setImmediate(main_composite_wisemen_angel_parallel); //allow in-line code to run first
async function main_composite_wisemen_angel_parallel()
{
    const model = new Blank({width: /*wisemen[0].width*/ 16, height: 100}); //wisemen[0].height + 10}); //16, height: 100});
//    debug("main", model.name, model.numpx, model.area); //, JSON.stringify(model.hwmap));
//    const [fgcolor, bgcolor] = [PAL.COOL_WHITE, PAL.OFF]; //{H: HUE.GREEN, V: 60}]; //hsv2HSV({H: HUE.MAGENTA, v: 2/255});
    model.fill(0); //bgcolor);
//3 wisemen + angel composite RLE:
//color-code various model parts:
//broken    model.fill(1, wisemen[0].body);
//broken    model.fill(2, wisemen[0].head);
//broken    model.fill(0, wisemen[0].face); //kludge: need explict exclusion when writing to a different model
    wisemen[0].fillinto(model, 1, wisemen[0].body);
    wisemen[0].fillinto(model, 2, wisemen[0].head); //, px => px | 0x100); //1, {X: 4, Y: 2, W: 3, H: 2}); //wisemen[0].head);
    angel.fillinto(model, 0, angel.wingL, px => px | 0x100);
    angel.fillinto(model, 0, angel.wingR, px => px | 0x100);
    angel.trim_wings((X, Y, h) => angel.fillinto(model, 0, {X, Y, W: 1, H: h}, px => px & ~0x100));
    angel.fillinto(model, 0, angel.body, px => px | 0x200);
    angel.fillinto(model, 0, angel.hair, px => px | 0x400);
    angel.fillinto(model, 0, angel.halo, px => px | 0x800);
    angel.fillinto(model, 0, angel.trumpet, px => px | 0x1000);
    model.emit(model.name + "-paint");
    debug("main exit");
}
function angel_alone()
{
    const model = new Blank({width: /*wisemen[0].width*/ 16, height: 100}); //wisemen[0].height + 10}); //16, height: 100});
    debug("main", model.name, model.numpx, model.area); //, JSON.stringify(model.hwmap));
    const [fgcolor, bgcolor] = [PAL.COOL_WHITE, PAL.OFF]; //{H: HUE.GREEN, V: 60}]; //hsv2HSV({H: HUE.MAGENTA, v: 2/255});
    model.fill(bgcolor);
    const gold_half = RGSWAP(asRGB(Object.assign({}, PAL.GOLD, {V: 50})));
debug(gold_half, hex(gold_half));
    angel.fill(gold_half, angel.wingL);
    angel.fill(gold_half, angel.wingR);
    angel.trim_wings(); //(X, Y, h) => angel.fillinto(model, 0, {X, Y, W: 1, H: h}));
    const wwhite_qtr = Object.assign({}, PAL.WARM_WHITE_FULL, {V: 25});
debug(wwhite_qtr, hex(asRGB(wwhite_qtr)));
    angel.fill(wwhite_qtr, angel.body);
    const yellow_half = Object.assign({}, PAL.YELLOW_FULL, {V: 50});
    angel.fill(yellow_half, angel.hair);
    angel.fill(gold_half, angel.halo);
    angel.fill(gold_half, angel.trumpet);
    model.emit(model.name + "-paint");
    angel.emit(angel.name + "-paint");
    debug("main exit");
}

TODO("some kind of masked fill, or polymorphic rect with irregular shape");


async function devpanel_main()
{
    const model = dev_panel; //mini_test; //dev_panel; //dev_strip32;
    debug("main", model.numpx, model.area, JSON.stringify(model.hwmap));
    const [fgcolor, bgcolor] = [PAL.MAGENTA, PAL.BLACK]; //hsv2HSV({H: HUE.MAGENTA, v: 2/255});
//model.dump("before fill");
    model.fill(bgcolor);
//model.dump("after fill");
    model.setxy([[0, 0], [3], {x:7}, {x:8, y:1}, [9, 0]], fgcolor);
//    model.nodes2D[1][1] = asRGB(fgcolor);
//    model.dump("1-1");
//    model.nodes2D[1][1] = asRGB(bgcolor);
//    model.nodes2D[2][2] = asRGB(fgcolor);
//    model.dump("2-2");
    model.setxy([[0,0], [1,1], [2,2], [3,3]], PAL.GREEN); //, [4,4], [5,5], [6,6], [7,7]], fgcolor);
    model.fill(PAL.YELLOW, {x: 14, y: 3, w: 3, h: 2});
//model.dump("after setxy");
//    model.fill(hippo, {x: 4});
    model.dump("hippo-devpanel", {linelen: 100});
    model.emit("hippo-devpanel");
    debug("main exit");
}
//setImmediate(main); //allow in-line code to run first


//fx:
//icicle drip 2020:
async function drip(model, opts)
{
    const {nodes2D, width: W, height: H, /*await_until*/} = model;
//    const {DURATION/*, FPS*/} = opts;
//    const colors = [CYAN_dim]; //toary(opts.color || WHITE);
    const durations = toary(opts.DURATION || 10e3); //msec
    model.fill((opts || {}).bgcolor || BLACK); //just clear all nodes once, then turn on/off individ; perf better than rendering entire grid each frame!
//    await await_until(0); //init frame dark
    const drops = [{0: 0}, {6: 60}, {12: 120}, {18: 180}, {24: 240}, {30: 300}]; //{xofs: hue360}
TODO("randomize color, position, speed, size, reveal text");
    const xofs = +opts.xofs || 0; //kludge: just change horiz ofs for now
//    drops.push(...drops, ...drops);
    const gradient_ramp = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 0.8, 0.9, 1.0]; //[0.05, 0.12, 0.3, 0.8, 1.0];
    const gradient_fade = gradient_ramp.slice().reverse(); //https://stackoverflow.com/questions/30610523/reverse-array-in-javascript-without-mutating-original-array
//    const [steplen_fade, steplen_drip, steplen_fade] = [1e3/5, 1e3/20, 1e3/5]; //Math.floor(durations[0] / 13)]; //msec
    const steplen = 1e3/30; //Math.floor(durations[0] / 13)]; //msec
    const SLOWER = 1; //2; //NOTE: need const step speed for easier timing control; vary step# speed instead
    let step = 0; //kludge: put at this scope so inner funcs can find it
    for (const drop of drops)
    {
        const [xstr, hue360] = Object.entries(drop)[0]; const x = +xstr;
if ((+xofs + x < 0) || (+xofs + x >= W)) continue; //clip
        const hsv360 = {h: hue360, s: 100, v: 10}; //100 is too bright; try 10%
        const color = rgb2RGB(hsv2rgb(hsv360));
debug("ic drip: xofs %d, hue %d -> color 0x%x, steplen %'d msec", +x, hue360, color, steplen);
        let y = H - 1;
//fade up icicle drip (pre-drip):
        for (const br of gradient_ramp)
        {
            const color_dim = rgb2RGB(hsv2rgb(hsv360.h, hsv360.s, hsv360.v * br));
            nodes2D[xofs + x][y] = color_dim;
            await await_until((step += SLOWER) * steplen); //adaptive; 1/3 speed
            nodes2D[xofs + x][y] = BLACK;
        }
//drip:
        for (--y; y > 0; y -= 2)
        {
            nodes2D[xofs + x][y] = color;
            await await_until(++step * steplen); //adaptive
            nodes2D[xofs + x][y] = BLACK;
        }
        y = 0; // in case height is odd
//fade down icicle drip (post-drip):
        for (const br of gradient_fade)
        {
            const color_dim = rgb2RGB(hsv2rgb(hsv360.h, hsv360.s, hsv360.v * br));
            nodes2D[xofs + x][y] = color_dim;
            await await_until((step += SLOWER) * steplen); //adaptive; 1/3 speed
            nodes2D[xofs + x][y] = BLACK;
        }
    }
}


/*
const pxbuf =
[
    0x11111111,
    0x22222222,
    0x33333333,
    0x44444444,
    0x55555555,
    0x66666666,
    0x77777777,
    0x88888888,
];
//should become: [ 0x01, 0x1e, 0x66, 0xaa, ... ]; (32 long)
//console.log(hex(0x80000000));
console.log(pxbuf.map(row => hex(row)), srcline());
console.log(pivot32x8(pxbuf).map(row => hex(row)).join(", "), srcline());
process.exit();

function pivot32x8(buf32x8)
{
    const retval = [];
    for (let bit = u32(0x80000000), count = 0; bit; bit >>>= 1, ++count)
//    {console.log(hex(bit)); if (count > 10) break;
        retval.push(buf32x8.reduce((colval, rowval, y) => colval | ((rowval & bit)? 1 << (8-1 - y): 0), 0));
//    }
    return retval;
}
*/


//function x()
//{
//  var stack = new Error().stack,
//        caller = stack.split('\n')[2].trim();
//        console.log(caller);
//}


/*
//custom model:
//const test = Object.assign(new Model(),
function TestModel(opts)
{
    if (!(this instanceof TestModel)) return new TestModel(opts);
    Model.call(this, opts); //super ctor
    TestModel.prototype = Object.create(Model.prototype); //inherit from Model
    Object.defineProperty(TestModel.prototype, 'constructor', //set new ctor function
    {
        value: TestModel,
        enumerable: false, //hide from "for in" loops
        writable: true ,
    });
//    portnum: x, startnode: x,
//    get nodes2D() { return replace_prop.call(this, grid(20, 1)); },
//    get width() { return replace_prop.call(this, this.nodes2D.length); },
//    get height() { return replace_prop.call(this.nodes2D[0].length); },
//     },
    TestModel.prototype.method = function() { };
}
*/


//////////////////////////////////////////////////////////////////////////////////////////////////////////////


//function my_export(entpt) { Object.assign(module.exports, {[entpt.name]: entpt}); }
function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }


//put these down here to reduce clutter above but allow hoist:
function imports()
{
    require('colors').enabled = true; //for console output (all threads)
    const fs = require("fs");
    const Path = require("path");
    const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
    const XPM = require('./incl/xpm21');
    const {PAL, HUE, HSV2RGB, hsv2RGB, hsv2rgb, asRGB, hsvgrad, hsvdim, RGSWAP} = require("./incl/color-mgmt21");
    const {debug, srcline, TODO, hex, u32, commas, numkeys, name2file, datestr} = require("./incl/utils21");
    const {flip} = require("./models/model21");
    Object.assign(global, {PAL, HUE, HSV2RGB, hsv2RGB, hsv2rgb, asRGB, hsvgrad, hsvdim, RGSWAP, flip, assert, fs, Path, XPM, debug, srcline, TODO, hex, u32, commas, numkeys, datestr, name2file});
//require("magic-globals"); //__file, __line, __stack, __func, etc

//    const {isMainThread, threadId, workerData, Worker_bk, parentPort} = require('worker_threads');
//    Object.assign(global, {isMainThread, threadId, workerData, parentPort});
//    const /*addon*/{MAX_PORTS, UNIV_LEN, UNIV_PADLEN, frtime_usec: frtime_usec_from_api, FPS, /*FB,*/ brlimit, stats, statsdir, /*'FB.abkgloop': abkgloop,*/ fb, addr, debug, srcline, elapsed, isUN, Worker} = require("./index.js"); //.options({shmbuf()}); //require('bindings')('yalp-addon'); //.options({fbnum: 1}); //FB object
//    Object.assign(global, {MAX_PORTS, UNIV_LEN, UNIV_PADLEN, frtime_usec_from_api, FPS, brlimit, stats, statsdir, fb, addr, debug, srcline, elapsed, isUN, Worker});
//    const frtime_usec = isMainThread? frtime_usec_from_api: workerData.frtime_usec; //kludge: need to make timing calculations consistent
//    const NUM_WKERS = 1; //Math.max(require("os").cpus().length - 1, 1); //1 thread per core, leave one core free for parent thread
//    Object.assign(global, {frtime_usec, NUM_WKERS});
}

//eof