#!/usr/bin/env node
//YALP chase-like effects
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
    pxscan,
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


//turn on 1 px at a time:
//color + DURATION can be arrays, duration applies to *each* color
async function pxscan(model, opts)
{
    const {nodes2D, width: W, height: H, await_until} = model;
//    const {DURATION/*, FPS*/} = opts;
    const colors = toary(opts.color || WHITE);
    const durations = toary(opts.DURATION || 0);
//    const steplen = Math.ceil(DURATION / (W * H) / colors.length); //msec
    if (!opts.NOBLANK) model.fill(BLACK); //just clear all nodes once, then turn on/off individ; perf better than rendering entire grid each frame!
    await await_until(0); //init frame dark
//    for (const color of Object.values(colors))
    for (const [inx, color] of Object.entries(colors)) //CAUTION: typeof inx == "string"
    {
        const duration = durations[+inx % durations.length];
        const steplen = Math.ceil(duration / (W * H)); //msec
        debug("1px scan 0x%x [%d/%d] for %'d msec, %'d msec/step ...", color, inx, colors.length, steplen * W * H, steplen);
//        assert(RGB(color) || (colors.length > 1)); //d'oh!
        assert(duration > controller.frtime, `step duration ${commas(duration)} must be > frame time ${commas(controller.frtime)} msec`); //be realistic
        for (let y = 0, step = 0; y < H; ++y)
            for (let x = 0; x < W; ++x, ++step)
            {
                const bkg = nodes2D[x][y];
                nodes2D[x][y] = color;
//debug("px[%'d][%'d] = 0x%x", x, y, color);
                await await_until((step + 1) * steplen); //adaptive
                nodes2D[x][y] = bkg; //BLACK; //restore bkg color
//if (step > 100) return;
//return;
            }
    }
//    await await_until(DURATION); //one last time in case frame missed
}

//eof