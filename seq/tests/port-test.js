#!/usr/bin/env node
//YALP pin-finder test seq
//history:
//1/1/21  4.21.1  DJ  architecture reworked for easier multi-threading and more open/distributed processes
//1/18/21  4.21.1  DJ  add example seq, fx; add model palette for more efficient color manipulation??

//Node.js profiling:
//https://nodejs.org/en/docs/guides/simple-profiling/

'use strict'; //find bugs easier

require("magic-globals"); //__file, __line, __stack, __func, etc
require('colors').enabled = true; //for console output (all threads)
const fs = require("fs");
//const assert = require('assert').strict; //https://nodejs.org/api/assert.html
//const Path = require("path");
//const fx = require("./fx");
//const models = require("./models");
//const layout = require("./layout");
//const {isdef, elapsed, srcline} = require("gpuport");
const {my_exports, find_files, shortpath, isRE, sleep, elapsed, plural, isdef} = require("yalp/incl/utils");
const {debug, warn, log, errlog, fmtstr, TODO, srcline} = require("yalp/incl/msgout");
const {stats: color_stats} = require("yalp/incl/colors");
//const {TODO} = require("yalp/incl/utils");
//srcline.me = Path.basename(__file); //kludge: show "me" in debug msgs


///////////////////////////////////////////////////////////////////////////////
////
/// example seq
//

//const {layout, ctlr} = require(cfg.layout || "yalp/layouts/devlab.js");
//fx:
const {runfx} = require("yalp/seq/player");
const {pin_finder} = require("yalp/fx/pin-finder");


my_exports({seq}); //, layout, xctlr: ctlr}); //allow player to use it
async function seq(opts)
{
    const {await_frame, got_frbuf, layout, seqnum, fps} = opts; //use default (player/cfg-selected) layout
debug("port-test seq starting ..."); //, opts.seqnum, opts.fps);
    const start = 0, duration = 10e3; //run for 1 minute
    const my_fx = layout.all_ports.slice(10, 1).map(model => runfx({fx: pin_finder, model, duration}));
    layout.all_ports[0].want_trace = layout.all_ports.at(-1).want_trace = true;
    my_fx.push({got_frbuf}); //runfx.latest); //kludge: allow seq to use its own evth; caller didn't have access to my_fx[]
//if (false)
    const bkg = layout.ctlr.updloop(frbuf => (/*debug("evth {%'d, %'d} => %'d evth", (frbuf || NOFR).seqnum, (frbuf || NOFR).timestamp, my_fx.length),*/ my_fx.map(fx => (/*debug(typeof fx, typeof fx.got_frbuf),*/ fx.got_frbuf(frbuf))))); //fx.pending.resolve(frbuf));
//    const seqnum = yalp.seqnum;
log("seq[%'d] start".brightCyan, seqnum); //, Object.keys(yalp));
async function not_needed()
{
    for (let seqtime = 0; seqtime < duration; seqtime = (Math.trunc(seqtime / steplen) + 1) * steplen)
    {
//debug("fade await seq# %d, time %'d msec", seqnum, Math.trunc(fxtime));
        const frbuf = await await_frame(seqtime);
debug("seq[%'d]: got frbuf {%'d, %'d}", seqnum, (frbuf || NOFR).seqnum, (frbuf || NOFR).timestamp);
        if (!frbuf) { debug("seq complete/cancel".brightRed); break; } //seq completed or cancelled
        if (frbuf.timestamp > duration) { debug("seq eof %'d msec".brightGreen, frbuf.timestamp); break; } //eoseq
//        if (evt.strict && frbuf.timestamp > evt.start + evt.duration) continue; //skip this evt
//        my_fx.push(/*evt.fx.call(null,*/ runfx(evt)); //, frbuf)); //start next async fx; start even if late
//if (false)
        seqtime = frbuf.timestamp; //adaptive
    }
}
    const frbuf = await await_frame(duration); //wait for seq duration
    debug("waiting for seq + %'d fx to finish, last frbuf was {%d, %'d}".brightGreen, my_fx.length - 1, (frbuf || NOFR).seqnum, (frbuf || NOFR).timestamp);
    await Promise.all(my_fx.map(fx => fx.await4done));
    debug("seq + %'d fx finished", my_fx.length - 1);
    layout.ctlr.cancel(); //exit from frame upd loop
//debug("here0", typeof bkg, !!bkg.then);
//    await sleep(5e3);
    const numfr = await bkg;
    debug("%'d fx, %'d frame%s processed (%'d msec)", my_fx.length - 1, plural(numfr), plural(), Math.round(numfr * 1e3 / fps));
//    await sleep(5e3);
    debug("color stats", color_stats);
//debug(`'${opts.model.name || srcline(+1)}' fx perf: `.brightCyan, opts.model.stats || {});
}


///////////////////////////////////////////////////////////////////////////////
////
/// (example) seq, model, fx
//

//NOTE: 1 fx/model (else conflicting updates), but mult model/fx
//=> list of model+fx waiting for frbufs

//initiates seq + mp3 playback
//mp3 timing is rigid, but can be tweaked by dropping or adding frames
//gpu refresh rate is fixed, but seq frames can be dropped or added
//seq is responsible for balancing these


