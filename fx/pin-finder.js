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

//dummy frbuf (mainly for debug):
const NOFR = {seqnum: -1, frnum: -1, timestamp: -99, latency: -1};


//pin-finder:
//generate different 1-of-N R/G/B pattern on each GPIO pin
//fps + duration determine smoothness and speed of fade; fps can be different from main seq 
my_exports({pin_finder});
/*async*/ function* pin_finder(opts, wait4frame) //generator allows *synchronous* yields
{
//debug("pin-finder ...");
    const {model, start, duration, fps} = opts;
//    const fps = opts.fps || yalp.fps || 1;
    const steplen = 1e3 / fps; //(fps - 1); //msec
    const dim = opts.dimff / 255 || opts.dim1 || 1.0;
    const colors = [RGBdim1(RED, dim), RGBdim1(GREEN, dim), RGBdim1(BLUE, dim), RGBdim1(WHITE, dim)];
    const [color, repeat] = [colors[model.portnum >> 3], (model.portnum & 7) + 1];
//debug("pin finder ...", opts, model);
debug("pin-finder: model '%s', port# %d, color %s, repeat %d, start %'d, duration %'d, steplen %'d msec => #steps %'d".brightGreen, model.name, model.portnum, hex(color, "0xFF"), repeat, start, duration, steplen, Math.trunc(duration / steplen));
let previous = -1;-312
    for (let fxtime = start, nxtime; fxtime < start + duration; fxtime = nxtime) //Math.trunc(fxtime / steplen + 1) * steplen)
    {
if (~[0, 23].indexOf(model.portnum)) debug("pin-finder: port %d, await seq# %'d, time %'d msec", model.portnum, opts.seqnum, fxtime);
        const frbuf = /*await*/ yield wait4frame(fxtime);
//debug(JSON.stringify(frbuf));
        if (frbuf && frbuf.timestamp == previous) throwx("dupl frbuf {%d, %d=%'d}", frbuf.seqnum, frbuf.frnum, frbuf.timestamp);
        previous = (frbuf || NOFR).timestamp;
if (~[0, 23].indexOf(model.portnum)) debug("pin-finder: port %d, got fr seq# %'d, fr# %d = time %'d msec, waited %'d msec", model.portnum, (frbuf || NOFR).seqnum, (frbuf ||NOFR).frnum, (frbuf || NOFR).timestamp, (frbuf || NOFR).latency);
        if (!frbuf) break; //{ debug("pin-finder complete/cancel".brightRed); break; } //seq completed or cancelled
        if (frbuf.timestamp > start + duration) { debug("pin-finder eof %'d msec".brightGreen, frbuf.timestamp); break; } //eofx
//if (false)
//        fxtime = frbuf.timestamp; //adaptive
        const step = Math.round(frbuf.timestamp / steplen); //current ani fr# to render; CAUTION: frbuf time could be slightly < steplen (if fractional msec); round to avoid dupl next frame
        nxtime = (step + 1) * steplen;
//crlr: 0, 33, 66, 99, 133, 166, 199, 233
//fx: 0, 33.3, 66.6 99.9, 133.3, 166.6, 199.9, 233.3
        for (let n = 0; n < model.nodes1D.length; ++n)
//            model.nodes1D[n] = RGBblend((fxtime - start) / duration, from[n], to[n]); //TODO: fx-local cache
            model.nodes1D[n] = ((n - step) % repeat)? BLACK: step? color: colors.at(-1); //[] must be int; first one white for easier recognition of repeating pattern on larger props
//debug(model.name, step);
if (~[0, 23].indexOf(model.portnum)) debug("pin-finder: render port %d, step/fr# %'d, first node %'d, next time %'d", model.portnum, step, -step % repeat, nxtime);
        model.out(frbuf, `${step % repeat} of ${repeat}`);
    }
    debug("pin-finder: fx completed".brightGreen);
}

function* dummy_pin_finder(opts, wait4frame) //generator allows *synchronous* yields
{
    const {start, duration, fps} = opts;
    const steplen = 1e3 / fps; //(fps - 1); //msec
    debug("fx start: %'d..%'d(+%'d), steplen %'d, then wait4frame %'d", start, start + duration, duration, steplen, start);
    for (let fxtime = start, frbuf; fxtime < start + duration; fxtime = frbuf.timestamp + steplen)
    {
//        debug("fx wait4frame", fxtime);
        frbuf = yield wait4frame(fxtime);
        debug("fx got frbuf %'d msec, next wait4frame %'d? %d", frbuf.timestamp, Math.trunc(frbuf.timestamp + steplen), +(frbuf.timestamp + steplen < start + duration));
//        fxtime = frbuf.timestamp + 1;
    }
    debug("fx done");
    return 456;
}

//eof