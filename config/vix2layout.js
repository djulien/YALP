#!/usr/bin/env node
//Vixen2 layout shim (*very* custom)

"use strict";
const assert = require('assert').strict; //https://nodejs.org/api/assert.html
const {models/*: {devpanel, mtree}*/, controller} = require("../../test/fxtest");
const {RED, GREEN, BLUE, CYAN, GOLD, BLACK, BLUE_dim, WHITE_dim, WARM_WHITE, COOL_WHITE, RGBdim1, RGBdimFF} = require("../incl/colors");
const {uint32, debug, TODO, commas, mp3play} = require("../incl/utils");
const {flip} = require("../models/model");
debug.max_arg_len = 500;

//const RED = 0xFFff0000;
//const GREEN = 0xFF00ff00;

const
{
//dev/test:
    devpanel,
//house/non-nat yard:
    ic, globes, fence,
//yard-nat:
    mtree,
} = models;
debug("imported models".brightCyan, Object.keys(models));


//map real models to 3 main virtual models/props:
//- house (decor)
//- yard (Nativity)
//- dev panel; this is actually a real model/prop, but only in dev env
const house = {};
const yard = {};
module.exports.controller = controller;
module.exports.models =
{
//NOTE: Vixen2 player expects a vixfx() method on all exported models
//    mtree,
    devpanel, //: models.devpanel,
    house, //handles ic, globes
    yard, //handles tree, nativity
};


//playback stats:
//mostly for tracking latency
const pbstats = {};


//misc model info:
const WingTrim =
[
    [0, -1], [0, -2], [1, -1], //TL
    [-2, -1], [-1, -2], [-1, -1], //TR
    [0, 2], [0, 1], [0, 0], [1, 0], //BL
    [-2, 2], [-2, 1], [-2, 0], [-1, 0], //BR
];


//"paint" ArchFans onto Globes:
TODO("recast these as fx, usable on any grid");
const Arch2Globe =
{
    0: [2,3,4].map((y) => `1,${y}`), //[[1,[2,3,4]]],
    1: [5,6,7].map((y) => `2,${y}`), //[[2,[5,6,7]]],
    2: [`3,8`, `4,9`],
    3: [5,6,7,8].map((x) => `${x},10`), //[[[5,6,7,8],10]],
};
xyfixup(Arch2Globe);
//debug(Arch2Globe);

const Fan2Globe =
{
    0: [[2,3,4,5,6,7,8].map((x) => `${x},2`), [2,3,4,5,6].map((x) => `${x},3`), `2,4`, `3,4`], //[2..8,2], [2..6,3], [2,4], [3,4]],
    1: [`3,6`, `4,6`, [3,4,5].map((x) => `${x},5`), [4,5,6].map((x) => `${x},4`), `6,3`, `7,3`, `8,2`], //[[3..4,6], [3..5,5], [4..6,4], [6..7,3], [8,2]],
    2: [`3,7`, `4,7`, `4,8`, [9,8,7,6].map((y) => `5,${y}`), [7,6,5].map((y) => `6,${y}`), `8,2`, `7,3`, `7,4`], //[3..4,7], [4,8], [5,9..6], [6,7..5], [8,2], [7,3], [[7,4]],
    3: [[9,8,7].map((y) => `6,${y}`), [9,8,7,6,5,4].map((y) => `7,${y}`), [9,8,7,6,5,4,3,2].map((y) => `8,${y}`)], //[[6,9..7], [7,9..4], [8,9..2]],
};
xyfixup(Fan2Globe);
//debug(Fan2Globe);
//process.exit();

function xyfixup(pts)
{
//    Object.entries(pts).forEach((key, xylists) => pts[key] = xylists.flat().map(str2xy));
    for (const key in pts)
    {
//flatten arrays, split x/y strings:
        pts[key] = pts[key].flat().map((xy) => xy.split(",")).map(([x, y]) => ({x: +x, y: +y}));
//horiz mirror to create other half of map:
        pts[flip(key, 8)] = pts[key].map(({x, y}) => ({x: flip(x, 18), y}));
    }
//    for (const [key, xylist] of Object.entries(pts))
//        pts[flip(+key, 8)] = xylist.map(({x, y}) => ({x: flip(x, 18), y}));
    return pts;
//    function str2xy(xystr) { const [x, y] = xystr.split(","); return {x, y}; } //map(range2pt));
}
//function range2pt(xylist)
//{
//    return xylist.map(([x, y]) => Array.isArray(x)? Array.from({length: 
//}
//function range(from, to) { return Array.from({length: to - from + 1}).map((_, inx) => from + inx); }
//function lst(str)
//{
//    const parts = str.match(/^\s*(\d)\s*-\s*(\d)\s*$/);
//    if (!parts) return str;
//    const from = Math.min(+parts[1], +parts[2]), to = Math.max(+parts[1], +parts[2]);
//    return Array.from({length: from - to + 1}).map((_, inx) => from + inx);
//}



