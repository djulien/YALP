#!/usr/bin/env node
//YALP butterfly effects (based on xLights' butterfly)
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
    butterfly,
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


//butterfly:
//adapted from xLights
//NOTE: looks better with higher density pixels (LED strip looks good, strings not so good)
async function butterfly(model, opts)
{
debug("butterfly ...", opts, model);
    const {nodes2D, width, height, await_until} = model;
    const {DURATION, FPS, direction} = opts;
    const steplen = 1e3 / FPS, num_steps = Math.ceil(DURATION / steplen); //msec
debug("butterfly: steplen %'d msec, #steps %'d", steplen, num_steps);
//    assert(duration > controller.frtime, `step duration ${commas(duration)} must be > frame time ${controller.frtime} msec`); //be realistic
//    assert(numsteps > 0); //be realistic
    const DIM = .3; //.5; //TODO
//    const brightness = 0.01; //1; //way too bright!
    for (let step = 0; step <= num_steps; ++step)
    {
        for (let x = 0; x < width; ++x)
            for (let y = 0; y < height; ++y)
                nodes2D[x][y] = rgb2RGB(hsv2rgb(hsvdim({h: sethue(x, height - y - 1, step, {width, height}) * 360, s: 1*100, v: 100}, DIM))); //y flip?
        /*step =*/ await await_until(step * steplen); //adaptive
    }

//choose color (hue) for butterfloy pattern:
//based on http://mathworld.wolfram.com/ButterflyFunction.html
//PERF: ~ 20 msec
    function sethue(x, y, ani_ofs, opts)
    {
//not needed? axis fixes: fix the colors for pixels at (0,1) and (1,0)
//    if ((x == 0) && (y == 1)) y = y + 1;
//    if ((x == 1) && (y == 0)) x = x + 1;
        const num = Math.abs((x * x - y * y) * Math.sin(ani_ofs + ((x + y) * Math.PI * 2 / (opts.height + opts.width))));
//??        const num = /*Math.abs??*/((x * x - y * y) * Math.sin(((ani_ofs + x + y) / (opts.height + opts.width) * 2 * Math.PI)));
        const den = x * x + y * y;
        const hue = (den > 0.001)? num / den: 0;
        return (hue < 0)? -hue: hue;
    }
}

//eof