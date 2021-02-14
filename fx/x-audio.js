#!/usr/bin/env node
//YALP audio-related effects
//Copyright (c) 2020 Don Julien
//Can be used for non-commercial purposes.
//
//History:
//ver 1.20.12 DJ 12/20/20  move to separate incl folder

'use strict'; //find bugs easier
//const {hsv2rgb, rgb2hsv} = require("../incl/colors");
//const assert = require('assert').strict; //https://nodejs.org/api/assert.html
const {TODO} = require("../incl/utils");
//debug.max_arg_len = 400;
//debug("here2");

Object.assign(module.exports,
{
    music,
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


//yes, bkg music is also an "effect":
async function music(spkr, opts)
{
TODO("bkg music, eventually redir GPIO pin from GPU to DAC? where to get input data?");
}


//eof