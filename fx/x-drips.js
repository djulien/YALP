#!/usr/bin/env node
//YALP drip-like effects
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

TODO("fx: icicle drip, icicle melt");

Object.assign(module.exports,
{
    drip,
    meteors,
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


//icicle drip 2020:
async function drip(model, opts)
{
    const {nodes2D, width: W, height: H, await_until} = model;
//    const {DURATION/*, FPS*/} = opts;
//    const colors = [CYAN_dim]; //toary(opts.color || WHITE);
    const durations = toary(opts.DURATION || 10e3); //msec
    model.fill(BLACK); //just clear all nodes once, then turn on/off individ; perf better than rendering entire grid each frame!
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


//meteors 2020:
async function meteors(model, opts) //meteor(model, opts)
{
    const {nodes2D, width: W, height: H, await_until} = model;
//    const {DURATION/*, FPS*/} = opts;
//    const colors = [CYAN_dim]; //toary(opts.color || WHITE);
    const durations = toary(opts.DURATION || 10e3); //msec
    model.fill(BLACK); //just clear all nodes once, then turn on/off individ; perf better than rendering entire grid each frame!
//    await await_until(0); //init frame dark
    const meteorites = [{0: 0}, {6: 60}, {12: 120}, {18: 180}, {24: 240}, {30: 300}]; //{xofs: hue360}
TODO("randomize color, position, speed, size");
    const xofs = +opts.xofs || 0; //kludge: just change horiz ofs for now
//    meteorites.push(...meteorites, ...meteorites);
    const tail = [0.05, 0.12, 0.3, 0.8, 1.0].reverse();
    const steplen = 1e3/20; //durations[0] / (H + tail.length);
    let step = 0;
    for (const meteorite of meteorites) //{3: toRGB(CYAN_dim), 8: toRGB(MAGENTA_dim), 12: toRGB(BLUE_dim), 20: toRGB(WHITE_dim)}))
    {
        const [xstr, hue360] = Object.entries(meteorite)[0]; const x = +xstr;
        if ((xofs + x < 0) || (xofs + x >= W)) continue; //clip
        const hsv360 = {h: hue360, s: 100, v: 10}; //100 is too bright; try 10%
//fade as it falls;
        for (let yhead = H - 1; yhead + tail.length >= 0; --yhead)
        {
            for (let yofs = 0; yofs <= tail.length; ++yofs)
            {
                const br = (yofs < tail.length)? tail[yofs]: 0;
//            const color_dim = fromRGB(color.r * br, color.g * br, color.b * cr); //TODO: repl with hsv
                const color_dim = rgb2RGB(hsv2rgb(hsv360.h, hsv360.s, hsv360.v * br));
//                if ((xofs + x < 0) || (xofs + x >= W)) continue; //clip; inner loop to maintain timing
//debug(typeof xofs, xofs, typeof x, +x, typeof (xofs + x), typeof (xofs + +x), xofs + +x, W, H);
                nodes2D[xofs + x][yhead + yofs] = color_dim; //force to num
            }
//debug("meteor[%d]: hsv360 [%d, %d, %d], yhead %d, yofs %d, node[%d][%d] = 0x%x", step, hsv360.h, hsv360.s, hsv360.v, yhead, /*yofs*/ -1, xofs, yhead + /*yofs*/ 0, /*color_dim*/ 0);
            await await_until(++step * steplen); //adaptive
//            for (let yofs of [0, tail.length])
            nodes2D[xofs + x][yhead + tail.length] = BLACK; //only need to clear last one; others will be overwritten during next frame
        }
debug("meteor[%d]: hsv360 [%d, %d, %d], xofs %d", step, hsv360.h, hsv360.s, hsv360.v, xofs);
    }
}

//eof