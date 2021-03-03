#!/usr/bin/env node
//YALP color fade
//Copyright (c) 2020-2021 Don Julien
//Can be used for non-commercial purposes.
//
//History:
//ver 0.20.12 DJ  move to separate incl folder
//ver 0.21.1  DJ  rework API

'use strict'; //find bugs easier
const {my_exports, isary, isdef, json_clup} = require("yalp21/incl/utils");
//const {yalp} = require("yalp21/yalp");
//const {RGBblend} = require("yalp21/incl/colors");
const {XPARENT, RGBdim1, RGB2hsv, hsv2RGB, RGBblend, hex} = require("yalp21/incl/colors");
const {debug} = require("yalp21/incl/msgout");
//debug(yalp);


//fade:
//from = RGB color (scalar), image (1/2D array) or current node values (undef)
//to = RGB color (scalar) or image (1/2D array)
//fps + duration determine smoothness and speed of fade; fps can be different from main seq 
my_exports({fx_fade});
async function fx_fade(opts) //, frbuf)
{
//debug(opts);
//    const {model, await_frame, /*from, to, start, duration, fps*/} = opts;
    const {model, start, duration, fps, await_frame} = opts;
//    assert(isdef(DURATION) && isdef(FPS) && isdef(colors));
//    const start = opts.start || 0;
//    const duration = opts.duration || 0;
//    const fps = opts.fps || yalp.fps || 1;
    const from = isary(opts.from)? opts.from.slice(): //from image
//                isdef(opts.from)? new Uint32Array(model.nodes1D.length).fill(opts.from >>> 0): //from scalar
//                model.nodes1D.slice(); //from current
                new Uint32Array(model.nodes1D.length).fill(isdef(opts.from)? opts.from >>> 0: XPARENT); //from scalar
//                model.nodes1D.slice(); //from current
    const to = isary(opts.to)? opts.to.slice(): //to image
//                isdef(opts.to)? new Uint32Array(model.nodes1D.length).fill(opts.to >>> 0): //to scalar
//                model.nodes1D.slice(); //to current
                new Uint32Array(model.nodes1D.length).fill(isdef(opts.to)? opts.to >>> 0: XPARENT); //to scalar
    const steplen = 1e3 / fps; //(fps - 1); //, num_steps = Math.ceil(DURATION / steplen); //msec
//    const colors = toary(opts.color); //|| [BLACK, WHITE_dim]);
//    const DIM = .5; //TODO
//    const seqnum = yalp.seqnum;
//    for (;;) { render(); model.out(); await; }
    const trace = [];
    trace.push(from[0]);
debug("fade: model '%s', start %'d, duration %'d, steplen %'d msec => #steps %'d, from[0] %s => to[0] %s".brightGreen, model.name, start, duration, steplen, Math.trunc(duration / steplen), hex(from[0], "0xFF"), hex(to[0], "0xFF"));
if (model.want_dump) //show theoretical inital fx state (for debug, doesn't need to be flushed)
{
    model.nofrbuf.timestamp = start;
//debug("initial state".brightCyan, model.nofrbuf.timestamp);
    for (let n = 0; n < model.nodes1D.length; ++n)
        model.nodes1D[n] = from[n];
    model.out(model.nofrbuf, "initial"); //, true);
}
    for (let fxtime = start; fxtime < start + duration; fxtime = (Math.trunc(fxtime / steplen) + 1) * steplen)
    {
//debug("fade await seq# %d, time %'d msec", seqnum, Math.trunc(fxtime));
        const frbuf = await await_frame(fxtime); //seqnum,
        if (!frbuf) { debug("fade complete/cancel".brightRed); break; } //seq completed or cancelled
        if (frbuf.timestamp > start + duration) { debug("fade eof %'d msec".brightGreen, frbuf.timestamp); break; } //eofx
//debug("fx_fade: wanted time >= %'d, got time %'d", Math.trunc(fxtime), frbuf.timestamp); //, mp3play.timestamp, (fxtime - start) / duration);
if (false)
        fxtime = frbuf.timestamp; //adaptive
//const sv0 = model.nodes1D[0];
        for (let n = 0; n < model.nodes1D.length; ++n)
            model.nodes1D[n] = RGBblend((fxtime - start) / duration, from[n], to[n]); //TODO: fx-local cache
        trace.push(model.nodes1D[0]);
//if (duration == 2e3) debug("fade %3.2f [0] %d => %d", (fxtime - start) / duration, sv0, model.nodes1D[0]);
//if (!(count % 30)) //fxtime < start + steplen || fxtime + steplen > start + duration)
//{
//    let buf = "";
//    for (let n = 0; n < Math.min(model.nodes1D.length, 20); ++n)
//        buf += ", " + hex(model.nodes1D[n], "0xFF");
//    debug("fade blend %3.2f: %s", (fxtime - start) / duration, buf.slice(2));
//}
        model.out(frbuf, RGB2hsv(model.nodes1D[0])); //, true); //model.dirty = true;
    }
trace.push(to[0]);
if (model.want_dump) //show theoretical final fx state (for debug, doesn't need to be flushed)
{
//debug("final should be", hex(to[0], "0xFF"));
    model.nofrbuf.timestamp = start + duration;
//debug("final state".brightCyan, model.nofrbuf.timestamp);
    for (let n = 0; n < model.nodes1D.length; ++n)
        model.nodes1D[n] = to[n];
    model.out(model.nofrbuf, "final"); //, true);
}
    debug("fade: completed".brightGreen);
    debug(trace.map(color => hex(color, "0xFF")).join(","));
    debug(trace.map(color => json_clup(JSON.stringify(RGB2hsv(color)))).join(","));
}

//eof