//get prop info from Vixen2 profile:
function vix2ch(findch, getchval)
{
//profile info: [#ch, chname re]
    const profile =
    {
        beat: [2, /^Beat 1/],
        ic: [14, /^Chasecicle 1L/],
        ab: [8*3, /^AngelBell 1U Body/], //{body, head/wings, bell} x8: 4 L2R upper, 4 L2R lower
        angel: [3, /^Angel Body/], //{body, wings, trumpet}
        star: [3, /^Star B/], //{b aura, y inner, w outer}
        cross: /^Cross/,
        mtree: [12*2+2*2+2, /^Mtree 1A/],
        mtbank: [2*2, /^Mtree off=GR\/ON=BW BankA/], //{BW BankA, RW BankA, BW BankB, RW BankB}
        trballs: [2, /^Tree Ball 1/], //!used?
        gift: [6, /^Gift 1/], //{g1, g2, g3, g overlap, tags, city hills}
        MJB: [3, /^Mary/], //{M, J, B, stable}
        wise: [3, /^King 1/],
        fp: /^Fireplace/,
//    spare: /^spare 92/, //{92, 93, 94, blank, dead} some spares used?!
        acc: [5+2, /^FPArch 1/], //{fparch/instr/sidewk/heart 1, 2, 3, 4, 5} instr2+3  = drum sticks
        accbank: [2, /^Acc Bank off=01/], //{sel 23, sel 13} FPArch 1/Instr 2/Sidewalk 3/Heart 4
        shep: [4+6+4, /^Shep 1\/Guitar/], //{Shep 1 Guitar, Shep 2 Drums, Shep 3 Oboe, Shep 4 Sax}
        sheep: [6, /^Sheep 1/], //{Sheep 1, Sheep 2, Sheep 3/Cymbal, Sheep 4, Sheep 5/Snare, Sheep 6/Tap}
        shbank: [4, /^Shep off/], //{shep RG, Cane, sh/sh BG, sheep RB} bank selects
        /*archfan*/af: [2*4*8, /^ArchFan 1.1A/], //{a 1, a 2, a 3, a 4, f 1, f 2, f 3, f 4} 8 each
        cols: [3*8, /^HC Column L.8x/], //{L8x, L7x, L6t, L5, L4, L3, L2, L1b, M8x, M7t, M6, M5, M4, M3, M2, M1b, R8x, R7x, R6t, R5, R4, R3, R2, R1b}
        tuneto: /^Tune To/, //marque built-in
//dead/unused/spare
        donkey: /^donkey/,
        flood: [4*4, /^Flood 1 R \d+$/], //{1R, 1G, 1B, 1W, 2..., 3..., 4...}
        macro: [4, /^Gdoor Macro \d+$/], //{gdoor macro, bitmap, snglobe macro, bitmap}
        timing: [3, /^Timing MSB \d+$/], //{msb, mid, lsb} 24-bit value
//debug(timing_chinx);
//    assert(timing_chinx[0] + 1 == timing_chinx[1] && timing_chinx[1] + 1 == timing_chinx[2], timing_chinx);
//some unused except 377 - 382??
        macrofx: [5, /fx color.a/], //{color: A, R, G, B, text}
        flood2: [4*4, /^Flood 1 R \d+\/\d+/], //copy of floods
        macro2: [4, /^Gdoor Macro \d+\/\d+/], //copy
        timing2: [3, /^Timing MSB \d+\/\d+$/], //copy
    };
    const retval = Object.entries(profile)
        .map(([name, info]) => [name, !Array.isArray(info)? [1, info]: info]) //default #ch = 1
        .map(([name, info]) => [name, Object.assign(info,
        {
//            [name + "_chinx"]: findch(info[1]),
//            [name + "_numch"]: info[0],
            chinx: findch(info[1]),
            numch: info[0],
            chvals: function(frinx) { return getchval(this.chinx, frinx, this.numch); },
            chdim: function(frinx, i, color) { return (color & 0xffffff)? RGBdimFF(color, getchval(this.chinx + i, frinx)): 0; }, //no need to dim black :P
        })])
        .reduce((obj, [name, info]) => Object.assign(obj, {[name + "_vix2"]: info}), {});
debug(retval);
//verify all data for a prop is contiguous:
    assert(retval.mtbank_vix2.chinx == retval.mtree_vix2.chinx + 2*12, `${retval.mtbank} ${retval.mtree}`);
    assert(retval.trballs_vix2.chinx == retval.mtree_vix2.chinx + 2*12 + 4);
    assert(retval.acc_vix2.chinx == retval.accbank_vix2.chinx + 2);
    assert(retval.shbank_vix2.chinx == retval.sheep_vix2.chinx + 6);
//    assert(timing2_chinx[0] + 1 == timing2_chinx[1] && timing2_chinx[1] + 1 == timing2_chinx[2], timing2_chinx);
//a couple of unused channels at end
//debug("found beat tracks:", beat_chinx, "timing tracks:", timing_chinx, timing2_chinx, "ic", ic_chinx, "tree", mtree_chinx);
    return retval;
}


