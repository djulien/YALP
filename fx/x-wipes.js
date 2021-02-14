#!/usr/bin/env node
//YALP wipe-like effects
//Copyright (c) 2020 Don Julien
//Can be used for non-commercial purposes.
//
//History:
//ver 1.20.12 DJ 12/20/20  move to separate incl folder

'use strict'; //find bugs easier
const {hsv2rgb, rgb2hsv} = require("../incl/colors");
//const assert = require('assert').strict; //https://nodejs.org/api/assert.html
//const {/*WS281x, CFG,*/ debug, debug_nested, debug_limit, srcline, plural, commas, hex, isdef} = require("gpuport"); //"../"); //npm link allows real module name to be used here
//debug.max_arg_len = 400;
//debug("here2");

Object.assign(module.exports,
{
    wipe,
});


////////////////////////////////////////////////////////////////////////////////
////
/// effects:
//


//fx args:
//model:
// nodes = 1D array of all nodes
// nodes2D = 2D grid of nodes; origin = bottom left
// width = grid width
// height = grid height
// univ = universe (port)
// await_until(msec) = flush + wait until specified time (relative to effect start time)
// ctlr = controller for this prop (try to avoid access; useful primarily for special cases)
//opts:
// duration = total length of time for effect (msec)
// fps = desired #frames/sec (animation speed)
// start = fx start time (msec)
//NOTE: all fx can use async programming style to simplify logic


//wipe:
//use vertical for pour/drain:
async function wipe(model, opts)
{
    const STYLES = { L2R: 1, R2L: 2, T2B: -3, B2T: -4};
    const {nodes2D, width: W, height: H, await_until} = model;
    const colors = toary(opts.color || WHITE);
    const durations = toary(opts.DURATION || 0);
    const styles = toary(opts.style || STYLES.L2R).map((style) => STYLES[style.toUpperCase()] || style); //allow name or value
    const widths = toary(opts.width || Math.max(W, H)); //TODO
//    model.fill(BLACK); //just clear all nodes once, then turn on/off individ; perf better than rendering entire grid each frame!
//    await await_until(0); //init frame dark
    for (const [inx, color] of Object.entries(colors)) //CAUTION: typeof inx == "string"
    {
        const start = model.ctlr.elapsed;
        const duration = durations[inx % durations.length];
        const style = styles[inx % styles.length];
        const width = widths[inx % widths.length];
        const steplen = Math.ceil(duration / ((style < 0)? H: W)); //msec
        debug("wipe 0x%x [%d/%d] style %d, width %d for %'d msec, %'d msec/step ...", color, inx, colors.length, style, width, steplen * W * H, steplen);
//        assert(RGB(color) || (colors.length > 1)); //d'oh!
        assert(duration > controller.frtime, `step duration ${commas(duration)} must be > frame time ${commas(controller.frtime)} msec`); //be realistic
        if (!opts.NOBLANK) model.fill(BLACK);
        switch (style)
        {
            case STYLES.L2R:
            case STYLES.R2L:
                for (let x = 0, step = 0; x < W; ++x)
                {
                    const xflip = (style == STYLES.R2L)? W - x - 1: x;
                    for (let y = 0; y < H; ++y, ++step) nodes2D[xflip][y] = color;
                    await await_until(start + (step + 1) * steplen); //adaptive
                }
                continue;
            case STYLES.T2B:
            case STYLES.B2T:
                for (let y = 0, step = 0; y < H; ++y)
                {
                    const yflip = (style == STYLES.T2B)? H - y - 1: y;
                    for (let x = 0; x < W; ++x, ++step) nodes2D[x][yflip] = color;
                    await await_until(start + (step + 1) * steplen); //adaptive
                }
                continue;
        }
//debug_limit(1, "unhandled style:", style);
    }
//    await await_until(DURATION); //one last time in case frame missed
}

//eof