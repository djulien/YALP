#!/usr/bin/env node
//Vixen2 layout shim

"use strict";
const assert = require('assert').strict; //https://nodejs.org/api/assert.html
const {models/*: {devpanel, mtree}*/, controller} = require("../../test/fxtest");
const {/*RED, GREEN,*/ BLACK, BLUE_dim, WHITE_dim, RGBdim} = require("../incl/colors");
const {uint32, debug, commas, mp3play} = require("../incl/utils");

//const RED = 0xFFff0000;
//const GREEN = 0xFF00ff00;


//const vix2models = {};
//{
//    'Mtree 1A': mtree.branches[0],
//    'Mtree 1B': mtree.branches[1],
//};
module.exports.controller = controller;

//map real models to 3 main virtual models/props:
//- house (decor)
//- yard (Nativity)
//- dev panel

const house = {};
const yard = {};
module.exports.models =
{
//NOTE: Vixen2 player expects a vixfx() method on all exported models
//    mtree,
    devpanel: models.devpanel,
    house,
    yard,
};
debug(Object.keys(models));


function vix2map(findch)
{
}


//{vix2seq, duration, interval, numfr, numch, getchval, frmsec, /*chvals,*/ vix2prof, chcolors, chnames, audiolen, mp3file}
//use devpanel as a live preview:
models.devpanel.vixfx = async function({getchval, findch, numfr, msec2frinx}, wait4frame)
{
    const [W, H] = [this.width, this.height];
//find Vixen2 props:
    const beat_chinx = findch(/^Beat 1/); //x2
    const ic_chinx = findch(/^Chasecicle 1L/); //x14
    const ab_chinx = findch(/^AngelBell 1U Body/); //{body, head/wings, bell} x8: 4 L2R upper, 4 L2R lower
    const angel_chinx = findch(/^Angel Body/); //{body, wings, trumpet}
    const star_chinx = findch(/^Star B/); //{b aura, y inner, w outer}
    const cross_chinx = findch(/^Cross/);
    const mtree_chinx = findch(/^Mtree 1A/); //x24
    const mtbank_chinx = findch(/^Mtree off=GR\/ON=BW BankA/); //{BW BankA, RW BankA, BW BankB, RW BankB}
    assert(mtree_chinx + 2*12 == mtbank_chinx);
    const trballs_chinx = findch(/^Tree Ball 1/); //x2, !used?
    const gift_chinx = findch(/^Gift 1/); //{g1, g2, g3, g overlap, tags, city hills}
    const MJB_chinx = findch(/^Mary/); //{M, J, B, stable}
    const k3_chinx = findch(/^King 1/); //x3
    const fp_chinx = findch(/^Fireplace/);
//    const spare_chinx = findch(/^spare 92/); //{92, 93, 94, blank, dead} some spares used?!
    const fparch_chinx = findch(/^0:FPArch 1/); //x5
    const accbank_chinx = findch(/^Acc Bank off=01/); //x2 {sel 23, sel 13} FPArch 1/Instr 2/Sidewalk 3/Heart 4
    const acc_chinx = findch(/^Shep 1\/Guitar/); //x4  {Shep 1 Guitar, Shep 2 Drums, Shep 3 Oboe, Shep 4 Sax}
    const sh_chinx = findch(/^Sheep 1/); //x6 {Sheep 1, Sheep 2, Sheep 3/Cymbal, Sheep 4, Sheep 5/Snare, Sheep 6/Tap}
    const shbank_chinx = findch(/^Shep off/); //{RG, Cane, BG, RB} bank selects
    const archfan_chinx = findch(/^ArchFan 1.1A/); //x64 {a 1, a 2, a 3, a 4, f 1, f 2, f 3, f 4} 8 each
    const cols_chinx = findch(/^HC Column L.8x/); //x24 {L8x, L7x, L6t, L5, L4, L3, L2, L1b, M8x, M7t, M6, M5, M4, M3, M2, M1b, R8x, R7x, R6t, R5, R4, R3, R2, R1b}
    const tuneto_chinx = findch(/^Tune To/); //marque built-in
//dead/unused/spare
    const donkey_chinx = findch(/^donkey/);
    const flood_chinx = findch(/^Flood 1 R \d+$/); //x16 {1R, 1G, 1B, 1W, 2..., 3..., 4...}
    const macro_chinx = findch(/^Gdoor Macro \d+$/); //x4 {gdoor macro, bitmap, snglobe macro, bitmap}
    const timing_chinx = findch(/^Timing MSB \d+$/); //x3 {msb, mid, lsb}
//debug(timing_chinx);
//    assert(timing_chinx[0] + 1 == timing_chinx[1] && timing_chinx[1] + 1 == timing_chinx[2], timing_chinx);
//some unused except 377 - 382??
    const macrofx_chinx = findch(/fx color.a/); //x5 {A, R, G, B, text}
    const flood2_chinx = findch(/^Flood 1 R \d+\/\d+/); //copy of floods (x16)
    const macro2_chinx = findch(/^Gdoor Macro \d+\/\d+/); //copy
    const timing2_chinx = findch(/^Timing MSB \d+\/\d+$/); //copy
//    assert(timing2_chinx[0] + 1 == timing2_chinx[1] && timing2_chinx[1] + 1 == timing2_chinx[2], timing2_chinx);
//a couple of unused channels at end

//debug("found beat tracks:", beat_chinx, "timing tracks:", timing_chinx, timing2_chinx, "ic", ic_chinx, "tree", mtree_chinx);
    const beat_rect = [this.mkrect({y: 2, w: 2, h: 2}), this.mkrect({x: 4})];
debug("submodel rects", beat_rect);
//    let rendered = -1; //, outputed = -1; //keep track of work done already
//    render.call(this, 0, true); //render first frame + send immediately (even before audio starts)
//    render.call(this, 1); //pre-render second frame as well (won't get advance notice when audio starts)
//    output.call(this, 0); //render + send first frame before audio starts; pre-render next frame
//    for (let timestamp = 0, prev_frinx = -1; ; timestamp = await this.ctlr.await_frnum(timestamp, +1)) //next_frame(timestamp)) //this.ctlr.out()
    this.fill(BLACK); //just do once; then repaint all virtual subprops
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
            this.nodes2D[xofs + x][yofs + 0] = this.nodes2D[xofs + x][yofs + 1] = RGBdim(CYAN_dim, ic_chvals[x] / 255); //, {x: 8 + i, y: 2, w: 1, h: 3});
//angelbells {body, head/wings, bell} x8: 4 L2R upper, 4 L2R lower
        const GOLD_dim = 0xFF020400, RED_dim = 0xFF020000, GREEN_dim = 0xFF000200, BLUE_dim = 0xFF000002;
        const ab_pal = [RED_dim, GREEN_dim, BLUE_dim];
        const ab_chvals = getchval(ab_chinx, frinx, 3 * 8);
        for (let ab = 0, xofs = 15, yofs = 5; ab < 8; ++ab)
        {
            const [x, y] = [(ab * 3) % (4 * 3), (ab < 4)? 3: 0]; //Math.trunc(ab / 4) * 3];
            this.nodes2D[xofs + x][yofs + y + 1] = RGBdim(GOLD_dim, ab_chvals[3 * ab + 1] / 255);
            this.nodes2D[xofs + x][yofs + y] = RGBdim(ab_pal[ab % ab_pal.length], ab_chvals[3 * ab + 0] / 255);
            this.nodes2D[xofs + x + 1][yofs + y] = RGBdim(ab_pal[ab % ab_pal.length], ab_chvals[3 * ab + 2] / 255);
        }
//archfans: x64 {a 1, a 2, a 3, a 4, f 1, f 2, f 3, f 4} 8 each
        const ARCH_dim = 0xFF020102, FAN_dim = 0xFF010202;
        const af_chvals = getchval(archfan_chinx, frinx, 64);
        for (let af = 0, yofs = 6; af < 4; ++af, yofs -= 2)
            for (let x = 0, xofs = 24; x < 8; ++x)
            {
                this.nodes2D[xofs + x][yofs + 1] = RGBdim(ARCH_dim, af_chvals[16 * af + x] / 255);
                this.nodes2D[xofs + x][yofs + 0] = RGBdim(FAN_dim, af_chvals[16 * af + x + 8] / 255);
            }
//tree: x24 + 4 banksel {BW BankA, RW BankA, BW BankB, RW BankB}
        const tree_chvals = getchval(mtree_chinx, frinx, 2 * 12 + 4);
        const tree_pal = [GREEN_dim, BLUE_dim, RED_dim, WHITE_dim];
        const tree_colorA = tree_pal[2 * !!tree_chvals[24+0] + !!tree_chvals[24+1]];
        const tree_colorB = tree_pal[2 * !!tree_chvals[24+2] + !!tree_chvals[24+3]];
        for (let x = 0, xofs = 0, yofs = 0; x < 2*12; ++x)
            this.nodes2D[xofs + x][yofs + 0] = this.nodes2D[xofs + x][yofs + 1] = RGBdim((x & 1)? tree_colorA: tree_colorB, tree_chvals[x]);
            
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
            const beat_color = RGBdim([RED, GREEN][+inx], chval / 255);
            this.fill(beat_color, beat_rect[+inx]);
            (this.prev_chvals || (this.prev_chvals = []))[+inx] = chval;
        }
        for (let bit = 0x800000, xofs = 0; bit; bit >>= 1, ++xofs)
            this.nodes2D[xofs][0] = (timing24 & bit)? WHITE_dim: BLUE_dim;
        for (let i = 0; i < ic_chvals.length; ++i)
            this.fill(RGBdim(CYAN, ic_chvals[i] / 255), {x: 8 + i, y: 2, w: 1, h: 3});
        for (let i = 0; i < mtree_chvals.length; ++i)
            this.fill(RGBdim(GREEN, mtree_chvals[i] / 255), {x: 6 + i, y: 6, w: 1, h: 2});
//status:
        this.dirty = true;
        this.rendered = frinx; //keep track of work done already
//        if (!want_flush) return;
//        this.out(true);
//        outputed = frinx;
    }
}


house.vixfx = async function({getchval, findch, numfr, msec2frinx}, wait4frame)
{
}


yard.vixfx = async function({getchval, findch, numfr, msec2frinx}, wait4frame)
{
}


//eof