//house/yard (non-nativity) decor:
house.vixfx = async function({name, getchval, findch, numfr, msec2frinx}) //, wait4frame)
{
//return;
    const {ic_vix2, ab_vix2, af_vix2} = vix2ch(findch, getchval);
//    this.fill(BLACK); //just do once; then repaint all virtual subprops
//    ic.fill(BLACK);
//    for (let i = 0; i < 4; ++i) globes[i].fill(BLACK);
    for (let prev = {frnum: 0, time: 0}, next = {}; prev.frnum < numfr; prev = next)
    {
        render.call(this, prev.frnum); //in case !already rendered (could happen on skipped frames)
        output.call(this, prev.frnum); //this.out(true); //outputed = frinx;
        render.call(this, prev.frnum + 1); //try to work ahead (speculative): pre-render next
if (!(prev.frnum % 300)) debug("house output+pre-rend fr# %'d/%'d msec, wait next, mp3 %'d sec", prev.frnum, prev.time, mp3play.timestamp || 0);
        next.time = await this.wait4frame(prev.time);
        next.frnum = msec2frinx(next.time); //adaptive: repeats or skips frames to align seq with ctlr
//        if (nextfr >= numfr) break; //eof
//        [prevtime, prevfr] = [nexttime, nextfr];
    }

    function output(frinx)
    {
        if (this.hasOwnProperty("outputed") && frinx <= this.outputed) return;
        if (frinx > numfr) return;
//        this.out();
//        if (this.dirty) {}
//        for (let i = 0; i < globes.length; ++i) globes[i].out(); //only 1 globe for now
//        for (let i = 0; i < ic.segments.length; ++i) ic.segments[i].out();
        for (const globe of globes) globe.out();
        for (const icseg of ic.segments) icseg.out();
        fence.out();
        this.outputed = frinx;
    }

    function render(frinx)
    {
        if (this.hasOwnProperty("rendered") && frinx <= this.rendered) return;
        if (frinx > numfr) return;
//big props:
        render_ic();
        if (!render_af()) render_ab(); //first try: both mapped to globes; af more expressive, should override ab
        render_mood();
//state:
//        this.dirty = true;
        this.rendered = frinx; //keep track of work done already
    }

/ic x14
//first try: map each channel to 1/14th of real ic (~11x10)
    function render_ic()
    {
        const CYAN_ic = RGBdim1(CYAN, 1/2); //can be bright since diffused
        const icw = Math.round(ic.width / 14); //, remainder = ic.width - 13 * icw;
//        const ic_chvals = ic_vix2.chvals(frinx); //getchval(ic_chinx, frinx, 14);
//        for (let i = 0; i < ic_chvals.length; ++i)
//            ic.nodes1D.fill(RGBdimFF(CYAN_ic, ic_chvals[i]), ic.height * i * icw, ic.height * (i + 1)  * icw);
        for (let i = 0; i < ic_vix2.numch; ++i)
            ic.nodes1D.fill(ic_vix2.chdim(frinx, i, CYAN_ic), ic.height * i * icw, ic.height * (i + 1) * icw);
        for (const icseg of ic.segments) icseg.dirty = true;
    }

//archfans: x64 {a 1, a 2, a 3, a 4, f 1, f 2, f 3, f 4} 8 each
//first try: "draw" onto globes
TODO("arches -> fence instead?");
    function render_af()
    {
//palette:
        const MAXBR = 0.6;
        const WHITE_arch = RGBdim1(WARM_WHITE, MAXBR);
        const WHITE_fan = RGBdim1(COOL_WHITE, MAXBR);
//render:
//        const af_chvals = getchval(af_chinx, frinx, 64);
TODO("add af active ch to vix2 (mem/perf)");
        const want_archfans = ~af_chvals.findIndex((chval) => chval);
TODO("add propsel ch for ab vs. af to reduce memory access at runtime");
        if (want_archfans)
            for (let af = 0; af < 4; ++af)
            {
                const afrot = (af + 1) % 4; //use AF3 on single globe
                globes[afrot].fill(BLACK);
                for (let a = 0; a < 8; ++a)
                    Arch2Globe[a].forEach(({x, y}) => globes[afrot].nodes2D[x][y] = RGBdimFF(WHITE_arch, af_chvals[16 * af + a]));
                for (let f = 0; f < 8; ++f)
                    Fan2Globe[f].forEach(({x, y}) => globes[afrot].nodes2D[x][y] = RGBdimFF(WHITE_arch, af_chvals[16 * af + 8 + f]));
            }
        return want_archfans;
    }

//angelbells {body, head/wings, bell} x8: 4 L2R upper, 4 L2R lower
//first try: fill globes with color rep angelbells
//next try: "draw" angels/bells onto globes
    function render_ab()
    {
//for now, map U/L body -> gold globe, bell -> colored globe
//        const GOLD_dim = 0xFF020400, RED_dim = 0xFF020000, GREEN_dim = 0xFF000200, BLUE_dim = 0xFF000002;
//        const ab_pal = [RED_dim, GREEN_dim, BLUE_dim];
//        const GOLD = 0xFF404000, RED = 0xFF400000, GREEN = 0xFF004000, BLUE = 0xFF000040;
        const GOLD_ab = RGBdim1(GOLD, .7);
        const ab_pal = [RED, GREEN, BLUE]; //can be full bright since diffused
        const ab_chvals = getchval(ab_chinx, frinx, 3 * 8);
        const glcolor = [BLACK, BLACK, BLACK, BLACK];
        for (let ab = 0; ab < 8; ++ab)
        {
            const abrot = (ab + 1) % 4; //use AB3/7 on single globe
            const [body, hdwings, bell] = [3 * ab, 3 * ab + 1, 3 * ab + 2];
            if (ab_chvals[bell]) glcolor[abrot] = RGBdimFF(ab_pal[ab % ab_pal.length], ab_chvals[bell]);
            else if (ab_chvals[hdwings]) glcolor[abrot] = RGBdimFF(GOLD_ab, ab_chvals[hdwings]);
            else if (ab_chvals[body]) glcolor[abrot] = RGBdimFF(GOLD_ab, ab_chvals[body]);
        }
        for (let i = 0; i < 4-3; ++i) globes[i].fill(glcolor[i]);
    }

//mood:
//first try: change fence color for each song
//next try: generate mood metrics, use as base color for mult props
    function render_mood()
    {
        const mood_pal = [RED, GREEN, BLUE, YELLOW, CYAN, MAGENTA, WHITE];
        fence.fill(RGBdim1(mood_pal[name.length % mood_pal.length], 1/4));
    }
}


