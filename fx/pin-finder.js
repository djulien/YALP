#!/usr/bin/env node
//YALP pin-finder effect
//Copyright (c) 2020-2021 Don Julien
//Can be used for non-commercial purposes.
//
//History:
//History:
//ver 0.9  DJ  10/3/16  initial version
//ver 0.95 DJ  3/15/17  cleaned up, refactored/rewritten for FriendsWithGpu article
//ver 1.0  DJ  3/20/17  finally got texture re-write working on RPi
//ver 1.0a DJ  9/24/17  minor clean up
//ver 1.0b DJ  11/22/17  add shim for non-OpenGL version of GpuCanvas
//ver 1.0.18 DJ  1/9/18  updated for multi-threading, simplified
//ver 1.0.18b DJ  6/6/18  minor api cleanup; misc fixes to multi-threading
//ver 1.0.20 DJ  10/20/20  rewrite/simplify for use with GpuPort addon
//ver 1.20.11 DJ 11/20/20  rework multi-threading to use worker_threads
//ver 0.20.12 DJ  move to separate incl folder
//ver 0.21.1  DJ  rework API

'use strict'; //find bugs easier
const {RGBdim1, hex} = require("yalp/incl/colors");
const {my_exports} = require("yalp/incl/utils");
const {debug} = require("yalp/incl/msgout");
//debug(yalp);


///////////////////////////////////////////////////////////////////////////////
////
/// pin-finder
//

const RED = 0xFFff0000;
const GREEN = 0xFF00ff00;
const BLUE = 0xFF0000ff;
const WHITE = 0xFFffffff;
const BLACK = 0xFF000000;

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


//pin-finder:
//generate different 1-of-N R/G/B pattern on each GPIO pin
//fps + duration determine smoothness and speed of fade; fps can be different from main seq 
my_exports({pin_finder});
async function pin_finder(opts)
{
    const {model, start, duration, fps, await_frame} = opts;
//    const fps = opts.fps || yalp.fps || 1;
    const steplen = 1e3 / fps; //(fps - 1); //msec
    const dim = opts.dimff / 255 || opts.dim1 || 1.0;
    const colors = [RGBdim1(RED, dim), RGBdim1(GREEN, dim), RGBdim1(BLUE, dim), RGBdim1(WHITE, dim)];
    const [color, repeat] = [colors[model.portnum >> 3], (model.portnum & 7) + 1];
//debug("pin finder ...", opts, model);
debug("pin-finder: model '%s', port# %d, color %s, repeat %d, start %'d, duration %'d, steplen %'d msec => #steps %'d".brightGreen, model.name, model.portnum, hex(color, "0xFF"), repeat, start, duration, steplen, Math.trunc(duration / steplen));
    for (let fxtime = start; fxtime < start + duration; fxtime = (Math.trunc(fxtime / steplen) + 1) * steplen)
    {
if (~[0, 23].indexOf(model.portnum)) debug("pin-finder: port %d, await seq# %'d, time %'d msec", model.portnum, opts.seqnum, Math.trunc(fxtime));
        const frbuf = await await_frame(fxtime); //seqnum,
if (~[0, 23].indexOf(model.portnum)) debug("pin-finder: port %d, got fr seq# %'d, time %'d msec", model.portnum, (frbuf || model.nofrbuf).seqnum, (frbuf || model.nofrbuf).timestamp);
        if (!frbuf) { debug("pin-finder complete/cancel".brightRed); break; } //seq completed or cancelled
        if (frbuf.timestamp > start + duration) { debug("pin-finder eof %'d msec".brightGreen, frbuf.timestamp); break; } //eofx
//if (false)
        fxtime = frbuf.timestamp; //adaptive
        const step = Math.trunc(frbuf.timestamp / steplen);
        for (let n = 0; n < model.nodes1D.length; ++n)
//            model.nodes1D[n] = RGBblend((fxtime - start) / duration, from[n], to[n]); //TODO: fx-local cache
            model.nodes1D[n] = ((n - step) % repeat)? BLACK: step? color: colors.at(-1); //[] must be int; first one white for easier recognition of repeating pattern on larger props
//debug(model.name, step);
if (~[0, 23].indexOf(model.portnum)) debug("pin-finder: port %d, out node ofs %'d", model.portnum, -step % repeat);
        model.out(frbuf, `${(0 - step) % repeat} of ${repeat}`);
    }
    debug("pin-finder: completed".brightGreen);
}

//eof