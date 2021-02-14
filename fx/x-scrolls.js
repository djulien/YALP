#!/usr/bin/env node
//YALP scrolling effects
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

TODO("fx: zoom; should it just be a property of other fx?");


Object.assign(module.exports,
{
    zoom,
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


//color fade:
//color can be ary
//duration applies to *each* color
async function fade(model, opts)
{
    const {await_until} = model;
//    assert(isdef(opts.DURATION) && isdef(opts.color));
    const {DURATION, FPS, color: colors} = opts;
    assert(isdef(DURATION) && isdef(FPS) && isdef(colors));
    const steplen = 1e3 / FPS, num_steps = Math.ceil(DURATION / steplen); //msec
//    const colors = toary(opts.color); //|| [BLACK, WHITE_dim]);
    const DIM = .5; //TODO
    for (const [inx, color, all] of toary(colors).map((val, inx, ary) => [inx, val, ary])) //kludge: use .map() to add ary ref
    {
        if (!inx) continue; //need 2 colors
        const from_hsv = /*is*/rgb2hsv(RGB2rgb(all[inx - 1])), to_hsv = rgb2hsv(RGB2rgb(color));
        if (color == RED_WRAP) to_hsv.h = 360; //kludge: wrap via magenta instead of yellow
        if (all[inx - 1] == RED_WRAP) from_hsv.h = 360; //kludge: wrap via magenta instead of yellow
debug("color fade[%d/%d]: from hsv (%d, %d, %d) rgb 0x%x to hsv (%d, %d, %d) rgb 0x%x, steplen %'d msec, #steps %'d, dim %3.2f", inx, all.length, from_hsv.h, from_hsv.s, from_hsv.v, all[inx - 1], to_hsv.h, to_hsv.s, to_hsv.v, color, steplen, num_steps, DIM);
        for (let step = 0; step < num_steps; ++step)
        {
//            const mix = step / num_steps; //linear
            const mix = Math.sin(step / num_steps * Math.PI / 2); //num_steps = PI (first 90 deg of sine curve)
            const new_hsv = hsvdim(tween(mix, from_hsv, to_hsv), DIM);
            const new_color = rgb2RGB(hsv2rgb(new_hsv));
//debug("step %d/%d = %3.2f vs sine %3.2f, hsv %d, %d, %d => rgb 0x%x", step, num_steps, step / num_steps, mix, new_hsv.h, new_hsv.s, new_hsv.v, new_color);
            model.fill(new_color);
            /*step =*/ await await_until((inx * num_steps + step + 1) * steplen); //adaptive
        }
    }
}
//function fromHSV(hsv) { return [hsv.h, hsv.s, hsv.v]; }
//function fromRGB(rgb) { return [rgb.r, rgb.g, rgb.b]; }
//debug(rgb2hsv(toRGB(RED)), rgb2hsv(toRGB(RED_dim)), rgb2hsv(toRGB(GREEN)), rgb2hsv(toRGB(BLUE)), rgb2hsv(toRGB(WHITE)), rgb2hsv(toRGB(BLACK)), hsv2rgb({h: 0, s: 100, v: 100}), hsv2rgb({h: 120, s: 100, v: 100}), hsv2rgb({h: 240, s: 100, v: 100})); process.exit();


//eof