yard.vixfx = async function({getchval, findch, numfr, msec2frinx}, wait4frame)
{
    const {mtree_chinx, angel_chinx, star_chinx, MJB_chinx, wise_chinx, shep_chinx} = vix2ch(findch, getchval);
/*
TODO:
        cross: /^Cross/,
        gift: /^Gift 1/, //{g1, g2, g3, g overlap, tags, city hills}
        fp: /^Fireplace/,
//    spare: /^spare 92/, //{92, 93, 94, blank, dead} some spares used?!
        fparch: /^0:FPArch 1/, //x5
        accbank: /^Acc Bank off=01/, //x2 {sel 23, sel 13} FPArch 1/Instr 2/Sidewalk 3/Heart 4
        acc: /^Shep 1\/Guitar/, //x4  {Shep 1 Guitar, Shep 2 Drums, Shep 3 Oboe, Shep 4 Sax}
        sheep: /^Sheep 1/, //x6 {Sheep 1, Sheep 2, Sheep 3/Cymbal, Sheep 4, Sheep 5/Snare, Sheep 6/Tap}
//        shbank: /^Shep off/, //{RG, Cane, BG, RB} bank selects
//        cols: /^HC Column L.8x/, //x24 {L8x, L7x, L6t, L5, L4, L3, L2, L1b, M8x, M7t, M6, M5, M4, M3, M2, M1b, R8x, R7x, R6t, R5, R4, R3, R2, R1b}
        tuneto: /^Tune To/, //marque built-in
//dead/unused/spare
//        donkey: /^donkey/,
//        flood: /^Flood 1 R \d+$/, //x16 {1R, 1G, 1B, 1W, 2..., 3..., 4...}
        macro: /^Gdoor Macro \d+$/, //x4 {gdoor macro, bitmap, snglobe macro, bitmap}
*/

//    this.fill(BLACK); //just do once; then repaint all virtual subprops
//    ic.fill(BLACK);
//    for (let i = 0; i < 4; ++i) globes[i].fill(BLACK);
    for (let prevtime = 0, prevfr = 0; ; ) //prevtime = nexttime, prevfr = nextfr)
    {
        render.call(this, prevfr); //in case !already rendered (could happen on skipped frames)
        output.call(this, prevfr); //this.out(true); //outputed = frinx;
        render.call(this, prevfr + 1); //try to work ahead (speculative): pre-render next
if (!(prevfr % 300)) debug("yard output+pre-rend fr# %'d/timest %'d, wait ctlr next, mp3 time %'d sec", prevfr, prevtime, mp3play.timestamp || 0);
        const nexttime = await wait4frame(prevtime); //this.ctlr.await_frnum(prevtime, +1); //wait for new frame request
        const nextfr = msec2frinx(nexttime);
        if (nextfr >= numfr) break; //eof
        [prevtime, prevfr] = [nexttime, nextfr];
    }

    function output(frinx)
    {
        if (this.hasOwnProperty("outputed") && frinx <= this.outputed) return;
        if (frinx > numfr) return;
//        this.out();
//        if (this.dirty) {}
//        for (let i = 0; i < 4-3; ++i) globes[i].out(); //only 1 globe for now
//        for (let i = 0; i < 2; ++i) ic.segments[i].out();
        this.outputed = frinx;
    }

    function render(frinx)
    {
        if (this.hasOwnProperty("rendered") && frinx <= this.rendered) return;
        if (frinx > numfr) return;
//big props:
//tree: x24 + 4 banksel {BW BankA, RW BankA, BW BankB, RW BankB} + 2 tree balls
//each channel mapped to column of real mtree
        const mtree_chvals = getchval(mtree_chinx, frinx, 2 * 12 + 4 + 2);
        const GREEN_mtree = RGBdim1(GREEN, 0.7), BLUE_mtree = RGBdim1(BLUE, 0.7), RED_mtree = RGBdim1(RED, 0.7), WHITE_mtree = RGBdim1(WHITE, 0.5);
        const mtree_pal = [GREEN_mtree, BLUE_mtree, RED_mtree, WHITE_mtree];
        const mtree_colorA = mtree_pal[2 * !!mtree_chvals[24+0] + !!mtree_chvals[24+1]];
        const mtree_colorB = mtree_pal[2 * !!mtree_chvals[24+2] + !!mtree_chvals[24+3]];
        for (let x = 0; x < 2*12; ++x)
            mtree.nodes2D[flip(x, 2*12)].fill(RGBdimFF((x & 1)? mtree_colorA: mtree_colorB, mtree_chvals[x]));
//TODO: tree balls

//nativity figures/props:
//angel: {body, wings, trumpet}
        const angel_chvals = getchval(angel_chinx, frinx, 3);
        const GOLD_angel = RGBdim1(GOLD, 0.5), WHITE_angel = RGBdim1(WARM_WHITE, 0.5);
        const angel_bcolor = RGBdim1\FF(WHITE_angel, angel_chvals[0]);
        const angel_hcolor = RGBdimFF(GOLD_angel, angel_chvals[0]); //hair+body
        const angel_wcolor = RGBdimFF(GOLD_angel, angel_chvals[1]);
        const angel_trcolor = RGBdimFF(GOLD_angel, angel_chvals[2]); //halo+trumpet
//        angel.fill(angel_wcolor, angel.wings[0]);
//        angel.fill(angel_wcolor, angel.wings[1]);
        angel.fill(angel_wcolor); //wings are biggest part; fill first
        for (const wing of angel.wings) //shape/trim wings a little
            WingTrim.map(([x, y]) => wing.x? [flip(x, wing,w), y]: [x, y]).forEach(([x, y]) => angel.nodes2D[(wing.x + wing.w + x) % wing.w][(wing.y + wing.h + y) % wing.h] = BLACK;
        angel.fill(angel_bcolor, angel.body); angel.fill(angel_hcolor, angel.hair);
        angel.fill(angel_trcolor, angel.trumpet); angel.fill(angel_trcolor, angel.halo);

//star: {b aura, y inner, w outer}
        const star_chvals = getchval(star_chinx, frinx, 3);
        const BLUE_star = RGBdim1(BLUE, 0.5), WHITE_star = RGBdim1(WARM_WHITE, 0.5), YELLOW_star = RGBdim1(YELLOW, 0.5);
        const star_acolor = RGBdimFF(BLUE_star, star_chvals[0]);
        const star_icolor = RGBdimFF(YELLOW_star, star_chvals[1]);
        const star_ocolor = RGBdimFF(WHITE_star, star_chvals[2]);
        star.fill(star_ocolor); //fill largest part first
        [1, [4, 5], 10, [15, 16], 21].flat().forEach((col) => star.nodes2D[col].fill(star_icolor));
        [[7, 8], [12, 13], [18, 19], [23, 24]].flat().forEach((col) => star.nodes2D[col].fill(star_bcolor));

//MJB: {M, J, B, stable}
        const MJB_chvals = getchval(MJB_chinx, frinx, 4);
        const WHITE_mjb = RGBdim1(WARM_WHITE, 0.4), BROWN_stable = RGBdim1(ORANGE, 0.4);
        const stable_color = RGBdimFF(BROWN_stable, MJB_chvals[3]);
        const gift_corners = { 0: 0, 1: 0, 2: -4, 3: -3, /*...,*/ [-4]: -3, [-3]: -4, [-2]: 0, [-1]: 0, };
        mary.fill(RGBdimFF(WHITE_mjb, MJB_chvals[0]));
        joseph.fill(RGBdimFF(WHITE_mjb, MJB_chvals[1]));
        Baby.fill(RGBdimFF(WHITE_mjb, MJB_chvals[2]));
        gift_face.fill(BLACK);
        for (let x = 0; x < gift_face.width; ++x)
        {
            const xrel = (x > gift_face.width / 2)? x - gift_face.width: x;
            const ystart = (gift_face.height + (xrel in gift_corners)? gift_corners[xrel]: -2) % target.height;
            for (let y = ystart; y < target.height; ++y)
                gift_face.nodes2D[x][y] = stable_color;
        }

//wisemen:
        const wm_chvals = getchval(wm_chinx, frinx, 3);
        const CYAN_wm = RGBdim1(CYAN, 0.5), PINK_wm = RGBdim1(MAGENTA, 0.5), GOLD_wm = RGBdim1(GOLD, 0.5), WHITE_wm = RGBdim1(WARM_WHITE, 0.3), GREEN_wm = RGBdim1(GREEN, 0.5);
        wisemen[0].fill(RGBdimFF(CYAN_wm, wm_chvals[0]));
        wisemen[1].fill(RGBdimFF(PINK_wm, wm_chvals[1]));
        wisemen[2].fill(RGBdimFF(GREEN_wm, wm_chvals[2]));
        for (let i = 0; i < 3; ++i) wisemen[i].fill(RGBdimFF(GOLD_wm, wm_chvals[0]), wisemen[i].head);

//shep:
        const shep_chvals = getchval(shep_chinx, frinx, 4);
        const GOLD_shep = RGBdim1(GOLD, 0.5), WHITE_shep = RGBdim1(WARM_WHITE, 0.3);
        for (let i = 0; i < 4; ++i) shep[i].fill(RGBdimFF(WHITE_shep, shep_chvals[i]));
//TODO: head bands, staffs, etc

//state:
//        this.dirty = true;
        this.rendered = frinx; //keep track of work done already
    }
}


//{vix2seq, duration, interval, numfr, numch, getchval, frmsec, /*chvals,*/ vix2prof, chcolors, chnames, audiolen, mp3file}
//use devpanel as a live preview:
models.devpanel.vixfx = async function({getchval, findch, numfr, msec2frinx}, wait4frame, getchval)
{
    const [W, H] = [this.width, this.height];
    const beat_rect = [this.mkrect({y: 2, w: 2, h: 2}), this.mkrect({x: 4})];
    const {ic_chinx, ab_chinx, af_chinx, mtree_chinx} = vix2ch(findch);
debug("submodel rects", beat_rect);
//    let rendered = -1; //, outputed = -1; //keep track of work done already
//    render.call(this, 0, true); //render first frame + send immediately (even before audio starts)
//    render.call(this, 1); //pre-render second frame as well (won't get advance notice when audio starts)
//    output.call(this, 0); //render + send first frame before audio starts; pre-render next frame
//    for (let timestamp = 0, prev_frinx = -1; ; timestamp = await this.ctlr.await_frnum(timestamp, +1)) //next_frame(timestamp)) //this.ctlr.out()
    this.fill(BLACK); //just do once; then repaint all virtual subprops
if (false)
{
if (false)
    for (let i = 0; i < 16; ++i)
    {
        const [x, y] = [i + (i & 8), i % 8];
        this.nodes2D[x][y] = WHITE_dim;
        this.out(true);
        await one_sec();
        this.nodes2D[x][y] = BLACK;
    }
    for (let a = 0; a < 8; ++a)
    {
//Arch2Globe[a].forEach(({x, y}) => debug(x + (y & 8)));
        Arch2Globe[a].forEach(({x, y}) => this.nodes2D[flip(y, 16) + (x & 8)][x % 8] = WHITE_dim);
//        debug("arch".brightYellow, a, Arch2Globe[a]);
        this.out(true);
        await one_sec();
    }
    for (let f = 0; f < 8; ++f)
    {
        this.fill(BLACK);
        Fan2Globe[f].forEach(({x, y}) => this.nodes2D[flip(y, 16) + (x & 8)][x % 8] = WHITE_dim);
//        debug("fan".brightYellow, f, Fan2Globe[f]);
        this.out(true);
        await one_sec();
    }
    async function one_sec() { for (let i = 0; i < 30; ++i) await wait4frame(); }
debug("done".brightYellow);
    this.fill(BLACK);
    return;
}
    for (let prevtime = 0, prevfr = 0; ; ) //prevtime = nexttime, prevfr = nextfr)
    {
//        output.call(this, frinx); //render if needed, then send; also pre-render next frame
//        if (frinx <= outputed) return;
        render.call(this, prevfr); //in case !already rendered (could happen on skipped frames)
        output.call(this, prevfr); //this.out(true); //outputed = frinx;
        render.call(this, prevfr + 1); //try to work ahead (speculative): pre-render next
if (!(prevfr % 300)) debug("output+pre-rend fr# %'d/timest %'d, wait ctlr next, mp3 time %'d sec", prevfr, prevtime, mp3play.timestamp || 0);
        const nexttime = await wait4frame(prevtime); //this.ctlr.await_frnum(prevtime, +1); //wait for new frame request
//        const nexttime = this.ctlr.frnum;
        const nextfr = msec2frinx(nexttime);
//        assert(nexttime > prevtime, `${nexttime} !> ${prevtime}`); //spurious wakeup?
//debug("next frame req:", nextfr, nexttime, "dup?", nextfr <= prevfr, "eof?", nextfr >= numfr);
        if (nextfr >= numfr) break; //eof
        [prevtime, prevfr] = [nexttime, nextfr];
    }

    function output(frinx)
    {
        if (this.hasOwnProperty("outputed") && frinx <= this.outputed) return;
        if (frinx > numfr) return;
        this.out();
        this.outputed = frinx;
    }

    function render(frinx)
    {
        if (this.hasOwnProperty("rendered") && frinx <= this.rendered) return;
        if (frinx > numfr) return;
//big props:
//ic x14
        const CYAN_dim = 0xFF000208;
        const ic_chvals = getchval(ic_chinx, frinx, 14);
        for (let x = 0, xofs = 0, yofs = 7; x < ic_chvals.length; ++x)
            this.nodes2D[xofs + x][yofs + 0] = this.nodes2D[xofs + x][yofs + 1] = RGBdimFF(CYAN_dim, ic_chvals[x]); //, {x: 8 + i, y: 2, w: 1, h: 3});
//angelbells {body, head/wings, bell} x8: 4 L2R upper, 4 L2R lower
        const GOLD_dim = 0xFF020400, RED_dim = 0xFF020000, GREEN_dim = 0xFF000200, BLUE_dim = 0xFF000002;
        const ab_pal = [RED_dim, GREEN_dim, BLUE_dim];
        const ab_chvals = getchval(ab_chinx, frinx, 3 * 8);
        for (let ab = 0, xofs = 15, yofs = 5; ab < 8; ++ab)
        {
            const [x, y] = [(ab * 3) % (4 * 3), (ab < 4)? 3: 0]; //Math.trunc(ab / 4) * 3];
            this.nodes2D[xofs + x][yofs + y + 1] = RGBdimFF(GOLD_dim, ab_chvals[3 * ab + 1]);
            this.nodes2D[xofs + x][yofs + y] = RGBdimFF(ab_pal[ab % ab_pal.length], ab_chvals[3 * ab + 0]);
            this.nodes2D[xofs + x + 1][yofs + y] = RGBdimFF(ab_pal[ab % ab_pal.length], ab_chvals[3 * ab + 2]);
        }
//archfans: x64 {a 1, a 2, a 3, a 4, f 1, f 2, f 3, f 4} 8 each
        const ARCH_dim = 0xFF020102, FAN_dim = 0xFF010202;
        const af_chvals = getchval(af_chinx, frinx, 64);
        for (let af = 0, yofs = 6; af < 4; ++af, yofs -= 2)
            for (let x = 0, xofs = 24; x < 8; ++x)
            {
                this.nodes2D[xofs + x][yofs + 1] = RGBdimFF(ARCH_dim, af_chvals[16 * af + x]);
                this.nodes2D[xofs + x][yofs + 0] = RGBdimFF(FAN_dim, af_chvals[16 * af + x + 8]);
            }
//tree: x24 + 4 banksel {BW BankA, RW BankA, BW BankB, RW BankB}
        const mtree_chvals = getchval(mtree_chinx, frinx, 2 * 12 + 4);
        const mtree_pal = [GREEN_dim, BLUE_dim, RED_dim, WHITE_dim];
        const mtree_colorA = mtree_pal[2 * !!mtree_chvals[24+0] + !!mtree_chvals[24+1]];
        const mtree_colorB = mtree_pal[2 * !!mtree_chvals[24+2] + !!mtree_chvals[24+3]];
        for (let x = 0, xofs = 0, yofs = 0; x < 2*12; ++x)
            this.nodes2D[xofs + x][yofs + 0] = this.nodes2D[xofs + x][yofs + 1] = RGBdimFF((x & 1)? mtree_colorA: mtree_colorB, mtree_chvals[x]);
            
//state:
        this.dirty = true;
        this.rendered = frinx; //keep track of work done already
    }

    function old_render(frinx) //, want_flush)
    {
        if (this.hasOwnProperty("rendered") && frinx <= this.rendered) return;
        if (frinx > numfr) return;
//get info for render:
        const beat_chvals = beat_chinx.map((chinx) => getchval(chinx, frinx)); //debug(`getchval(${typeof chinx} ${chinx}, ${frinx})`) && getchval(chinx, frinx));
        const timing_chvals = /*timing_chinx.map((chinx) =>*/ getchval(timing_chinx[0], frinx, 3);
//debug("chinx/frinx", timing_chinx[0], frinx, "beat chvals", beat_chvals, "timing chvals".brightRed, timing_chvals); //, timing_chinx[0], timing_chinx[1], timing_chinx[2], getchval(timing_chinx[0], frinx), getchval(timing_chinx[1], frinx), getchval(timing_chinx[2], frinx));
        const timing24 = uint32((timing_chvals[0] << 16) | (timing_chvals[1] << 8) | timing_chvals[2]);
        const timing2_chvals = /*timing2.map((chinx) =>*/ getchval(timing2_chinx[0], frinx, 3);
        const timing24_2 = uint32((timing2_chvals[0] << 16) | (timing2_chvals[1] << 8) | timing2_chvals[2]);
//if (!(frinx % 60)) debug(`fr# ${frinx}, beats ${beat_chvals.join(", ")}, timing ${timing24}`);
        assert(timing24 == timing24_2, `timing ${timing24} != ${timing24_2} @frinx ${commas(frinx)}`);
        const ic_chvals = getchval(ic_chinx, frinx, 14);
        const mtree_chvals = getchval(mtree_chinx, frinx, 24)
//        const ab_ch
//render:
        const RED = 0x080000, GREEN = 0x000800, CYAN = 0x000808;
        for (const [inx, chval] of Object.entries(beat_chvals))
        {
            if (chval == (this.prev_chvals || [])[+inx]) continue; //no changes to render
            const beat_color = RGBdimFF([RED, GREEN][+inx], chval);
            this.fill(beat_color, beat_rect[+inx]);
            (this.prev_chvals || (this.prev_chvals = []))[+inx] = chval;
        }
        for (let bit = 0x800000, xofs = 0; bit; bit >>= 1, ++xofs)
            this.nodes2D[xofs][0] = (timing24 & bit)? WHITE_dim: BLUE_dim;
        for (let i = 0; i < ic_chvals.length; ++i)
            this.fill(RGBdimFF(CYAN, ic_chvals[i]), {x: 8 + i, y: 2, w: 1, h: 3});
        for (let i = 0; i < mtree_chvals.length; ++i)
            this.fill(RGBdimFF(GREEN, mtree_chvals[i]), {x: 6 + i, y: 6, w: 1, h: 2});
//status:
        this.dirty = true;
        this.rendered = frinx; //keep track of work done already
//        if (!want_flush) return;
//        this.out(true);
//        outputed = frinx;
    }
}

//eof