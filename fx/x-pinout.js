#!/usr/bin/env node
//YALP misc effects to help identify pinouts
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
    pin_finder,
    bit_shift_problem,
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


//generate different 1-of-N R/G/B pattern on each GPIO pin:
async function pin_finder(model, opts)
{
debug("pin finder ...", opts, model);
    const {nodes2D, width: W, height: H, port: UNIV, await_until} = model;
    const {DURATION, FPS} = opts;
//const patterns =
//[
//    [RED_dim, 0+2],
//    [RED_dim, 1+2],
//    [RED_dim, 2+2],
//    [RED_dim, 3+2],
//    [RED_dim, 4+2],
//    [RED_dim, 5+2],
//    [RED_dim, 6+2],
//    [RED_dim, 7+2],

//    [GREEN_dim, 0+2],
//    [GREEN_dim, 1+2],
//    [GREEN_dim, 2+2],
//    [GREEN_dim, 3+2],
//    [GREEN_dim, 4+2],
//    [GREEN_dim, 5+2],
//    [GREEN_dim, 6+2],
//    [GREEN_dim, 7+2],

//    [BLUE_dim, 0+2],
//    [BLUE_dim, 1+2],
//    [BLUE_dim, 2+2],
//    [BLUE_dim, 3+2],
//    [BLUE_dim, 4+2],
//    [BLUE_dim, 5+2],
//    [BLUE_dim, 6+2],
//    [BLUE_dim, 7+2],

//    [WHITE_dim, 0+2],
//    [WHITE_dim, 1+2],
//    [WHITE_dim, 2+2],
//    [WHITE_dim, 3+2],
//    [WHITE_dim, 4+2],
//    [WHITE_dim, 5+2],
//    [WHITE_dim, 6+2],
//    [WHITE_dim, 7+2],
//];
//for (const [color, repeat] of patterns)
//    for (let n = 0; n < nodes.length; ++n) nodes[n] = BLACK;
    const DIM = .5; //TODO
    const [color, repeat] = [[RGBdim(RED, DIM), RGBdim(GREEN, DIM), RGBdim(BLUE, DIM)][UNIV >> 3], (UNIV & 7) + 1];
    const steplen = 1e3 / FPS, num_steps = Math.ceil(DURATION / steplen); //msec
debug("pin-finder: color 0x%x, repeat %d, steplen %'d msec, #steps %'d", color, repeat, steplen, num_steps);
//    assert(duration > controller.frtime, `step duration ${commas(duration)} must be > frame time ${controller.frtime} msec`); //be realistic
//    assert(numsteps > 0); //be realistic
    for (let step = 0; step <= num_steps; ++step)
    {
//        const frstamp = /*START +*/ step / SPEED * 1e3; //msec
//        const frnum = Math.ceil(frstamp / 1e3 * FPS); //round up for future (next frame)
//function frnum(when) { return msec2fr(isdef(when, when, elapsed() + 1)); } //+1 msec to account for time until out()
//        const elapsed = await await_until(frstamp); //, +1); //wait for next request that needs render
//        step = fr2msec(frnum(elapsed() + 1)); //nxtfrnum / fps * 1e3; //tell wkers to render next         ; adaptive: add/skip frames if needed
//        step = Math.ceil(msec / 1e3 * frnum.fps); } //round up for future (next frame)
//        step = Math.floor((elapsed */- START*/) * SPEED / 1e3); //adaptive: add/skip frames if needed
//render:
//        for (let n = 0; n < nodes1D.length; ++n) nodes1D[n] = ((n - step) % repeat)? BLACK: color;
        for (let n = 0; n < W * H; ++n)
//{debug(n % W, Math.floor(n / W), model.width, model.height, typeof nodes2D, (nodes2D.constructor || "").name, Array.isArray(nodes2D)); debug(typeof nodes2D[n % W]);
            nodes2D[n % W][Math.floor(n / W)] = ((n - step) % repeat)? BLACK: step? color: WHITE_dim; //[] must be int; first one white for easier recognition of repeating pattern on larger props
//}
        /*step =*/ await await_until(step * steplen); //adaptive
    }
//    return true; //repeat for next step
}
//const ary = new Uint32Array(4); ary[Math.floor(3/2)] = 3/2; debug(ary); process.exit();


async function bit_shift_problem(model, opts)
{
//    const {nodes_all: nodes} = model;
    const {nodes1D, await_until} = model;
//  const NUM_UNIV = model.
    debug("intermittent bit shift problem test ...");
//    for (let n = 0; n < nodes.length; ++n) nodes[n] = BLACK;
    [1*36-1, 2*36-1, 3*36-1, 4*36-2, 5*36-2, 6*36-2, 7*36-3].forEach((n) =>
    {
//        for (let u = 0; u < NUM_UNIV; ++u)
        nodes1D[n - 1] = nodes1D[n] = nodes1D[n + 1] = WHITE_dim;
    });
    await await_until(5e3);
//    fill(Object.assign({}, model, {nodes: nodes_all}));
}


//eof