////////////////////////////////////////////////////////////////////////////////////////////
function ignore()
{
//spread workload across multiple cores:
const workerize = null; //require("node-inline-worker"); //https://www.npmjs.org/package/node-inline-worker

//models:
const {layout} = null; //require("yalp21/layouts/devlab");
//debug(layout);
const models = Object.values(layout) //port info
//    .map(port => (debug(port), port))
    .map(port => port.models) //models on this port
    .flat()
//    .map(model => (debug(model), model))
    .reduce((by_name, model) => Object.assign(by_name, {[model.name]: model}), {});
debug("models", Object.keys(models));

//fx:
const {fx_fade} = require("yalp21/fx/fade");
const {mp3play} = require("yalp21/fx/mp3play");
//async function pxscan(


//dummy frbuf (mainly for debug):
const NOFR = {seqnum: -1, timestamp: -99};


//example seq:
//seq is just a (sorted) list of evts
//NOTE: all time delays are based on GPU frames; gives simple/reliable timing
//seq does not have its own frame rate; fx/evts determine their own frame rates
const evts =
[
//    {start: 0, duration: 10e3, fx: mp3play, media: /take three/i, xmodel: models.speaker},
    {start: 10e3, duration: 2e3, fx: fx_fade, model: models.devpanel, fps: 20, to: 0xFF00FF00},
    {start: 15e3, duration: 3e3, fx: fx_fade, model: models.devpanel, fps: 2, to: 0xFFff00ff},
];
my_exports({seq}); //allow use by player
async function seq(opts)
{
    const {await_frame} = opts;
//    const {/*start, duration,*/ evts} = opts;
//    assert(isdef(DURATION) && isdef(FPS) && isdef(colors));
//    const colors = toary(opts.color); //|| [BLACK, WHITE_dim]);
//    const DIM = .5; //TODO
    const my_fx = [];
    my_fx.push(runfx.latest); //kludge: allow seq to use its own evth; caller didn't have access to my_fx[]
//debug(my_fx[0], typeof my_fx[0].retval, my_fx[0].retval, typeof my_fx[0].got_frbuf, my_fx[0].got_frbuf);
    const bkg = yalp.updloop(frbuf => (/*debug("evth {%'d, %'d} => %'d evth", (frbuf || NOFR).seqnum, (frbuf || NOFR).timestamp, my_fx.length),*/ my_fx.map(fx => (/*debug(typeof fx, typeof fx.got_frbuf),*/ fx.got_frbuf(frbuf))))); //fx.pending.resolve(frbuf));
//    const seqnum = yalp.seqnum;
log("seq[%'d] start".brightCyan, runfx.seqnum); //, Object.keys(yalp));
//    for (let i = 0, frbuf = null; i < evts.length; ++i)
    evts
        .sort((lhs, rhs) => ((lhs.start || 0) - (rhs.start || 0)) || ((lhs.duration || 0) - (rhs.duration || 0)))
        .reduceRight((next, evt, inx, all) => //kludge: in lieu of .forEachReverse()
        {
            const warnings = [];
            if (!evt.fx) throwx("evt[%'d/%'d]: no fx to run", inx, all.length);
            if (!evt.model) { evt.model = evt.fx; warnings.push(["using fx as model"]); } //use fx/seq as model
            if (!evt.hasOwnProperty("start")) { evt.start = 0; warnings.push(["setting fx start to 0"]); }
            if (!evt.fps) { evt.fps = yalp.fps || 1; warnings.push(["setting fps to %d", evt.fps]); }
            if (!evt.hasOwnProperty("duration")) //default run until next evt
            {
                evt.duration = (next[evt.model.name].start || evts.last.start) - (evt.start || 0) || 1;
                warnings.push(["setting duration to %'d msec", evt.duration]);
            }
            if (warnings.length) warn("evt[%'d/%'d]: %s", inx, all.length, warnings.map(msg => fmtstr(...msg)).join(", "));
            next[evt.model.name] = evt; //remember next evt for this model
            return next;
        }, {});
models.devpanel.want_dump = true;
TODO("tsfn -> wker thread? or async/promise across to wker thread?");
    let frbuf;
    const FXAHEAD = 50; //give fx 50 msec extra to init before needed
    for (const [inx, evt] of Object.entries(evts))
//    for (const evt in evts)
//    for (let time = evts[0].start; time < evts.top.start + evts.top.duration; time += steplen)
    {
debug("evt[%'d/%'d]: model '%s' await %'d-%'d msec, cur frbuf {%'d, %'d}", inx, Object.keys(evts).length, evt.model.name, evt.start, FXAHEAD, (frbuf || NOFR).seqnum, (frbuf || NOFR).timestamp);
        if (!frbuf || evt.start - FXAHEAD > frbuf.timestamp) frbuf = await await_frame(evt.start - FXAHEAD); //seqnum, //work ahead a little; gives expensive fx extra time to start
//debugger;
//debug(typeof frbuf, frbuf.constructor.name, frbuf);
debug("seq[%'d]: got frbuf {%'d, %'d}", runfx.seqnum, (frbuf || NOFR).seqnum, (frbuf || NOFR).timestamp);
        if (!frbuf) break; //seq completed or cancelled
//        if (evt.strict && frbuf.timestamp > evt.start + evt.duration) continue; //skip this evt
        my_fx.push(/*evt.fx.call(null,*/ runfx(evt)); //, frbuf)); //start next async fx; start even if late
    }
    debug("waiting for seq + %'d evts to finish, last frbuf was {%d, %'d}".brightGreen, my_fx.length - 1, (frbuf || NOFR).seqnum, (frbuf || NOFR).timestamp);
    await Promise.all(my_fx.map(fx => fx.retval));
    debug("seq + %'d evts finished", my_fx.length - 1);
    yalp.cancel(); //exit from frame upd loop
//debug("here0", typeof bkg, !!bkg.then);
//    await sleep(5e3);
    const numfr = await bkg;
    debug("%'d evt%s, %'d frame%s processed (%'d msec)", plural(evts.length), plural(), plural(numfr), plural(), Math.round(Math.max(numfr, 0) * 1e3 / yalp.frtime));
//    await sleep(5e3);
    debug("color stats", color_stats);
}
}


///////////////////////////////////////////////////////////////////////////////
////
/// misc helpers/utils
//

//eof