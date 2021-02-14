#!/usr/bin/env node
//FX tester (multi-threaded)
//Copyright (c) 2020 Don Julien
//Can be used for non-commercial purposes.
//
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

'use strict'; //find bugs easier
//require('colors').enabled = true; //for console output (all threads)
//require("magic-globals"); //__file, __line, __stack, __func, etc
const Path = require('path');
const fs = require("fs");
//const {blocking, wait} = require('blocking-style');
//const cluster = require('cluster');
//const JSON = require('circular-json'); //CAUTION: replaces std JSON with circular-safe version
//const {sprintf, vsprintf} = require('sprintf-js'); //https://www.npmjs.com/package/sprintf-js
const glob = require("glob");
const {hsvToRgb: hsv2rgb, rgbToHex: rgb2hex, hexToRgb: hex2rgrb, rgbToHsv: rgb2hsv} = require("colorsys"); //https://github.com/netbeast/colorsys
const {Worker, isMainThread, parentPort, workerData} = require('worker_threads');
//console.error(JSON.stringify(isMainThread), JSON.stringify(workerData), srcline());
//const {debug} = require('./shared/debug');
//const memwatch = require('memwatch-next');
//const {Screen, GpuCanvas, UnivTypes} = require('gpu-friends-ws281x');
//const {Screen, GpuCanvas, UnivTypes/*, wait, elapsed, cluster, AtomicAdd, optimizationStatus*/} = require('gpu-friends-ws281x');
//const EPOCH = cluster.isWorker? elapsed(+process.env.EPOCH): elapsed(); //use consistent time base for logging
//debug(`epoch ${EPOCH}, master? ${cluster.isMaster}`.blue_lt); //TODO: fix shared time base
//console.log(JSON.stringify(Screen));
//process.exit();
//console.log("here1");
const assert = require('assert').strict; //https://nodejs.org/api/assert.html
const XPM = require('./xpm');
const {flip} = require("../xmas2020/models/MODEL");
const {name2file, intlist, time2str, typename} = require("../xmas2020/incl/utils");
const {palette_dim} = require("../xmas2020/incl/colors");
//console.log(palette_dim);
const {/*WS281x, CFG,*/ debug, debug_nested, debug_limit, srcline, plural, commas, hex, isdef} = require("gpuport"); //"../"); //npm link allows real module name to be used here
debug.max_arg_len = 400;
//const ary = [100, 200, 300]; debug("here2", ary.slice(0, 2).map((val) => hex(val))); run();

//const { debug } = require('console');
extensions(); //hoist for inline init usage below

TODO("WS281x config calculator: clk 2.4MHz (overridable), 3 ppb/hblank (overridable), #null px, fps/frtime (selectable: 20/50ms, 30/33ms, 40/25ms, 100/10ms) => UNIV_LEN => xres (must be even, 3n-1), yres, aspect, nodes/row; vblank => tweak (down) fps");


////////////////////////////////////////////////////////////////////////////////
////
/// effects:
//


//primary RGB colors:
//no- external format (used by caller) is always (A)RGB
//HSV values are easier to manipulate (especially hue + brightness)
const RED = /*rgb2hsv(RGB2rgb*/((0xFFff0000));
const RED_WRAP = 0x00FF00FF; //kludge: need to distinguish red hue coming from green (0) or coming from blue (360)
const GREEN = /*rgb2hsv(RGB2rgb*/((0xFF00ff00));
const BLUE = /*rgb2hsv(RGB2rgb*/((0xff0000ff));
const YELLOW = /*rgb2hsv(RGB2rgb*/((0xffffff00));
const CYAN = /*rgb2hsv(RGB2rgb*/((0xff00ffff));
const MAGENTA = /*rgb2hsv(RGB2rgb*/((0xffff00ff));
const WHITE = /*rgb2hsv(RGB2rgb*/((0xffffffff));
const WARM_WHITE = /*rgb2hsv(RGB2rgb*/((0xFFffffb4)); //h 60/360, s 30/100, v 1.0 //try to simulate incandescent
const COOL_WHITE = /*rgb2hsv(RGB2rgb*/((0xFFb4b4ff)); //0xFFccccff));
//const PALETTE = [RED, GREEN, BLUE, YELLOW, CYAN, MAGENTA];
const BLACK = /*rgb2hsv(RGB2rgb*/((0xff000000)); //NOTE: alpha must be on to take effect
const XPARENT = 0; //NOTE: alpha off; used to merge/blend with bkg

const RED_dim = RGBdim(RED, 0.01); //0xFF020000;
const GREEN_dim = RGBdim(GREEN, 0.01); //0xFF000200;
const BLUE_dim = RGBdim(BLUE, 0.01); //0xFF000002;
const YELLOW_dim = RGBdim(YELLOW, 0.01); //0xFF010100;
const CYAN_dim = RGBdim(CYAN, 0.01); //0xFF000101;
const MAGENTA_dim = RGBdim(MAGENTA, 0.01); //0xFF010001;
const WHITE_dim = RGBdim(WHITE, 0.01); //0xFF010101;
//debug("(ext) colors: red 0x%x, green 0x%x, blue 0x%x", RED, GREEN, BLUE);
//debug("0x%x, 0x%x, 0x%x, 0x%x, 0x%x, 0x%x", WARM_WHITE, COOL_WHITE, RED_dim, GREEN_dim, BLUE_dim, WHITE_dim); process.exit();


//fx args:
//model:
// nodes = 1D array of all nodes
// nodes2D = 2D grid of nodes; origin = bottom left
// width = grid width
// height = grid height
// univ = universe (port)
//opts:
// duration = total length of time for effect (msec)
// fps = desired #frames/sec (animation speed)
// start = fx start time (msec)
//globals:
// await_until(msec) = flush + wait until specified time (relative to effect start time)
// nodes_all = nodes for all univ


//color fade:
//color can be ary
//duration applies to each color
async function color_fade(model, opts)
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
async function meteors_new(model, opts) //meteor(model, opts)
{
    const {nodes2D, width: W, height: H, await_until, ctlr} = model;
//    const {DURATION/*, FPS*/} = opts;
//    const colors = [CYAN_dim]; //toary(opts.color || WHITE);
//    const durations = toary(opts.DURATION || 10e3); //msec
    model.fill(BLACK); //just clear all nodes once, then turn on/off individ; perf better than rendering entire grid each frame!
//    await await_until(0); //init frame dark
//    const meteorites = [{0: 0}, {6: 60}, {12: 120}, {18: 180}, {24: 240}, {30: 300}]; //{xofs: hue360}
//TODO("randomize color, position, speed, size");
    const DENSITY = 5;
    const hues = [0, 60, 120, 180, 240, 300];
    const meteorites = Array.from({length: W}).map((_, inx, all) => all[inx] = {yofs: Math.round(Math.random() * DENSITY * H), hue: hues[Math.floor(Math.random() * hues.length)]}); //* 360
    const xofs = +(opts || {}).xofs || 0; //kludge: just change horiz ofs for now
//    meteorites.push(...meteorites, ...meteorites);
    const tail = [0.05, 0.12, 0.3, 0.8, 1.0].reverse();
    const steplen = 1e3 / 10; //1e3/20; //durations[0] / (H + tail.length);
    const duration = (opts || {}).DURATION || 60e3;
    const started = ctlr.elapsed;
    for (let step = 0; /*step < (DENSITY + 1) * H*/; ++step)
    {
        let numvis = 0;
        const clup = [];
        for (let x = 0; x < meteorites.length; ++x)
        {
            const yhead = Math.round((meteorites[x].yofs - step + 999 * H) % (DENSITY * H) - (DENSITY - 1) * H / 2); //-H..2H
            if ((yhead >= H) || (yhead + tail.length < 0)) continue; //!visible
            ++numvis;
            const hue360 = meteorites[x].hue;
//            const [xstr, hue360] = Object.entries(meteorite)[0]; const x = +xstr;
//        if ((xofs + x < 0) || (xofs + x >= W)) continue; //clip
            const hsv360 = {h: hue360, s: 100, v: 10}; //100 is too bright; try 10%
//fade as it falls;
//        for (let yhead = H - 1; yhead + tail.length >= 0; --yhead)
//        {
            for (let yofs = 0; yofs <= tail.length; ++yofs)
            {
                const br = (yofs < tail.length)? tail[yofs]: 0;
//            const color_dim = fromRGB(color.r * br, color.g * br, color.b * cr); //TODO: repl with hsv
                const color_dim = rgb2RGB(hsv2rgb(hsv360.h, hsv360.s, hsv360.v * br));
//                if ((xofs + x < 0) || (xofs + x >= W)) continue; //clip; inner loop to maintain timing
//debug(typeof xofs, xofs, typeof x, +x, typeof (xofs + x), typeof (xofs + +x), xofs + +x, W, H);
//debug("nodes[%'d][%'d] = 0x%x", xofs + x, yhead + yofs, color_dim);
                nodes2D[xofs + x][yhead + yofs] = color_dim; //force to num
            }
//debug("meteor[%d]: hsv360 [%d, %d, %d], yhead %d, yofs %d, node[%d][%d] = 0x%x", step, hsv360.h, hsv360.s, hsv360.v, yhead, /*yofs*/ -1, xofs, yhead + /*yofs*/ 0, /*color_dim*/ 0);
//            await await_until((step + 1) * steplen); //adaptive
//            for (let yofs of [0, tail.length])
//            nodes2D[xofs + x][yhead + tail.length] = BLACK; //only need to clear last one; others will be overwritten during next frame
            clup.push([xofs + x, yhead + tail.length]);
        }
debug("out until %'d msec, #clup %'d", (step + 1) * steplen, clup.length); //JSON.stringify(clup));
        await await_until((step + 1) * steplen); //adaptive
        clup.forEach(([x, y]) => nodes2D[x][y] = BLACK);
debug("meteor[%d]: #vis %'d/%'d", step, numvis, meteorites.length); //hsv360 [%d, %d, %d], xofs %d", step, -1, -1, -1, -1); //hsv360.h, hsv360.s, hsv360.v, xofs);
        if (ctlr.elapsed - started >= duration) break;
    }
}
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
//debug("meteor[%d]: hsv360 [%d, %d, %d], xofs %d", step, hsv360.h, hsv360.s, hsv360.v, xofs);
    }
}


//raster image:
//xofs, yofs allows scrolling, panels, etc
async function image(model, opts)
{
//debug("image ...", opts, model);
    const {nodes2D, width: W, height: H, await_until} = model;
    const {DURATION, path, /*xofs, yofs*/} = opts;
    const [xofs, yofs] = [opts.xofs || 0, opts.yofs || 0];
    const DIM = isdef(opts.DIM, opts.DIM, 0.3);
//TODO: stretch, shrink, etc
    const img = ((image.cache || {}).name == path)? image.cache: image.cache = XPM.fromFile(path);
debug("image: img '%s', dim %2.1f, w/h (%'d, %'d) + x/y (%'d, %'d), model w/h (%'d, %'d)", path, DIM, img.width, img.height, xofs, yofs, W, H);
    if (!opts.NOBLANK) model.fill(BLACK); //reset bkg or allow overlays
const dbgcolors = {};
    for (let y = 0; y < img.height; ++y)
        for (let x = 0; x < img.width; ++x)
        {
            if ((y + yofs < 0) || (y + yofs >= H)) continue; //vert clip
            if ((x + xofs < 0) || (x + xofs >= W)) continue; //horiz clip
            const color = img.palette[img.colorinx[y][x]];
            if (typeof color != 'number') continue; //color = BLACK; //bkg
//                  else color = png.color((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, 
//            if ((x == 0) && (x + xofs > 0)) main.nodes[img.xy(x + xofs - 1, y)] = BLACK;
            const yflip = H - (yofs + y) - 1;
            const dimmed = RGBdim(color, DIM);
            nodes2D[x + xofs][yflip] = dimmed;
++dbgcolors[dimmed] || (dbgcolors[dimmed] = 1);
        }
//    main.ws.dirty = true;
//    main.ws.out();
    await await_until(DURATION);
//debug("%'d image colors used: " + Object.entries(dbgcolors).map(([color, count]) => `0x${hex(color)}: ${count}`).join(", "), dbgcolors.length); //JSON.stringify(dbgcolors));
}


//line drawing:
//no, not vector graphics :P
TODO("poly line");
async function polyline(model, opts)
{
debug("polyline ...", opts, model);
    const {nodes2D, width: W, height: H, await_until} = model;
    const {DURATION, points, /*xofs, yofs*/} = opts;
    const DIM = isdef(opts.DIM, opts.DIM, 0.3);
    if (!opts.NOBLANK) model.fill(BLACK); //reset bkg or allow overlays
    for (let y = 0; y < img.height; ++y)
        for (let x = 0; x < img.width; ++x)
        {
            if ((y + yofs < 0) || (y + yofs >= H)) continue; //vert clip
            if ((x + xofs < 0) || (x + xofs >= W)) continue; //horiz clip
            const color = img.palette[img.colorinx[y][x]];
            if (typeof color != 'number') continue; //color = BLACK; //bkg
//                  else color = png.color((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, 
//            if ((x == 0) && (x + xofs > 0)) main.nodes[img.xy(x + xofs - 1, y)] = BLACK;
            const yflip = H - (yofs + y) - 1;
            nodes2D[x + xofs][yflip] = RGBdim(color, DIM);
        }
//    main.ws.dirty = true;
//    main.ws.out();
    await await_until(DURATION);
}


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


//wipe:
//use vertical for pour/drain:
async function wipe(model, opts)
{
    const STYLES = { L2R: 1, R2L: 2, T2B: -3, B2T: -4};
    const {nodes2D, width: W, height: H, await_until} = model;
    const colors = toary(opts.color || WHITE);
    const durations = toary(opts.DURATION || 0);
    const styles = toary(opts.style || STYLES.L2R).map((style) => STYLES[style.toUpperCase()] || style); //allow name or value
    const widths = toary(opts.width || Math.max(W, H)); //TODO
//    model.fill(BLACK); //just clear all nodes once, then turn on/off individ; perf better than rendering entire grid each frame!
//    await await_until(0); //init frame dark
    for (const [inx, color] of Object.entries(colors)) //CAUTION: typeof inx == "string"
    {
        const start = model.ctlr.elapsed;
        const duration = durations[inx % durations.length];
        const style = styles[inx % styles.length];
        const width = widths[inx % widths.length];
        const steplen = Math.ceil(duration / ((style < 0)? H: W)); //msec
        debug("wipe 0x%x [%d/%d] style %d, width %d for %'d msec, %'d msec/step ...", color, inx, colors.length, style, width, steplen * W * H, steplen);
//        assert(RGB(color) || (colors.length > 1)); //d'oh!
        assert(duration > controller.frtime, `step duration ${commas(duration)} must be > frame time ${commas(controller.frtime)} msec`); //be realistic
        if (!opts.NOBLANK) model.fill(BLACK);
        switch (style)
        {
            case STYLES.L2R:
            case STYLES.R2L:
                for (let x = 0, step = 0; x < W; ++x)
                {
                    const xflip = (style == STYLES.R2L)? W - x - 1: x;
                    for (let y = 0; y < H; ++y, ++step) nodes2D[xflip][y] = color;
                    await await_until(start + (step + 1) * steplen); //adaptive
                }
                continue;
            case STYLES.T2B:
            case STYLES.B2T:
                for (let y = 0, step = 0; y < H; ++y)
                {
                    const yflip = (style == STYLES.T2B)? H - y - 1: y;
                    for (let x = 0; x < W; ++x, ++step) nodes2D[x][yflip] = color;
                    await await_until(start + (step + 1) * steplen); //adaptive
                }
                continue;
        }
//debug_limit(1, "unhandled style:", style);
    }
//    await await_until(DURATION); //one last time in case frame missed
}


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


//set all nodes to a color:
//color + DURATION can be arrays, duration applies to *each* color
async function fill(model, opts)
{
//    const ws = main.ws;
//    ws.fill(BLACK);
//    await ws.out(5e3);
//    const {UNIV, /*DURATION, color*/} = opts;
    const {/*nodes1D*/ await_until} = model;
    const durations = toary((opts || {}).DURATION || 0);
    const colors = toary((opts || {}).color || BLACK);
    for (const [inx, color] of Object.entries(colors)) //CAUTION: typeof inx == "string"
    {
        const duration = durations[+inx % durations.length];
        assert((colors.length < 2) || (duration > controller.frtime), `duration ${commas(duration)} must be > frame time ${commas(controller.frtime)} msec`); //be realistic
        debug("fill[%d] '%s' 0x%x for %'d msec ...", inx, model.name, color, duration);
        model.fill(color); //for (let n = 0; n < nodes1D.length; ++n) nodes1D[n] = color; //nodes1D.fill(color);
        await await_until((+inx + 1) * duration); //adaptive; NOTE: not needed for *this* effect; allows scheduling of *subsequent* effects (sequential)
    }
}

    
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


TODO("fx: scroll, text, image, zoom, stroke, bubbles, meteors, icicle drip, icicle melt");

//yes, bkg music is also an "effect":
async function music(spkr, opts)
{
TODO("bkg music, eventually redir GPIO pin from GPU to DAC? where to get input data?");
}


//color helpers:

function RGBblend(mix, color1, color2, brightness)
{
    const rgb1 = RGB2rgb(color1), rgb2 = RGB2rgb(color2);
    return rgb2RGB({r: combine(rgb1.r,rgb2.r), g: combine(rgb1.g, rgb2.g), b: combine(rgb1.b, rgb2.b)});
    function combine(lhs, rhs) { return ((1 - mix) * lhs + mix * rhs) * (brightness || 1); }
}


//convert (r, g, b) to 32-bit ARGB color:
function rgb2RGB(rgb) //r, g, b, a)
{
    return uint32(isdef(rgb.a, rgb.a << 24, 0xFF000000) | (rgb.r << 16) | (rgb.g << 8) | rgb.b); //>>> 0; //force convert to uint32
}
//function toargb(ARGB)
//also get A if it's there
function RGB2rgb(ARGB)
{
    return {a: (ARGB >>> 24) & 0xFF, r: (ARGB >>> 16) & 0xFF, g: (ARGB >>> 8) & 0xFF, b: (ARGB >>> 0) & 0xFF}; //{a: A(ARGB), r: R(ARGB), g: G(ARGB)
}
//function toRGB(color) { return {a: A(color) || 0xFF, r: R(color), g: G(color), b: B(color)}; }

function hsv2HSV(hsv)
{
//NOTE: hue can be 0..360 so it can be > 8 bits; not a problem since upper byte is empty
    return uint32((hsv.h << 16) | (hsv.s << 8) | hsv.v); //force convert to uint32
}
function HSV2hsv(HSV)
{
    return {h: HSV >>> 16, s: (HSV >>> 8) & 0xFF, v: (HSV >>> 0) & 0xFF};
}
function hsvdim(hsv, dim) { return {h: hsv.h, s: hsv.s, v: hsv.v * dim}; }
function RGBdim(RGB, dim) { return rgb2RGB(hsv2rgb(hsvdim(rgb2hsv(RGB2rgb(RGB)), dim))); }


//color order fixup:
//const u16bytes = new DataView(swapbuf, 1, 2);
function RGSWAP(agrb)
{
//    const gr = agrb & 0x00ffff00;
    return (agrb & 0xff0000ff) | ((agrb >> 8) & 0xff00) | ((agrb << 8) & 0xff0000);
//    const LITTLE_ENDIAN = true;
//    const swapbuf = new ArrayBuffer(4);
//    const u32bytes = new DataView(swapbuf, 0, 4);
//    u32bytes.setUint32(0, grb);
//    u32bytes.setUint16(1, u32bytes.getUint16(1, LITTLE_ENDIAN), !LITTLE_ENDIAN);
//    return u32bytes.getUint32(0);
}
//12V seems to be rotated
function GBR2RGB(agbr)
{
//    return (abrg & 0xff000000) | ((abrg >> 16) & 0xff) | ((abrg << 8) & 0xffff00);
//    return (abrg & 0xff00ff00) | ((abrg >> 16) & 0xff) | ((abrg << 16) & 0xff0000);
//    return (abrg & 0xff000000) | ((abrg >> 16) & 0xff) | ((abrg << 8) & 0xffff00); //BRG => RGB
    return (agbr & 0xff000000) | ((agbr >> 8) & 0xffff) | ((agbr << 16) & 0xff0000); //GBR => RGB
}
//swap RGB byte order:
//function argb2abgr(color)
//{
//NOTE: bit shuffling is only 1 msec > buf read/write per frame
//    return 0xff000000 | (Math.floor(vec3[0] * 0xff) << 16) | (Math.floor(vec3[1] * 0xff) << 8) | Math.floor(vec3[2] * 0xff);
//    var retval = (color & 0xff00ff00) | ((color >> 16) & 0xff) | ((color & 0xff) << 16);
//if (++argb2abgr.count < 10) console.log(color.toString(16), retval.toString(16));
//    return retval;
//}


/*
//TODO("rgb2hsv, hsv2rgb");
function hsv(h, s, v) { return [isdef(h, h, 0), isdef(s, s, 100), isdef(v, v, 100)]; }


//convert color space:
//HSV is convenient for color (hue) or brightness (saturation) selection during fx gen
//display hardware requires RGB
function hsv360_2rgb(h, s, v) { return hsv2rgb(h / 360, s / 100, v / 100); }
function hsv2rgb(h, s, v)
//based on sample code from https://stackoverflow.com/questions/3018313/algorithm-to-convert-rgb-to-hsv-and-hsv-to-rgb-in-range-0-255-for-both
{
    h *= 6; //[0..6]
    const segment = uint32(h); // >>> 0; //(long)hh; //convert to int
    const angle = (segment & 1)? h - segment: 1 - (h - segment); //fractional part
//NOTE: it's faster to do the *0xff >>> 0 in here than in toargb
    const p = uint32((v * (1.0 - s)) * 0xff); //>>> 0;
    const qt = uint32((v * (1.0 - (s * angle))) * 0xff); //>>> 0;
//redundant    var t = (v * (1.0 - (s * (1.0 - angle))) * 0xff) >>> 0;
    v = uint32(v * 0xff); //>>> 0;

    switch (segment)
    {
        default: //h >= 1 comes in here also
        case 0: return toargb(v, qt, p); //[v, t, p];
        case 1: return toargb(qt, v, p); //[q, v, p];
        case 2: return toargb(p, v, qt); //[p, v, t];
        case 3: return toargb(p, qt, v); //[p, q, v];
        case 4: return toargb(qt, p, v); //[t, p, v];
        case 5: return toargb(v, p, qt); //[v, p, q];
    }
}


//from https://stackoverflow.com/questions/8022885/rgb-to-hsv-color-in-javascript
//input: r,g,b in [0,1], out: h in [0,360) and s,v in [0,1]
function rgb2hsv(r, g, b)
{
//    assert(false); //TODO
//    vec4 p = IIF(LT(rgb.g, rgb.b), vec4(rgb.bg, K_rgb.wz), vec4(rgb.gb, K_rgb.xy));
//    vec4 q = IIF(LT(rgb.r, p.x), vec4(p.xyw, rgb.r), vec4(rgb.r, p.yzx));
//    float d = q.x - min(q.w, q.y);
//    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e_rgb)), d / (q.x + e_rgb), q.x);
    const val = Math.max(r, g, b), chroma = val - Math.min(r, g, b);
    const hue = chroma && ((val == r) ? (g - b) / chroma : ((val == g) ? 2 + (b - r) / chroma : 4 + (r - g) / croma));
    return [60 * ((hue < 0) ? hue + 6 : hue), val && chroma / val, val];
}
*/


//return A/R/G/B portion of color:
//caller always use ARGB order
//function A(color) { return (color >>> 24) & 0xFF; }
//function R(color) { return (color >>> 16) & 0xFF; }
//function G(color) { return (color >>> 8) & 0xFF; }
//function B(color) { return (color >>> 0) & 0xFF; }
//function RGB_of(color) { return color & 0xFFFFFF; }

//TODO: these should probably be clamp(0..255) instead:
//function Abits(a) { return (a & 0xFF) << 24; }
//function Rbits(r) { return (r & 0xFF) << 16; }
//function Gbits(g) { return (g & 0xFF) << 8; }
//function Bbits(b) { return (b & 0xFF) << 0; }

//function fromRGB(r, g, b, a) //{ return ((a || 0xFF) << 24) | (r << 16) | (g << 8) | (b << 0); }
//{
//    const buf = new ArrayBuffer(4);
//    const u8 = new Uint8ClampedArray(buf);
//    const u32 = new Uint32Array(buf);
//    u8[0] = 
//    const color = Uint8ClampedArray.of(a || 0xFF, r, g, b);
//    const argb = new Uint32Array(color.buffer);
//    const retval = argb[0];
//debug(r, g, b, a, hex(retval, "0x"));
//    return retval;
//}
//function toRGB(color) { return {a: A(color) || 0xFF, r: R(color), g: G(color), b: B(color)}; }
//{
//    const argb = new Uint32Array(1);
//    const bytes = new Uint8Array(argb.buffer);
//    argb[0] = color;
//    const retval = {a: bytes[0] || 0xFF, r: bytes[1], g: bytes[2], b: bytes[3]};
//debug(hex(color, "0x"), retval);
//    return retval;
//}
//fromRGB(1, 2, 3, 4);
//fromRGB(0x11, 0x22, 0x33);
//toRGB(0x11223344);
//toRGB(0x010203);
//process.exit();


/////////////////////////////////////////////////////////////////////////////////
////
/// props/models
//

const UNMAPPED = -1 >>> 0; //virtual (unassigned/unmapped) nodes
module.exports.models = {};


//a model has 3 purposes:
//- define virtual grid size (fx target)
//- map virtual grid to physical nodes (h/w mapping)
//- indirectly, determine how effects look (ie, rectangular vs. radial geometry)
//first 2 above are done by returning a 2D grid holding physical node#s (or placeholders for null px)
//all fx should work for all models (although some might not look as good)
//multple models can be mapped to same physical nodes, allowing different results from same effect or props to operate in unison (ie, whole-house effects)


//240 deg M-tree:
const mtree = model("M-tree 240: MTREE", () =>
{
    const {nodes2D, width: W, height: H} = grid(2 * 12, 33);
    let numpx = 0;
//R2LB2T2B ZZ
    for (let x = 0; x < W; ++x)
        for (let y = 0; y < H; ++y)
        {
            const xflip = flip(x, W); //W - x - 1;
            const yflip = (x & 1)? flip(y, H): y; //H - y - 1: y;
            nodes2D[xflip][yflip] = numpx++;
//if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
        }
    assert(numpx == W * H); //check all nodes mapped
    return {numpx, nodes2D};
});
//mtree.csv(); run();
module.exports.models.mtree = mtree;
//submodels for legacy Vixen2 seq:
//mtree.branches = Array.from({length: 24}, (_, inx) =>
//{
//    fill: (color) => mtree.nodes2D[inx].fill(color),
//    out: () => mtree.dirty = true,
//}); //.reduce((lkup, branch) => (lkup['


//angel:
//body 8x22, r wing 6x24, r hair 8+7+8, r halo 7, trumpet 4x10, l halo 7, l hair 8+7+8, l wing 6x24
//"left", "right" viewed from back of angel
const angel = model("angel: NAT", () =>
{
    const [bodyW, bodyH] = [8, 22];
    const [wingW, wingH] = [6, 24]; //x 2
    const [hairW, hairH] = [3, 8]; //x 2
    const [haloW, haloH] = [7, 1]; //x 2
    const [trumpetC, trumpetL] = [4, 10];
    const {nodes2D, width: allW, height: allH} = grid(wingW + bodyW + wingW, bodyH + hairH + haloH + trumpetC);
    let numpx = 0;
    const retval = {};
//body L2RT2B2T ZZ
    retval.body = {x: wingW, y: 0, w: bodyW, h: bodyH};
    for (let x = 0, xofs = wingW; x < bodyW; ++x)
        for (let y = 0, yofs = 0; y < bodyH; ++y)
        {
            const yZZ = !(x & 1)? bodyH - y - 1: y;
            nodes2D[xofs + x][yofs + yZZ] = numpx++;
//if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
        }
//right wing L2RT2B2T ZZ
    retval.wings = [null, {x: wingW + bodyW, y: 0, w: wingW, h: wingH}];
    for (let x = 0, xofs = wingW + bodyW; x < wingW; ++x)
        for (let y = 0, yofs = 0; y < wingH; ++y)
        {
            const yZZ = !(x & 1)? wingH - y - 1: y;
            nodes2D[xofs + x][yofs + yZZ] = numpx++;
        }
//right hair R2LB2T2B ZZ
    for (let x = 0, xofs = wingW + bodyW - hairW; x < hairW; ++x)
        for (let y = 0, yofs = bodyH; y < hairH; ++y)
        {
            const yZZ = (x & 1)? hairH - y - 1: y;
            if ((x & 1) && (y == hairH - 1)) continue; //no node here
            nodes2D[xofs + x][yofs + yZZ] = numpx++;
        }
//right halo R2L
    for (let x = 0, xofs = allW / 2, yofs = bodyH + hairH; x < haloW; ++x)
        nodes2D[xofs + flip(x, haloW)][yofs] = numpx++;
//trumpet B2F2BCW ZZ
    retval.trumpet = {x: (allW - trumpetL) / 2, y: bodyH + hairH + haloH, w: trumpetL, h: trumpetC};
    for (let c = 0, yofs = bodyH + hairH + haloH; c < trumpetC; ++c)
        for (let l = 0, xofs = (allW - trumpetL) / 2; l < trumpetL; ++l)
        {
            const lZZ = (c & 1)? trumpetL - l - 1: l;
            nodes2D[xofs + lZZ][yofs + c] = numpx++;
        }
//left halo R2L
    retval.halo = {x: allW / 2 - haloW, y: bodyH + hairH, w: 2 * haloW, h: 1};
    for (let x = 0, xofs = allW / 2 - haloW, yofs = bodyH + hairH; x < haloW; ++x)
        nodes2D[xofs + flip(x, haloW)][yofs] = numpx++;
//left hair L2RT2B2T ZZ
    retval.hair = {x: wingW, y: bodyH, w: allW - 2 * wingW, h: hairH}; //CAUTION: gaps
    for (let x = 0, xofs = wingW; x < hairW; ++x)
        for (let y = 0, yofs = bodyH; y < hairH; ++y)
        {
            const yZZ = (x & 1)? hairH - y - 1: y;
            const yflip = flip(yZZ, hairH);
            if ((x & 1) && (yZZ == hairH - 1)) continue; //no node here
            nodes2D[xofs + x][yofs + yflip] = numpx++;
        }
//left wing L2RT2B2T ZZ
    retval.wings[0] = {x: 0, y: 0, w: wingW, h: wingH};
    for (let x = 0, xofs = 0; x < wingW; ++x)
        for (let y = 0, yofs = 0; y < wingH; ++y)
        {
            const yZZ = !(x & 1)? wingH - y - 1: y;
            nodes2D[xofs + x][yofs + yZZ] = numpx++;
        }

    assert(numpx == bodyW * bodyH + 2 * wingW * wingH + 2 * (hairW * hairH - 1) + 2 * haloW * haloH + trumpetC * trumpetL, `numpx ${numpx} != expected ${bodyW * bodyH + 2 * wingW * wingH + 2 * (hairW * hairH - 1) + 2 * haloW * haloH + trumpetC * trumpetL}`); //check all nodes mapped
    assert(numpx == 564, `numpx ${numpx} != expected 664`); //check all nodes mapped
//debugger;
    return Object.assign(retval, {numpx, nodes2D});
});
//debugger;
//(async function() { await angel.csv().wait4close(); })(); process.exit();
//(async function() { await angel.csv(); await sleep(10e3); })(); process.exit();
//angel.csv();
//const writefile = fs.createWriteStream('write-data.txt');
//const data = 'Welcome to om';
//writefile.write(data, 'UTF8');
//writefile.end();
//writefile.on('finish', function() { console.log("Write completed."); });
//writefile.on('error', function(err) { console.log(err.stack); });
//run(); //process.exit();


//star:
//~ radial 9 main spokes, each 2-4 wide, 11-14 long
const star = model("star: NAT, TREE", () =>
{
    const [centerW, centerL] = [3, 14];
    const [lrW, lrL] = [3, 12];
    const [fbW, fbL] = [4, 12];
    const [diagW, diagL] = [2, 11];
//map radial spokes to X ofs:
    const ofs =
    {
        center: 0,
        get S() { return this.center + centerW; },
        get SW() { return this.S + fbW; },
        get W() { return this.SW + diagW; },
        get NW() { return this.W + lrW; },
        get N() { return this.NW + diagW; },
        get NE() { return this.N + fbW; },
        get E() { return this.NE + diagW; },
        get SE() { return this.E + lrW; },
        get all() { return this.SE + diagW; },
    };
//    const {nodes2D, width: allW, height: allL} = grid(2 * fbW + centerW + 2 * lrW + 4 * diagW, Math.max(centerL, lrL, fbL, diagL));
    const {nodes2D, width: allW, height: allL} = grid(ofs.all, Math.max(centerL, lrL, fbL, diagL));
//debug(allW, allL, ofs.all, ofs.SE, ofs.E, ofs.NE, ofs.N, ofs.NW, ofs.W, ofs.SW, ofs.S);
    let numpx = 0;
//assign in string order:
//front/back spokes:
    for (let n = 0; n < 2 * fbW * fbL; ++n, ++numpx)
    {
//        const which2x = [0, 1, 2, 3, 2, 3, 0, 1];
        const [y, which] = [n % fbL, Math.floor(n / fbL)]; //F'FBB'FF'BB'
        const [xofs, x] = [(which & 2)? ofs.N: ofs.S, (which >= 6)? which - 6: (which >= 4)? which - 2: which]; //which2x[which]];
        const yZZ = (which & 1)? flip(y, fbL): y;
//debug(`n ${n}: y ${y}, which ${which}, xofs ${xofs}, x ${x}, yZZ ${yZZ}`);
        assert(xofs + x >= 0 && xofs + x < allW, `n ${n}: xofs ${xofs} + x ${x} !in range [0..${allW})`);
        assert(yZZ >= 0 && yZZ < fbL, `n ${n}: yZZ ${yZZ} !in range [0..${fbL})`);
        assert(nodes2D[xofs + x][yZZ] == UNMAPPED, `n ${n}: node[${xofs + x}][${yZZ}] already mapped to ${nodes2D[xofs + x][yZZ]}`);
        nodes2D[xofs + x][yZZ] = numpx;
    }
//center (vertical) spoke:
    for (let x = 0; x < centerW; ++x)
        for (let y = 0; y < centerL; ++y, ++numpx)
        {
            const xofs = ofs.center;
            const yZZ = (x & 1)? flip(y, centerL): y;
//debug(`y ${y}, xofs ${xofs}, x ${x}, yZZ ${yZZ}`);
            assert(xofs + x >= 0 && xofs + x < allW, `xofs ${xofs} + x ${x} !in range [0..${allW})`);
            assert(yZZ >= 0 && yZZ < centerL, `yZZ ${yZZ} !in range [0..${centerL})`);
            assert(nodes2D[xofs + x][yZZ] == UNMAPPED, `node[${xofs + x}][${yZZ}] already mapped to ${nodes2D[xofs + x][yZZ]}`);
            nodes2D[xofs + x][yZZ] = numpx;
        }
//left/right spokes:
    for (let n = 0; n < 2 * lrW * lrL; ++n, ++numpx)
    {
        const which2x = [0, 2, 1, 2, 1, 0];
        const [y, which] = [n % lrL, Math.floor(n / lrL)]; //RLRR'LL'
        const [xofs, x] = [(!which || (which & 2))? ofs.E: ofs.W, which2x[which]]; //flip(which, lrW)]: [ofs.W, which];
        const yZZ = (which == 3 || which == 5)? flip(y, lrL): y;
//debug(`n ${n}: y ${y}, which ${which}, xofs ${xofs}, x ${x}, yZZ ${yZZ}`);
        assert(xofs + x >= 0 && xofs + x < allW, `n ${n}: xofs ${xofs} + x ${x} !in range [0..${allW})`);
        assert(yZZ >= 0 && yZZ < lrL, `n ${n}: yZZ ${yZZ} !in range [0..${lrL})`);
        assert(nodes2D[xofs + x][yZZ] == UNMAPPED, `n ${n}: node[${xofs + x}][${yZZ}] already mapped to ${nodes2D[xofs + x][yZZ]}`);
        nodes2D[xofs + x][yZZ] = numpx;
    }
//diag spokes:
    for (let n = 0; n < 4 * diagW * diagL; ++n, ++numpx)
    {
        const [y, which] = [n % diagL, Math.floor(n / diagL)]; //NW,NW',SE,SE',NE,NE',SW,SW'
        const [xofs, x] = [[ofs.NW, ofs.SE, ofs.NE, ofs.SW][Math.floor(which / 2)], which & 1]; //flip(which, diagW) + 1: which];
        const yZZ = (which & 1)? flip(y, diagL): y;
//debug("n %d: x %d, xofs %d, y %d, yZZ %d, which %d", n, x, xofs, y, yZZ, which);
        assert(xofs + x >= 0 && xofs + x < allW, `n ${n}: xofs ${xofs} + x ${x} !in range [0..${allW})`);
        assert(yZZ >= 0 && yZZ < diagL, `n ${n}: yZZ ${yZZ} !in range [0..${diagL})`);
        assert(nodes2D[xofs + x][yZZ] == UNMAPPED, `n ${n}: node[${xofs + x}][${yZZ}] already mapped to ${nodes2D[xofs + x][yZZ]}`);
        nodes2D[xofs + x][yZZ] = numpx;
    }

    assert(numpx == centerW * centerL + 2 * fbW * fbL + 2 * lrW * lrL + 4 * diagW * diagL, `numpx ${numpx} != expected ${centerW * centerL + 2 * fbW * fbL + 2 * lrW * lrL + 4 * diagW * diagL}`); //check all nodes mapped
    assert(numpx == 298, `numpx ${numpx} != expected 292`); //check all nodes mapped
    return {numpx, nodes2D};
});
//star.csv();
//run();


//gift face:
const gift_face = model("gift-face: GIFT", () =>
{
    const {nodes2D, width: W, height: H} = grid(23, 36);
    let numpx = 0;
//R2LB2T2B ZZ
    for (let x = 0; x < W; ++x)
        for (let y = 0; y < H; ++y)
        {
            const xflip = W - x - 1;
            const yflip = (x & 1)? H - y - 1: y;
            nodes2D[xflip][yflip] = numpx++;
//if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
        }
    assert(numpx == 23 * 36); //check all nodes mapped
    return {numpx, nodes2D};
});
//gift_face.csv();

TODO("projection: make gift side extension of face and/or top ribbon (radial)?");
const gift_side = model("gift-side: GIFT", () =>
{
    const {nodes2D, width: W, height: H} = grid(5, gift_face.height);
    let numpx = 0;
//R2LT2B2T ZZ
    for (let x = 0; x < W; ++x)
        for (let y = 0; y < H; ++y)
        {
            const xflip = W - x - 1;
            const yflip = (x & 1)? H - y - 1: y;
            nodes2D[xflip][yflip] = numpx++;
//if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
        }
    assert(numpx == 5 * 36); //check all nodes mapped
    return {numpx, nodes2D};
});
const gift_top = model("gift-top: GIFT", () =>
{
    const {nodes2D, width: W, height: H} = grid(4 * 5, gift_face.height / 2);
    let numpx = 0;
    const virtpx = //virt px map to alternate px; NOTE: some map fwd, some map back
    {
        [[1, 0]]: [0, 0], [[1, 13]]: [0, 13], [[2, 0]]: [1, 0], [[2, 13]]: [1, 13], //first seg virt px
        [[3, 13]]: [4, 13], [[4, 0]]: [3, 0], [[5, 0]]: [4, 0], [[5, 13]]: [4, 13], //second seg
        [[6, 0]]: [7, 0], [[7, 13]]: [6, 13], [[8, 0]]: [7, 0], [[8, 13]]: [7, 13],
        [[10, 0]]: [9, 0], [[10, 13]]: [9, 13], [[11, 0]]: [10, 0], [[11, 13]]: [10, 13],
        [[12, 13]]: [13, 13], [[13, 0]]: [12, 0], [[14, 0]]: [13, 0], [[14, 13]]: [13, 13],
        [[15, 0]]: [16, 0], [[16, 13]]: [15, 13], [[17, 0]]: [16, 0], [[17, 13]]: [16, 13],
        [[18, 13]]: [19, 13], [[19, 0]]: [18, 0], [[20, 0]]: [19, 0], [[20, 13]]: [19, 13],
    };
//radial from center, ZZ
    const DIRECTION = {S: 1, W: 2, E: 3}; //, N: 4};
    for (let r = 0; r < H; ++r)
        for (const [key, val] of Object.entries(DIRECTION))
            for (let x = 0; x < 5; ++x)
            {
                const yflip = (x & 1)? H - r - 1: r;
                nodes2D[x + val * 5][yflip] = ([x + val * 5, yflip].toString() in virtpx)? "(adjacent)": numpx++;
//if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
            }
//    remap(nodes2D, virtpx);
    assert(numpx == 5 * 36 + 5 * 14, `numpx ${numpx} != ${5 * 36 + 5 * 14}`); //check all nodes mapped
    return {numpx, nodes2D};
});
//gift bow:
const gift_bow = model("gift-bow: GIFT", () =>
{
    const WHOOPS = 2; //ended up with a couple extra pixels on prop :(
    const {nodes2D, width, height: H} = grid(30 + 30 + 20 + WHOOPS, 5);
    const W = width - 2;
    let numpx = 0;
//L2R2LF2B ZZ
    for (let y = 0; y < H; ++y)
        for (let x = 0; x < W - 20; ++x)
        {
            const xflip = (y & 1)? flip(x, W): x; //W - x - 1;
            nodes2D[xflip][y] = numpx++;
        }
    for (let y = 0; y < H; ++y)
        for (let x = 0, xofs = W - 20; x < 20; ++x)
        {
            if (!x && y == 2) numpx += WHOOPS;
            const xflip = (y & 1)? flip(x, W): x; //W - x - 1;
            nodes2D[xflip][y] = numpx++;
        }
    assert(numpx == W * H + WHOOPS, `numpx ${numpx} != w ${W} * h ${H} + ${WHOOPS} = ${W * H + WHOOPS}`); //check all nodes mapped
    assert(numpx == 402, `numpx ${numpx} != 402`);
    return {numpx, nodes2D};
});
//gift_bow.csv();
//run();


//fence:
//wave width ~= 6.5 nodes
const fence = model("fence: YARD", () =>
{
    const {nodes2D, width: W, height: H} = grid(3 * 50, 1);
    let numpx = 0;
//L2R
    for (let x = 0; x < W; ++x)
        nodes2D[x][0] = numpx++;
    assert(numpx == W * H, `numpx ${numpx} != ${W * H}`); //check all nodes mapped
    assert(numpx == 150, `numpx ${numpx} != 150`);
    return {numpx, nodes2D};
});


//globe ornaments:
//replaces AngelBells, ArchFans
//NOTE: multiple grid px map to same physical LED (at top/bottom)
//TODO: model.clone() instead of repeating ctor?
const globes = Array.from({length: 4}).map((prop, inx) => model(`globes_${inx}: GLOBES`, () =>
{
    const {nodes2D, width: W, height: H} = grid(18, 14);
//    const virtpx = //virt px map to alternate px; NOTE: some map fwd, some map back
//    {
//        [[1, 0]]: [0, 0], [[1, 13]]: [0, 13], [[2, 0]]: [1, 0], [[2, 13]]: [1, 13], //first seg virt px
//        [[3, 13]]: [4, 13], [[4, 0]]: [3, 0], [[5, 0]]: [4, 0], [[5, 13]]: [4, 13], //second seg
//        [[6, 0]]: [7, 0], [[7, 13]]: [6, 13], [[8, 0]]: [7, 0], [[8, 13]]: [7, 13],
//        [[10, 0]]: [9, 0], [[10, 13]]: [9, 13], [[11, 0]]: [10, 0], [[11, 13]]: [10, 13],
//        [[12, 13]]: [13, 13], [[13, 0]]: [12, 0], [[14, 0]]: [13, 0], [[14, 13]]: [13, 13],
//        [[15, 0]]: [16, 0], [[16, 13]]: [15, 13], [[17, 0]]: [16, 0], [[17, 13]]: [16, 13],
//    };
//    const toppx = [0, 3, 6+1, 9, 12+1, 15]; //which colum#ns to grab extra px at top
//    const bottompx = [0, 3+1, 6, 9+1, 12, 15+1]; //which colum#ns to grab extra px at top
    const extrapx =
    {
        0: [0, 3+1, 6, 9+1, 12, 15+1], //colum#ns to grab extra px at top
        [H - 1]: [0, 3, 6+1, 9, 12+1, 15], //colum#ns to grab extra px at top
    };
//L2RT2B2T ZZ with repeating px @ top + bottom
    let numpx = 0;
    for (let x = 0; x < W; ++x)
    {
        const xgrp = x - x % 3;
//        if (toppx.includes(x))
//        {
//            const yflip = !(x & 1)? flip(0, H): 0;
//            nodes2D[xgrp + 0][yflip] = nodes2D[xgrp + 1][yflip] = nodes2D[xgrp + 2][yflip] = numpx++;
//        }
        for (let y = 0; y < H; ++y)
        {
            const yflip = !(x & 1)? flip(y, H): y;
            if (extrapx[yflip])
                if (!extrapx[yflip].includes(x)) continue; //don't assign top/bottom node yet
                else nodes2D[xgrp + 0][yflip] = nodes2D[xgrp + 1][yflip] = nodes2D[xgrp + 2][yflip] = numpx++;
            else nodes2D[x][yflip] = numpx++; //([x, yflip].toString() in virtpx)? "(adjacent)": numpx++;
//if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
        }
//debugger;
//        if (bottompx.includes(x))
//        {
//            const yflip = !(x & 1)? flip(H - 1, H): H - 1;
//            nodes2D[xgrp + 0][yflip] = nodes2D[xgrp + 1][yflip] = nodes2D[xgrp + 2][yflip] = numpx++;
//        }
    }
//    remap(nodes2D, virtpx);
    assert(numpx == 18 * 14 - 6 * 2 * 2, `numpx ${numpx} != ${18 * 14 - 6 * 2 * 2}`); //228); //check all nodes mapped
    return {numpx, nodes2D};
//    function xy(x, y) { return x * H + y; } //generate unique key for (x, y) pairs
}));
//const globes = Array.from({length: 4}).map((item) => globe.
//const dict = {[[1, 0]]: [0, 0], [[2, 0]]: [1, 0]}; debug(dict, [1, 2].toString()); process.exit();
//globes[0].csv();


/*
//map virt px (copies) to real px:
function remap(nodes2D, virtpx)
{
    for (const [duppx, [xreal, yreal]] of Object.entries(virtpx)) //go back and fill in placeholders now that real px# known
    {
        const [xvirt, yvirt] = duppx.split(",");
//if (!isdef(nodes2D[xvirt])) debug(xvirt, nodes2D.length);
//if (!isdef(nodes2D[xreal])) debug(xreal, nodes2D.length);
        debug("virt (%d, %d) <- real (%d, %d) = %'d, type %s, type %s", xvirt, yvirt, xreal, yreal, nodes2D[xreal][yreal], typeof nodes2D[xvirt], typeof nodes2D[xreal]);
        nodes2D[xvirt][yvirt] = nodes2D[xreal][yreal];
    }
}
*/


//RGB icicles:
//NOTE: spans ports; split into multiple segments; OTOH could be a single universe @ <= 22 FPS
const ic = model("ic_all: IC", () => //(x, y) =>
{
//    const W = (7 + (1) + 26) + 30 + (1) + 30 + (17 + (1) + 7) + (2) + 10 + (1) + 24, H = 10, NUMPX = 
    const COLTYPES = { REAL: 1, VIRT: 2, SEG: 1000};
    const coltypes = //151 real + 6 virt = 157 total cols = 1570 nodes
    [
        [+7, -1, +26], [+30], //garage left (2 segments)
//        [-1 -COLTYPES.SEG], //gap for timing/spacing, seg split
//        [+30], [+17, -1, +7], //garage right (2 segments)
//        [-2 -COLTYPES.SEG], //gap for timing/spacing, seg split
        [-1], //gap for timing/spacing
        [+30],
        [-1 -COLTYPES.SEG], //gap for timing/spacing, seg split
        [+17, -1, +7], //garage right (2 segments)
        [-2], //gap for timing/spacing
        [10, -1, +24], //porch
//        [-1 -COLTYPES.SEG], //flush seg
//        [-2], //gap
//        [30], //bay
    ].flat().map((w) => Array.from({length: Math.abs(w) % COLTYPES.SEG}).map((x) => (w > 0)? COLTYPES.REAL: (w > -COLTYPES.SEG)? COLTYPES.VIRT: COLTYPES.SEG)).flat();
//    const W = cols.length, H = 10, VIRTPX = W * H, REALPX = cols.filter((col) => col > 0).length * H;
    const retval = grid(coltypes.length, 10); //composite grid
//    coltypes.push(COLTYPES.SEG); //flush last seg
//	if ((x < 0) || (x >= W) || (y < 0) || (y >= H)) [xyofs, ic.W, ic.H] = [W * H, W, H]; //eof; give caller dimension info
//    else xyofs = x * H + h;
//    const retval = {};
//generate submodels from composite model (overlay nodes):
    const {nodes2D, nodes1D, width: totalW, height: H} = retval;
    retval.segments = [];
//    let totalpx = 0;
//    let want_newseg = true;
    function newseg(more)
    {
//        if (segs.top.numpx) segs.top.nodes2D = grid(segs.top.numpx / H, H);
//        if (more)
        if ((retval.segments.top || {}).numpx)
        {
            const seg = retval.segments.top;
            [seg.width, seg.height] = [seg.numpx / H, H];
            seg.nodes1D = shmslice(nodes1D, newseg.usedpx, newseg.usedpx + seg.numpx);
            seg.nodes2D = nodes2D.slice(newseg.usedpx / H, (newseg.usedpx + seg.numpx) / H);
            retval.segments.push(model(`ic_${retval.segments.length}: IC`, () => retval.segments.pop()));
            newseg.usedpx += seg.numpx;
        }
        nodes1D.fill(UNMAPPED); //reset mapping for next seg (reuses composite grid)
        if (more) retval.segments.push({numpx: 0}); //, width: totalW, height: H, nodes1D, nodes2D}); //: []});
        newseg.usedpx || (newseg.usedpx = 0);
    }
    newseg(true);
//    segs.push({startpx: totalpx});
//    segs.push({numpx: 0});
    for (const [x, coltype] of Object.entries(coltypes))
    {
        const xflip = flip(+x, totalW); //segs[segnum].numpx / H);
        if (coltype == COLTYPES.REAL) //segs.top.numpx += H;
//        {
            for (let y = 0; y < H; ++y)
                nodes2D[xflip][flip(y, H)] = retval.segments.top.numpx++; //totalpx++; //CAUTION: mapping only correct for submodels; compsite model !matters anyway
//            segs.top.nodes2D.push(nodes2D[xflip]);
//        }
        else if ((coltype == COLTYPES.SEG) && (coltypes[+x - 1] != COLTYPES.SEG)) newseg(true); //segs.push({startpx: totalpx}); //newseg(+x != coltypes.length - 1);
    }
    newseg(); //flush last seg; leave composite mapping empty (can't be used)
//    let usedpx = 0;
//    for (const seg of retval.segments) //trim nodes so node inx correct
//    {
//        seg.width = seg.numpx / H;
//        seg.nodes1D = shmslice(nodes1D, usedpx, usedpx + seg.numpx);
//        seg.nodes2D = nodes2D.slice(usedpx / H, (usedpx + seg.numpx) / H);
//        usedpx += seg.numpx;
//    }
//    const totalpx = retval.segments.reduce((total, seg) => total + seg.numpx, 0);
    const realpx = coltypes.filter((coltype) => (coltype == COLTYPES.REAL)).length * H;
//    assert(realpx == totalW * H, `totalpx ${totalpx} != w ${totalW} * h ${H} = ${totalW * H}`);
    assert(realpx == 151 * 10, `realpx ${realpx} != 1510`); //check all nodes mapped
//CAUTION: can't do I/O across ports; use composite model for node data only, not I/O!
    return retval;
}); //.split(2);
//composite update:
//ic.out = function(force) { for (const seg of this.segments) seg.out(force); }
//const x = 5, y = -5, M = 3, N = -3; debug(x % M, x % N, y % M, y % N); process.exit();
//ic.nodes2D = ic.nodes1D = ic.hwmap = null; debug(ic); process.exit();
//ic.segments[0].csv();
//ic.segments[1].csv();
//ic.csv();
//run();
//debugger;

//dummy model test for grid/hwmap:
const tinygrid = model("tiny: DEV", () =>
{
    const SQSIZE = 4;
    const {nodes2D, width: W, height: H} = grid(SQSIZE * 2, SQSIZE / 2); //hacked panel
    let numpx = 0;
//left: ZZ L2RB2T, right: ZZ R2LT2B
    for (let y = 0; y < H * 2; ++y) //half height
        for (let x = 0; x < W / 2; ++x) //double width
        {
            const xofs = (y < H)? 0: W / 2; //left vs. right half
            const xnew = (((y & 1) ^ (y < H))? x: W / 2 - x - 1) + xofs; //horiz ZZ; top half reversed
            const ynew = (y < H)? y: 2 * H - y - 1;
//            nodes2D[ynew][xnew] = numpx++;
            nodes2D[xnew][ynew] = numpx++; //=> outnodes[pxnum]
//debug(`(${x}/${W / 2}, ${y}/${H * 2}) => (${xnew}, ${ynew}):`, nodes2D[xnew][ynew]);
        }
    assert(numpx == SQSIZE ** 2); //check all nodes mapped
    return {numpx, nodes2D};
});
//tinygrid.dump("", "%'d, "); process.exit();


//small dev/test panel (16x16 hacked):
//2x16x8: L2RB2T left, R2LT2B right
//32x8 in memory: [col 0: 8 rows B2T], [col 1: 8 rows B2T], [col 2: 8 rows B2T], ..., [col 31: 8 rows B2T]
const devpanel = model("dev panel: DEV", () => //(x, y) =>
{
    const SQSIZE = 16;
    const {nodes2D, width: W, height: H} = grid(SQSIZE * 2, SQSIZE / 2); //hacked panel
    let numpx = 0;
//left: ZZ L2RB2T, right: ZZ R2LT2B
    for (let y = 0; y < H * 2; ++y) //half height
        for (let x = 0; x < W / 2; ++x) //double width
        {
            const xofs = (y < H)? 0: W / 2; //left vs. right half
            const xnew = (((y & 1) ^ (y < H))? x: W / 2 - x - 1) + xofs; //horiz ZZ; top half reversed
            const ynew = (y < H)? y: 2 * H - y - 1;
//            nodes2D[ynew][xnew] = numpx++;
            nodes2D[xnew][ynew] = numpx++; //=> outnodes[pxnum]
//if (!y || !x || (y == H * 2 - 1) || (x == W / 2 - 1)) debug(`(${x}/${W / 2}, ${y}/${H * 2}) => (${xnew}, ${ynew}):`, nodes2D[xnew][ynew]); //debug edges
        }
    assert(numpx == SQSIZE ** 2); //check all nodes mapped
//submodel test:
    const [subW, subH] = [4, 2], partW = Math.floor(subW / 3);
TODO("fix this");
    const retval =
    [
//        {/*numpx: 0,*/ nodes2D}, //composite model, no nodes assigned
        {/*numpx: partW * subH,*/ nodes2D: nodes2D.slice(3, 3 + partW).map((col) => shmslice(col, 3, 3 + subH))}, //left seg
        {/*numpx: partW * subH,*/ nodes2D: nodes2D.slice(10, 10 + partW).map((col) => shmslice(col, 5, 5 + subH))}, //middle seg
        {/*numpx: (subW - 2 * partW) * subH,*/ nodes2D: nodes2D.slice(20, 20 + subW - 2 * partW).map((col) => shmslice(col, 1, 1 + subH))}, //right seg
    ];
    return {numpx, nodes2D};
});
//TODO("dev vix2");
module.exports.models.devpanel = devpanel;
//submodels for legacy Vixen2 seq:
//devpanel.branches = Array.from({length: 24}, (_, inx) =>
//{
//    fill: (color) => mtree.nodes2D[inx].fill(color),
//    out: () => mtree.dirty = true,
//}); //.reduce((lkup, branch) => (lkup['


function OLD_xy_panel_dev(x, y)
{
	const W = 32, H = 8, VIRTPX = W * H, REALPX = W * H;
//    const col = x % 32;
//    return (col < 16)? col + y * 32: 240 + col - y * 32;
	var xyofs;
	if ((x < 0) || (x >= W) || (y < 0) || (y >= H)) xyofs = {W, H, VIRTPX, REALPX}; //devpanel.VIRTPX || Object.assign(devpanel, {W, H, VIRTPX, REALPX}).VIRTPX; //eof; give caller dimension info
	else if (x < W/2) //left
	{
		xyofs = W * (y >> 1); //top left of 16x2 block
		xyofs += (y & 1)? W-1 - x: x;
	}
	else //right
	{
		xyofs = W * H - W * (y >> 1); //bottom right of 16x2 block
		xyofs += (y & 1)? -x - 1: x - W;
	}
//	console.log("(%d, %d) => '%d", x, y, which);
//	which += NULLPX; //skip null pixel(s)
	return xyofs;
}


//mini dev/test panel:
//submodel test
if (false)
    /*const minidev =*/ model("mini dev: DEV", () =>
{
//    const container = slice2D(devpanel.nodes2D);
//    const {nodes2D, width: totalW, height: H} = grid(4, 2); //grid(7, 3);
    const nodes2D = devpanel.nodes2D;
    const [totalW, H] = [4, 2], W = Math.floor(totalW / 3);
TODO("fix this");
    const retval =
    [
//        {/*numpx: 0,*/ nodes2D}, //composite model, no nodes assigned
        {/*numpx: W * H,*/ nodes2D: nodes2D.slice(3, 3 + W).map((col) => shmslice(col, 3, 3 + H))}, //left seg
        {/*numpx: W * H,*/ nodes2D: nodes2D.slice(10, 10 + W).map((col) => shmslice(col, 5, 5 + H))}, //middle seg
        {/*numpx: (totalW - 2 * W) * H,*/ nodes2D: nodes2D.slice(20, 20 + totalW - 2 * W).map((col) => shmslice(col, 1, 1 + H))}, //right seg
    ];
//    assert(numpx == W * H); //all nodes mapped
    return retval;
});
//const minidev = model("mini dev: DEV", () => ({numpx: 4, nodes2D: grid(2, 2)}));


//lab gift panel:
//16x16: B2TR2L
const labgiftpanel = model("lab gift panel: LAB", () => //(x, y) =>
{
    const {nodes2D, width: W, height: H} = grid(16, 16);
    let numpx = 0;
//ZZ R2LB2T
    for (let x = 0; x < W; ++x)
        for (let y = 0; y < H; ++y)
            nodes2D[W - x - 1][(x & 1)? H - y - 1: y] = numpx++;
    return {numpx, nodes2D};
});
function OLD_xy_gifr_lab(x, y)
{
	const W = 16, H = 16;
	if ((x < 0) || (x >= W) || (y < 0) || (y >= H)) return W * H + NULLPX; //eof
	var which = W * H - 2 * H * (x >> 1);
	which += (x & 1)? -H-1 - y: y - H;
//	console.log("(%d, %d) => '%d", x, y, which);
	which += NULLPX; //skip null pixel(s)
	return which;
}

//gdoor (RIP):
//2x24x16: L2RB2T right, R2LT2B left
function OLD_xy_gdoor(x, y)
{
//	if (ISDEV) return xy_smpanel(Math.floor(x * 32/48), 8-1 - Math.floor(y * 8/16));
//	if (ISDEV) return (y < 8)? xy_smpanel(x, 8-1 - y): xy_smpanel(x + 16, 16-1 - y);
	const W = 48, H = 16;
//    const NUMPX = 2 * W2 * H;
	var which;
	if ((x < 0) || (x >= W) || (y < 0) || (y >= H)) which = W * H; //eof
	else if (x < W/2) //left
	{
		which = W * H - W * (y >> 1);
		which += (y & 1)? -W/2-1 - x: x - W/2;
	}
	else //if (x < W) //right
	{
		which = W/2 * H - W * (y >> 1);
		which += (y & 1)? -W + x - W/2: W/2-1 - x;
	}
//	console.log("(%d, %d) => '%d", x, y, which);
	which += NULLPX; //skip null pixel(s)
	return which;
}


//null pixels:
function nullpx(count)
{
    return model(`null px[${count}]: NULLPX`, () => mapall(grid(count)));
}


//create 2D grid:
//pre-populate with unmapped node#s
//also generate 1D version
//NOTE: favors columns over rows (inner dim = y, outer dim = x)
function grid(w, h)
{
//TODO("use C++ + pad to cache len?");
    const CACHELEN = 64; //RPi 2/3 reportedly have 32/64 byte cache rows; use larger size to accomodate both
    const width = w || 1, height = h || 1;
    const ARYTYPE = Uint32Array; //Int32Array; //there's a comment on stackoverflow.com that V8 vars can be int32, double, pointer, but uint32 will be converted to slower double.  doesn't seem to be true according to https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays ??
    const wanted_size = width * height * ARYTYPE.BYTES_PER_ELEMENT; //bytes
    const buf = new SharedArrayBuffer(Math.ceil(wanted_size / CACHELEN) * CACHELEN); //allow sharing between worker threads; pad to minimize cache contention across threads
    const nodes1D = new ARYTYPE(buf, 0, width * height).fill(UNMAPPED); //linear access; NOTE: #elements, not bytes; explictly set length in case buf was padded
//CAUTION: x + y are swapped; layout favors columns over rows; caller can swap if desired
//    const nodes2D = Array.from({length: height}, (row, y) => nodes.slice(y * width, (y + 1) * width).fill(-1));
//slice breaks shm link!    const nodes2D = Array.from({length: width}, (col, x) => nodes1D.slice(x * height, (x + 1) * height).fill(UNMAPPED)); //convenience wrapper for 2D addressing
    const nodes2D = Object.freeze(Array.from({length: width}, (col, x) => shmslice(nodes1D, x * height, (x + 1) * height))); //new Uint32Array(buf, x * height * Uint32Array.BYTES_PER_ELEMENT, height)); //convenience wrapper for 2D addressing; CAUTION: don't use nodes.slice(); freeze: prevent 2D ary sttr from being damaged
//debug(nodes2D);
    return {nodes2D, width, height, nodes1D, numpx: 0}; //numpx: no phys nodes assigned yet
}
//test shm btwn ary + slice:
//const buf = new SharedArrayBuffer(20);
//debug(buf[0], buf[1], buf[2], buf[3], buf[4], buf[5], buf[6], buf[7], buf[8], buf[9], buf[10], buf[11]);
//const i32ary = new Int32Array(buf, 0*4, 4); //16 bytes; CAUTION: ofs in bytes, length in elements
//debug(i32ary);
//const ary2D = Array.from({length: 2}, (col, x) => i32ary.slice(x * 2, (x + 1) * 2).fill(10 + x)); //0..2, 2..4
//debug(/*buf,*/ i32ary, ary2D);
//const aa2D = Array.from({length: 2}, (col, x) => new Int32Array(buf, x * 2*4, 2).fill(20 + x)); //0..2, 2..4
//debug(/*buf,*/ i32ary, ary2D, aa2D);
//i32ary[2] = 5678; debug(/*buf,*/ i32ary, ary2D, aa2D);
//ary2D[1][1] = 1234; debug(/*buf,*/ i32ary, ary2D, aa2D);
//aa2D[1][1] = 6789; debug(/*buf,*/ i32ary, ary2D, aa2D);
//buf[0] = buf[1] = 1; debug(/*buf,*/ i32ary, ary2D, aa2D);
//process.exit();


//slice() for TypedArray:
//regular .slice() doesn't preserve shm link, so a new TypedArray must be created instead
function shmslice(shmary, from, to)
{
    assert(shmary instanceof Uint32Array || shmary instanceof Int32Array); //other types !implemented
    const ARYTYPE = (shmary instanceof Uint32Array)? Uint32Array: Int32Array;
    return new ARYTYPE(shmary.buffer, (from || 0) * ARYTYPE.BYTES_PER_ELEMENT, (to || shmary.buffer.byteLength / ARYTYPE.BYTES_PER_ELEMENT) - (from || 0)); //CAUTION: byte ofs vs. element length
}


//map all nodes in grid:
function mapall(grid)
{
    const numpx = grid.numpx = grid.nodes1D.length;
    for (let n = 0; n < numpx; ++n) grid.nodes1D[n] = n;
    return grid;
}


/////////////////////////////////////////////////////////////////////////////////
////
/// controller/layout
//

//restrictions:
//hres even
//hres = multiple of 16?
//hres + 1 = multiple of 3
//4x*3x/72=univlen  => x = sqrt(72 * ulen/12)
//16n, 3n - 1
//hres:vres ~= 4:3 or other RPi aspect ratio (not sure how this is used)
//(hres + hpad) * vres / 72 determines max univ len + fps
if (false)
{
const choices = [];
for (let hres = 240; hres < 2000; hres += 16)
{
    if ((hres + 1) % 3) continue;
    const vres = hres * 0.75; //4:3
    const univlen = (hres + 1) * vres / (3 * 24);
    const fps = Math.round(10 * 1e3 / (univlen * 0.03)) / 10;
    choices.push({hres, vres, univlen, fps});
}
debug(choices); process.exit();
}

//30 FPS (1080 univ len):
const WANT_TIMING = {1: "320 0 0 1 0  240 0 3 3 3  0 0 0  30 0 2400000 1"}; //simulate/override dpi_timings in RPi config.txt
//20 FPS (1600 univ len):
//BAD: (!mult 16): const WANT_TIMING = {1: "392 0 0 1 0  294 0 2 2 2  0 0 0  30 0 2400000 1"}; //simulate/override dpi_timings in RPi config.txt
//18 FPS (1800 univ len):
//const WANT_TIMING = {1: "416 0 0 1 0  312 0 2 2 2  0 0 0  20 0 2400000 1"}; //simulate/override dpi_timings in RPi config.txt


/* RPi DPI24 pinout
refs:
https://www.raspberrypi.org/documentation/hardware/raspberrypi/dpi/README.md
https://pinout.xyz/
http://www.mosaic-industries.com/embedded-systems/microcontroller-projects/raspberry-pi/gpio-pin-electrical-specifications

GW * dpi      func    header   func   dpi * GW
              3.3V     1  2     5V
(gw)pu(VSYNC) GPIO2    3  4     5V
(gw)pu(HSYNC) GPIO3    5  6     0V
(gw)!f B0     GPIO4    7  8   GPIO14  G2 !f GW
                0V     9 10   GPIO15  G3 !f GW
(gw)!f G5    GPIO17   11 12   GPIO18  G6 !f GW
GW !f R7     GPIO27   13 14     0V
GW !f R2     GPIO22   15 16   GPIO23  R3 !f GW
              3.3V    17 18   GPIO24  R4 !f (gw)
GW !f B6     GPIO10   19 20     0V
GW !f B5      GPIO9   21 22   GPIO25  R5 !f (gw)
GW !f B7     GPIO11   23 24    GPIO8  B4:(fl)GW
                0V    25 26    GPIO7  B3:FL (gw)
--    (CLK)   GPIO0   27 28    GPIO1 (EN)    --
(gw)FL:B1     GPIO5   29 30     0V
GW FL:B2      GPIO6   31 32   GPIO12  G0:fl  GW
GW FL:G1     GPIO13   33 34     0V
GW fl:G7     GPIO19   35 36   GPIO16  G4:fl  GW
-- FL:R6     GPIO26   37 38   GPIO20  R0:fl? (gw)
                0V    39 40   GPIO21  R1 !f  GW
* flicker:    5 6 7 8         12 13       16       19 20                26   
* !flicker: 4         9 10 11       14 15    17 18       21 22 23 24 25    27
pu = pull-ups
GW = Gowhoops break-out board
YALP ctlr break-out: TOP= 3(R3) 2(R2) 22(B6) 10(G2) 21(B5) 7(R7) 11(G3) 14(G6) 18(B2) 8(G0) 1(R1) 12(G4) 15(G7) 9(G1) 20(B4) 23(B7) =BOTTOM
todo: 0(R0), 4(R4), 5(R5), 6(R6), 13(G5), 16(B0), 17(B1), 19(B3)
*/


const DEVPANEL = 1;

const TREE = 3;
const GIFT = 2;
const FENCE = 22;
const SHEP24 = 10;
const K1 = 21;
const ANGEL = 7;
const LHCOL = 11;
const SHEP3 = 14;
const IC2 = 18;
const MJB = 8;
const SHEP1 = 1;
const K23 = 12;
const BOW = 15;
const IC1 = 9;
const STAR = 20;
const GLOBES = 23;

//const SHEP1 = 4; //xx
//const SHEP4 = 6; //??
//const K2 = 16; //??xx
//const K3 = 17; //??xx

const need_swap = {[GIFT]: 1, [FENCE]: 1, [SHEP1]: 1, [SHEP24]: 1, [SHEP3]: 1, [IC1]: 1, [IC2]: 1, [BOW]: 1, [ANGEL]: 1, [LHCOL]: 1}; //0, 2, 9, 15, 18];
TODO("fix these");


const ports = `
//red pins 0-7 = ports 0-7:
    R0,R1,R2,R3,R4,R5,R6,R7,
//green pins 0-7 = ports 8-15:
    G0,G1,G2,G3,G4,G5,G6,G7,
//blue pins 0-7 = ports 16-23:
    B0,B1,B2,B3,B4,B5,B6,B7,
//aliases:
    TREE = 3,
    GIFT = 2,
    FENCE = 22,
    SHEP24 = 10,
    K1 = 21,
    ANGEL = 7,
    LHCOL = 11,
    SHEP3 = 14,
    IC2 = 18,
    MJB = 8,
    SHEP1 = 1,
    K23 = 12,
    BOW = 15,
    IC1 = 9,
    STAR = 20,
    GLOBES = 23,
//    MTREE=R3,
//    GIFT_FACE=R2,
//    GIFT_TOP=B6,
//    GLOBES=G2,
//    IC1=B5, IC2=R7,
    DEVPORT=R1,
//TODO? ALL=??,
        `.replace(/\/\/[^\n]*/g, "") //strip comments
        .replace(/^\s+|\s+$/g, "") //strip leading/trailing whitespace
        .split(/\s*,\s*/)
        .filter((name) => name) //drop blank entries
        .reduce((retval, name, inx, _, alias) => (alias = name.split(/\s*=\s*/), /*debug(name, alias, Object.entries(retval)),*/ retval[alias[0]] = isdef(alias[1])? (isNaN(alias[1])? retval[alias[1]]: +alias[1]): inx, retval), strict_obj()); //convert ary to dict + expand aliases
//ports.ALL = -1; //special handling
//const DEVPORT = ports.R0; //ports./*ALL*/ R0
//debug(Object.entries(ports));


TODO("NOTE: bullets are always WS2811 (no rgswap)");
TODO("set max br in prop, use full br in fx");
//assign controller ports/nodes to models:
const layout =
[
//    {model: nullpx(1), port: ports.R0},
//dev props:
//    {model: minidev, port: [ports.IC1, ports.IC2, ports.IC3]},
    {model: devpanel, port: ports.DEVPORT, RGSWAP}, //TODO: allow connect to any port?
//show props:
//    {model: ic, port: [ports.IC1, ports.IC2, ports.IC3]},
    {model: mtree, port: ports.TREE}, //ports.MTREE},
    {model: gift_face, port: ports.GIFT, RGSWAP},
    {model: gift_side, port: ports.GIFT, RGSWAP},
    {model: gift_bow, port: ports.BOW, RGSWAP},
    {model: gift_top, port: ports.BOW, RGSWAP},
    {model: nullpx(1), port: ports.GLOBES},
    {model: globes[0], port: ports.GLOBES},
//    {model: globes[1], port: GLOBES}, //ports.GLOBES},
//    {model: globes[2], port: GLOBES}, //ports.GLOBES},
//    {model: globes[3], port: GLOBES}, //ports.GLOBES},
    {model: ic.segments[0], port: ports.IC1, RGSWAP},
    {model: ic.segments[1], port: ports.IC2, RGSWAP},
//    {model: cols, port: ports.COLS, RGSWAP},
    {model: angel, port: ports.ANGEL, RGSWAP},
//    {model: shep[0], port: ports.SHEP1, RGSWAP},
//    {model: shep[1], port: ports.SHEP24, RGSWAP},
//    {model: shep[2], port: ports.SHEP3, RGSWAP},
////    {model: shep[3], port: ports.SHEP24, RGSWAP},
    {model: nullpx(1), port: ports.STAR},
    {model: star, port: ports.STAR},
    {model: nullpx(1), port: ports.FENCE},
    {model: fence, port: ports.FENCE, RGSWAP: GBR2RGB},
//    {model: ic.segments[2], port: ports.IC3},
];
const used_ports = layout
    .map((prop) => prop.port) //get port#s
    .flat() //expand arrays for models than span ports
    .filter(dedup) //(port, inx, all) => all.indexOf(port) == inx) //remove dups
    .map((port) => Object.keys(ports)[Object.values(ports).indexOf(port)]); //get primary (first) name for port
debug("used ports", used_ports);


//const grid32x8 = new grid(32, 8, xy_2x16x8); //, xylyt);
//grid32x8.show();
//xydump(xy_2x16x8)
//process.exit();
//function xydump(xylyt)
//{
//    xylyt();
//    const nodes = [...Array(w * h).keys()]; //https://stackoverflow.com/questions/3746725/how-to-create-an-array-containing-1-n
//    for (let y = 0; y < h; ++y)
//        this.nodes.push(nodes.slice(w * y, w * y + w));
//}
/*
function grid(w, h, xylyt)
{
    if (!this instanceof grid) return new grid(w, h, xylyt);
    [this.w, this.h, this.nodes] = [w, h, []];
    const nodes = [...Array(w * h).keys()]; //https://stackoverflow.com/questions/3746725/how-to-create-an-array-containing-1-n
    for (let y = 0; y < h; ++y)
//    {
//        const row = [];
//        for (let x = 0; x < w; ++x) row.push(0);
        this.nodes.push(nodes.slice(w * y, w * y + w));
//    }
//    return retval;
    this.show = function()
    {
        for (let y = this.h; y > 0; --y)
            console.log(`row[${y - 1}/${this.h}]:`, ...this.nodes[y - 1]);
    }
}
*/


//model base class:
//defines virtual 2D grid of nodes
//uses function-style ctor
//ctlr h/w is optionally assigned + mapped later
//recursive for models spanning ports
//keeps list of all models for enum purposes
function model(name, xymapper, depth)
{
    if (!(this instanceof model)) return new model(name, xymapper, 1);
//    {nodes2D: this.nodes2D, nodes: this.nodes, numpx: this.numpx} = xymap(); //nodes, realpx};
    this.name = name; //put this one first for easier debug (might overwrite later)
//    Object.assign(this, xymapper()); //{numpx, nodes2D};
//debug(typeof xymapper);
//    const segs = xymapper(); //TODO: drop segs; make custom
//debug(typeof segs); //, srcline(+2));
//debug(Array.isArray(segs));
//debug(segs);
//debug(segs.constructor.name);
    Object.assign(this, xymapper()); //Array.isArray(segs)? segs.shift(): segs); //{numpx, nodes2D or nodes1D, maybe custom members};
//debug(this.nodes2D);
//give xymapper as much flexibility as possible; reconstruct missing data from provided data
    assert((isdef(this.nodes1D) && (isdef(this.height) || isdef(this.width))) || isdef(this.nodes2D)); //can reconstruct from other data
    if (!isdef(this.nodes2D)) //prefered over nodes1D + width + height (fewer data items)
    {
//        assert(isdef(this.nodes1D) && (isdef(this.width) || isdef(this.height)));
        if (!isdef(this.width)) this.width = Math.floor(this.nodes1D.length / this.height);
        if (!isdef(this.height)) this.height = Math.floor(this.nodes1D.length / this.width);
        this.nodes2D = Array.from({length: this.width}, (col, x) => shmslice(this.nodes1D, x * this.height, (x + 1) * this.height)); //new Uint32Array(buf, x * height * Uint32Array.BYTES_PER_ELEMENT, height)); //convenience wrapper for 2D addressing; CAUTION: don't use nodes.slice()
    }
    if (!isdef(this.numpx)) this.numpx = 0; //no nodes mapped
    if (!isdef(this.width)) this.width = this.nodes2D.length;
    if (!isdef(this.height)) this.height = this.nodes2D[0].length;
    if (!isdef(this.nodes1D)) this.nodes1D = shmslice(this.nodes2D[0], 0, this.width * this.height); //new Uint32Array(this.nodes2D[0].buffer, 0, this.width * this.height);
    this.hwmap = new Uint32Array(this.nodes1D); //JSON.parse(JSON.stringify(this.nodes1D)); //clone node map < caller overwrites with node data; CAUTION: must alloc memory here; don't share mem with this.nodes; CAUTION: must be uint32 to match typeof UNMAPPED
//    if (this.width > 1)
//debug("here1");
    for (let y = 0; y < this.height; y += Math.max(this.height - 1, 1))
    {
        const x = 0, /*y = 0,*/ ofs = x * this.height + y;
//debug(x, y, ofs, this.height);
        const VERIFY = uint32(0x12345678), VERIFY2 = uint32(((VERIFY >> 16) & 0xFFFF) | (VERIFY << 16));
        this.nodes2D[x][y] = VERIFY;
        assert(this.nodes1D[ofs] == VERIFY, `nodes1D[${ofs}] !mapped to nodes2D[${x}][${y}]? ${hex(this.nodes1D[ofs])}`);
        this.nodes1D[ofs] = VERIFY2;
        assert(this.nodes2D[x][y] == VERIFY2, `nodes2D[${x}][${y}] !mapped to nodes1D[${ofs}]? ${hex(this.nodes2D[x][y])}`);
    }
//debug("here2");
//NOTE: hwmap.length depends on virtual grid w/h, not numpx; could be <> numpx
    assert(this.hwmap.length == this.width * this.height);
    for (let n = 0; n < this.hwmap.length; ++n)
    {
//        if (n >= this.hwmap.length) throw `undef node ${n} in hwmap 0..${this.hwmap.length - 1}`;
        if (this.hwmap[n] == UNMAPPED) continue;
//        if (n >= this.hwmap.length) debug(`${this.name}: ${n} !in hwmap[0..${this.hwmap.length})?!`.brightRed);
        if (this.hwmap[n] < 0 || this.hwmap[n] >= this.numpx) throw `${name}: hwmap[${n}/${this.hwmap.length}] ${this.hwmap[n]} from nodes[x ${Math.floor(n / this.height)}, y ${n % this.height}] !in range [0..${this.numpx})`.brightRed;
    }
    Object.freeze(this.nodes2D); //prevent 2D sttr from being damaged
//debug(typeof this.hwmap, (this.hwmap.constructor || {}).name, !!this.hwmap.join, this.hwmap.length, Array.isArray(this.hwmap), this.hwmap);
//debug("nodes2D len", this.nodes2D.length, this.nodes2D.flat().length);
//debug("xymap len", this.xymap.length, this.xymap.flat().length);
//    const H = this.height = this.nodes2D.length;
//    const W = this.width = this.nodes2D[0].length;
//debug(typeof this.nodes2D, this.nodes2D.constructor.name);
//debug(typeof this.nodes2D[0], (this.nodes2D[0] || "huh?").constructor.name, this.nodes2D[0]);
//    const [W, H] = [this.width, this.height]; //= [this.nodes2D.length, this.nodes2D[0].length]; //[this.width, this.height];
if (!module.parent)
debug(`creating model '${name}', ${commas(this.width)}x${commas(this.height)} (${commas(this.width * this.height)}) virt nodes, ${commas(this.numpx)} real`); //segs? ${Array.isArray(segs)? segs.length: "no"},
//    assert(H == this.nodes2D.length, `height mismatch: got ${this.nodes2D.length}, expected ${H}`.brightRed);
//    assert(W == this.nodes2D[0].length, `width mismatch: got ${this.nodes2D[0].length} expected ${W}`.brightRed);
    const tags = name.split(/\s*:\s*/);
//debug("name, tags", tags);
    this.name = tags.shift();
    this.srcline = srcline(+1);
//make rect for submodel (sticky attrs):
    this.mkrect = function(myrect) //{x, y, w, h})
    {
        return this.mkrect.prev = Object.assign({},
            this.mkrect.prev || ({x: 0, y: 0, get w() { return this.width - this.x; }, get h() { return this.height - this.y; }}),
            myrect || {});
    }
    this.fill = function(color, rect)
    {
        if (rect)
        {
            for (let x = 0, xofs = +rect.x || 0; x < (+rect.w || 1); ++x)
                for (let y = 0, yofs = +rect.y || 0; y < (+rect.h || 1); ++y)
                {
                    this.nodes2D[xofs + x][yofs + y] = color || BLACK;
//                    assert(limit < 2e3, `bad loop? ${typeof (xofs + x)} ${typeof (yofs + y)} x ${x} y ${y}`);
                }
        }
        else this.nodes1D.fill(color || BLACK); //for (const col of this.nodes2D) col.fill(color || BLACK);
        this.dirty = true;
    }
//    this.split = function(nparts) { const retval = []; } //too complex; needs to be done manually
    this.out = function(force)
    {
        if (!this.dirty && !force) return;
const want_debug = this.debug; //false; //(this.iocount++ || (this.iocount = 1)) < 5;
if (want_debug) if (!isNaN(want_debug)) --this.debug; else this.debug = false; //turn off for next time
        assert(isdef(this.port) && isdef(this.firstpx) && this.ctlr, "can't output to non-layout model");
//debug(this.name, this.numpx, this.width, this.height, port, first);
if (want_debug) debug("'%s' out: dirty? %d, force? %d, copying %'d nodes of %'dx%'d grid to port %d, stofs %'d", this.name, +!!this.dirty, +!!force, this.numpx, this.width, this.height, this.port, this.firstpx);
        const outnodes = this.ctlr.wsnodes[this.port]; //shmslice(ctlr.wsnodes[port], first, first + numpx); //ctlr.wsnodes[port].slice(first, first + numpx); //CAUTION: do not slice? //CAUTION: [0] includes all nodes
//                for (let y = 0; y < this.height; ++y)
//                    for (let x = 0; x < this.width; ++x)
//                        if (this.hwmap[x][y] != UNMAPPED) outnodes[this.hwmap[x][y]] = this.nodes2D[x][y];
        const output = [];
        const label = "";
        const outfile = this.want_dump && /*name2file*/(`${label || `${this.name}`}-output.csv`);
        while (this.want_dump) //&& !this.outary) //dummy loop for flow control
        {
            assert(this.hwmap, `${this.name || "UNNAMED"}: !hwmap?! ${Object.keys(this).join(", ")}`.brightRed);
            for (let n = 0; n < this.hwmap.length; ++n)
            {
//                assert(n < this.hwmap.length, `${this.name}: ${n} !in hwmap[0..${this.hwmap.length})?!`.brightRed);
                if (this.hwmap[n] == UNMAPPED) continue;
                assert(this.firstpx + this.hwmap[n] >= 0 && this.firstpx + this.hwmap[n] < outnodes.length, `${this.name}: ${this.firstpx} + ${this.hwmap[n]} out of range [0..${outnodes.length})`.brightRed);
            }
            if (this.outary) break;
            const outmap = {};
//                        outrow[-1] = `"${this.width}x${this.height}:${this.numpx}"`;
            for (let x = 0; x < this.width; ++x)
                for (let y = 0; y < this.height; ++y)
                {
                    const hwofs = this.hwmap[x * this.height  + y];
                    if (hwofs == UNMAPPED) continue;
//                                if (!outrow.hasOwnProperty(hwofs.toString()]) outrow[hwofs] = [];
                    (outmap[hwofs] || (outmap[hwofs] = [])).push({x, y}); //`[${x}, ${y}]`);
                }
            this.outary = Object.entries(outmap).sort(([lkey], [rkey]) => lkey - rkey).map(([key, val]) => [+key, val]); //force hwofs (key) to be numeric; index lookup in typed array fails otherwise :(
debugger;
//                    output.push(`"${this.width} x ${this.height}",${Object.keys(this.nodes2D).map((inx) => `"[${inx}][*]"`).join(",")}\n`);
            assert(this.outary.length == this.numpx, `${this.outary.length} vs ${this.numpx}`);
            if (fs.existsSync(outfile)) break; //header already written
//                        output.push(`"${this.width} x ${this.height}: ${this.numpx}",` + this.outary.map(([hwofs, xylist]) => `"${hwofs}: ${xylist.map(({x, y}) => `[${x}, ${y}]`).join(", ")}"`).join(",") + "\n");
            output.push(`"${this.width} x ${this.height}: ${this.numpx}",` + this.outary.map(([hwofs, xylist]) => `"[${hwofs}]:"`).join(",") + "\n");
            output.push(`"mapped from:",` + this.outary.map(([hwofs, xylist]) => `"${xylist.map(({x, y}) => `[${x}, ${y}]`).join(", ")}"`).join(",") + "\n");
            output.push(`"undermap",` + this.outary.map(([hwofs, xylist]) => `"${xylist.map(({x, y}) => hex(outnodes[hwofs])).join(", ")}"`).join(",") + "\n");
            output.push(`"initial",` + this.outary.map(([hwofs, xylist]) => `"${xylist.map(({x, y}) => hex(this.nodes2D[x, y])).join(", ")}"`).join(",") + "\n");
//                    output.push("\n");
//                    outfile.end();
//        outfile.close();
//        debug("wrote %'d lines to '%s'", outfile.numwrites, outfile.name);
//                    await outfile.wait4close();
            break;
        }
        const svnodes = this.want_dump && outnodes.slice(this.firstpx, this.firstpx + this.numpx); //Array.from(outnodes); //NOTE: creates new ary, not ref
        if (this.want_dump) { assert(++svnodes[0] != outnodes[this.firstpx]); --svnodes[0]; }
//if (this.want_dump) debug("before2", /*typename(outnodes),*/ hex(outnodes[this.firstpx]), hex(outnodes[this.firstpx + 1]), hex(outnodes[this.firstpx + 2]), hex(outnodes[this.firstpx + 3]), hex(outnodes[this.firstpx + 4]), hex(outnodes[this.firstpx + 5]), hex(outnodes[this.firstpx + 6]), hex(outnodes[this.firstpx + 7]), hex(outnodes[this.firstpx + 8]), hex(outnodes[this.firstpx + 9]), hex(outnodes[this.firstpx + 10]), hex(outnodes[this.firstpx + 11]));
//if (this.want_dump) debug("before1", typename(svnodes), svnodes);
//NOTE: use Array.from() to force array clone; else typed array slice forces formatted string back to number
//if (this.want_dump) debug("before", /*typename(svnodes.map((x) => x)),*/ Array.from(svnodes).map((color) => hex(color)));
//if (this.want_dump) debug("updates2", hex(this.nodes2D[0][0]), hex(this.nodes2D[0][1]), hex(this.nodes2D[0][2]), hex(this.nodes2D[1][0]), hex(this.nodes2D[1][1]), hex(this.nodes2D[1][2]), hex(this.nodes2D[2][0]), hex(this.nodes2D[2][1]), hex(this.nodes2D[2][2]), hex(this.nodes2D[3][0]), hex(this.nodes2D[3][1]), hex(this.nodes2D[3][2]));
//if (this.want_dump) debug("updates1", this.nodes1D);
//if (this.want_dump) debug("updates", Array.from(this.nodes1D).map((color) => hex(color)));
TODO("check perf, optimize?");
//        if (this.RGSWAP)
        const rgswap = this.RGSWAP || ((nop) => nop);
        let changed = false;
        for (let n = 0; n < this.hwmap.length; ++n)
        {
            const hwofs = this.hwmap[n];
            if (hwofs == UNMAPPED) continue;
            const newval = rgswap(this.nodes1D[n]); //uint32
            if (outnodes[this.firstpx + hwofs] == newval) continue;
//if (this.want_dump) debug(`${this.name}: node1D[${n}] ${hex(newval)} => outnode[${this.firstpx + hwofs}] ${hex(outnodes[this.firstpx + hwofs])}`);
            outnodes[this.firstpx + hwofs] = newval; //rgswap(this.nodes1D[n]); //uint32
            changed = true;
        }
//if (this.want_dump) debug("after2", hex(outnodes[this.firstpx]), hex(outnodes[this.firstpx + 1]), hex(outnodes[this.firstpx + 2]), hex(outnodes[this.firstpx + 3]), hex(outnodes[this.firstpx + 4]), hex(outnodes[this.firstpx + 5]), hex(outnodes[this.firstpx + 6]), hex(outnodes[this.firstpx + 7]), hex(outnodes[this.firstpx + 8]), hex(outnodes[this.firstpx + 9]), hex(outnodes[this.firstpx + 10]), hex(outnodes[this.firstpx + 11]));
//if (this.want_dump) debug("after1", outnodes.slice(this.firstpx, this.firstpx + this.numpx));
//if (this.want_dump) debug("after", Array.from(outnodes.slice(this.firstpx, this.firstpx + this.numpx)).map((color) => hex(color)));
        this.ctlr.dirty = changed; //CAUTION: minimize jumps to C++
        this.dirty = false;
        if (!this.want_dump) return;
//        let numupd = 0;
//        let n = 0; n < this.numpx; ++n)
//        for (const [n, [hwofs, xylist]] of Object.entries(this.outary))
//debug(this.outary);
        for (const [hwofs, xylist] of this.outary)
        {
            const n = xylist.top.x * this.height + xylist.top.y;
//            const hwofs = this.hwmap[n];
//            if (hwofs == UNMAPPED) continue;
//            assert(+n == xylist.top.x * this.height + xylist.y);
//            assert(this.nodes1D[xylist.top.x * this.height + xylist.top.y] == this.nodes2D[xylist.top.x][xylist.top.y]);
            assert(isdef(outnodes[this.firstpx + hwofs]), `${typeof this.firstpx} ${typeof hwofs} ${this.firstpx + hwofs} ${outnodes.length} ${typeof outnodes[this.firstpx + hwofs]}`);
            assert(outnodes[this.firstpx + hwofs] == rgswap(this.nodes2D[xylist.top.x][xylist.top.y]), `update failed? outnode[x ${xylist.top.x}, y ${xylist.top.y}] [ofs ${n}/firstpx ${this.firstpx} + hwofs ${hwofs}] ${typeof (this.firstpx + hwofs)}, ${typeof outnodes[this.firstpx + hwofs]} ${hex(outnodes[this.firstpx + hwofs])} failed to become ${hex(rgswap(this.nodes2D[xylist.top.x][xylist.top.y]))} ${hex(rgswap(this.nodes1D[n]))}`);
            if (outnodes[this.firstpx + hwofs] == svnodes[hwofs]) continue; //no change
//            debug(`outnodes[first ${this.firstpx} + hwmap[n ${n}/${this.numpx}] hwofs ${hwofs}] ${hex(svnodes[hwofs])} = rgswap(this.nodes1D[n ${n}]) ${hex(rgswap(this.nodes1D[n]))}`);
        }
        const delta = this.outary.map(([hwofs, xylist]) => (rgswap(this.nodes2D[xylist.top.x][xylist.top.y]) != svnodes[hwofs])? `"${hex(this.nodes2D[xylist.top.x][xylist.top.y])}"`: `"="`).join(","); //show value(s) sent from caller (before rgswap)
        if (delta.match(/\d/)) //something changed
        {
            output.push(`"update",` + delta + "\n");
            output.push(`"${time2str()}",` + this.outary.map(([hwofs]) => (outnodes[this.firstpx + hwofs] != svnodes[hwofs])? `"${hex(outnodes[this.firstpx + hwofs])}"`: `"="`).join(",") + "\n"); //show resulting values
        }
//        output.push(`"aka",` + this.hwmap.filter((hwofs) => (hwofs != UNMAPPED)).map((hwofs) => `"${hex(this.nodes1D[hwofs])}"`).join(",") + "\n");
        if (output.length) fs.appendFileSync(outfile, output.join(""));
//if (want_debug)
//    for (let n = 0, shown = 0; n < numpx; ++n)
//    {
//        debug("'%s' out: nodes1D[%'d] 0x%x -> outnodes[%'d + %'d]? %d, swap? %d = 0x%x", this.name, n, this.nodes1D[n], first, this.hwmap[n], +(this.hwmap[n] != UNMAPPED), +!!prop.RGSWAP, outnodes[first + this.hwmap[n]]);
//        if (this.hwmap[n] != UNMAPPED) if (++shown > 50) break;
//    }
//const ZZ = ((++this.iocount || (this.iocount = 1)) & 1)? (n) => n + first: (n) => 3 - n + first;
//outnodes[ZZ(0)] = RED_dim; outnodes[ZZ(1)] = GREEN_dim; outnodes[ZZ(2)] = BLUE_dim; outnodes[ZZ(3)] = WHITE_dim;
//const debout = [];
//for (let n = 0; n < numpx; ++n)
//    if (this.hwmap[n] < 5) debout.push(`${hex(this.nodes1D[n], "0x")} node[${n}] => out[${this.hwmap[n]}],`);
//debug(...debout);
//const dbuf = [];
//for (let n = 0; n < numpx; ++n)
//    if (this.hwmap[n] != UNMAPPED) dbuf[n] = `= model[${this.hwmap[n]}]`;
//    else dbuf[n] = "!map";
//debug(truncate(Object.entries(dbuf).map(([inx, val]) => `[${inx}] ` + val).join(", "), 150));
//if (want_debug) this.dump();
    }
/*
    this.dump = function(label, fmt)
    {
        debug_nested(+1, label || `model '${this.name}' ${commas(this.width)}x${commas(this.height)} (${commas(plural(this.nodes1D.length))} node${plural()}):`);
        debug.max_arg_len = 10e3;
        for (let y = this.height - 1; y >= 0; --y) //origin is bottom left, need to display top-to-bottom
            if ((y < this.height - 5) && (y >= 5)) { if (y == 5) debug(` :  (${this.height - 10} more lines)`); } //hide rows to reduce clutter
//            else debug(`[${y},0..${this.nodes2D.length}]: ${this.nodes2D.map((col) => hex(col[y])).join(", ")}`); //use "," to allow copy/paste to csv file
            else debug(`[${y},0..${this.nodes2D.length - 1}]: ${this.nodes2D.map((col, inx, all) => (fmt || "%'d, ").replace_if(inx == all.length - 1, /,\s*$/, "")).join("")}`, ...this.nodes2D.map((col) => col[y])); //use "," to allow copy/paste to csv file
//        debug(`cols: ${Object.keys(this.nodes2D).join(" ")}`);
        debug(`${this.numpx || 0} mapped:`, (this.hwmap || []).join(", "));
        debug.max_arg_len = null;
    }
*/
    this.csv = async function(label, fmt)
    {
        const outfile = name2file(`${label || `${this.name}`}-model.csv`);
        outfile.writeln(`"${this.width} x ${this.height}",${Object.keys(this.nodes2D).map((inx) => `"[${inx}][*]"`).join(",")}`);
        for (let y = 0; y < this.height; ++y)
            outfile.writeln(`"[*][${flip(y, this.height)}]",${this.nodes2D.map((col, x, all) => `${(all[x][flip.latest] == UNMAPPED)? '"x"': all[x][flip.latest]}`).join(",")}`); //origin is bottom left, but need to display top-to-bottom
        outfile.writeln("");
        outfile.writeln(`total ${this.numpx} of ${this.width * this.height} nodes mapped`.split(/\s+/).map((str) => `"${str}"`).join(","));
        outfile.end();
//        outfile.close();
//        debug("wrote %'d lines to '%s'", outfile.numwrites, outfile.name);
        await outfile.wait4close();
    }
//    assert(this.name && isdef(this.numpx) && this.width && this.height && this.nodes1D && this.nodes2D);
//collection tracking:
    for (const tag of tags)
        (model[tag] || (model[tag] = [])).push(this);
    (model.all || (model.all = [])).push(this);
//    if (Array.isArray(segs)) //create smaller model segments that can be mapped to h/w
//        this.segments = segs.map((seg, inx) => new model(name.replace(/:|$/, `_${inx + 1}$&`), () => seg));
}

function ismodel(obj)
{
    return (obj instanceof model);
}


module.exports.controller = controller;
function controller()
{
    assert(isMainThread, "don't call layout() in worker threads".brightRed);
    const {WS281x, Audio, CFG} = require("gpuport");
//    const nullpx = ctlr.channels
//    const grid =
    const cfg = new CFG(); //need cfg object to override fb# + timing < fb open
//console.log(JSON.stringify(Object.entries(WANT_TIMING)), srcline());
    cfg.frtime_hw = cfg.frtime; //preserve real frtime so timing calculations can be correct
    controller.frtime = cfg.frtime_hw / 1e3; //msec
    if (!cfg.isRPi) //not needed on RPi if /boot/config.txt set correctly?
        [cfg.frtime_hw, [[cfg.fb, cfg.timing]]] = [cfg.frtime, Object.entries(WANT_TIMING)]; //override timing before opening GpuPort
debug("here1");
    const ctlr = /*controller.ctlr =*/ new WS281x(); //open GpuPort and apply WS281x protocol
    assert(ctlr.isOpen, "open GpuPort failed".brightRed);
    debug("env: XWindows? %d, RPi? %d, cfg: screen#%d %'d x %'d, fps %3.1f (want %3.1f)".brightCyan, ctlr.isXWindows, ctlr.isRPi, ctlr.fb, ctlr.width, ctlr.height, 1e6 / cfg.frtime_hw, 1e6 / ctlr.frtime); //kludge: "+!" to force bool->numeric for sprintf
//process.env.NODE_ENV || "(dev)"
    if (!ctlr.fb || !ctlr.isRPi) [ctlr.zoom, ctlr.startbits] = [2, 0xFF333333]; //easier to debug
    ctlr./*frstamp*/ elapsed = -99e3; //don't play seq yet, but allow wkers to pre-render first frame
    const [NUM_UNIV, UNIV_LEN, uniq_ports] = [ctlr.wsnodes.length, ctlr.univlen, Object.values(ports).filter(dedup)]; //or ws.chlen;
//debug(NUM_UNIV, Object.entries(ports));
    assert(NUM_UNIV == uniq_ports.length, `#univ mismatch: got ${NUM_UNIV}, expected ${uniq_ports.length}`.brightRed);
//allow raw ports to also be used as models:
    for (const name of used_ports)
        layout.push({model: model(`port ${name}: USED`, () => mapall(grid(UNIV_LEN))), port: ports[name], start: 0});
//    if (cfg.xorfb) ws.shadowfb = cfg.fb ^ cfg.xorfb;
//assign physical nodes + i/o function to each model in layout:
//debug(layout);
    for (const [inx_prop, prop] of Object.entries(layout)) //prop := model + layout
    {
//        debug(prop);
        assert(ismodel(prop.model), `layout[${inx_prop}] missing model`.brightRed);
//        for (const [inx_sub, subprop] of Object.entries(/*prop.model.segments ||*/ [prop.model])) //.forEach((seg) =>
//        {
//        const numpx = subprop.numpx; //isdef(seg.numpx, seg.numpx, (seg.hwmap || []).flat().length);
        assert(prop.model.numpx > 0, `prop '${prop.model.name}' no nodes?`.brightRed);
//debug(prop.port, prop.start);
//        const port = toary(prop.port)[inx_sub], start = toary(prop.start)[inx_sub];
        assert(isdef(prop.port), `prop '${prop.model.name}' missing port#`.brightRed);
        const want_alloc = !isdef(prop.start); //alloc vs. re-assign nodes
        const first = !want_alloc? prop.start: alloc(prop.port, prop.model.numpx);
        assert(first + prop.model.numpx <= UNIV_LEN, `prop '${prop.model.name}' first ${first} + numpx ${prop.model.numpx} exceeds #nodes ${UNIV_LEN} available on port ${prop.model.port}`.brightRed);
//        [subprop.port, subprop.ctlr] = [port, ctlr]; //backdoor to full functionality
//        prop.ctlr = ctlr; //backdoor to full functionality
        Object.assign(prop.model, {firstpx: first, port: prop.port, RGSWAP: prop.RGSWAP, ctlr}); //ctlr is backdoor to full functionality
if (!module.parent)
        debug(`${want_alloc? "allocated": "assigned"} ${commas(plural(prop.model.numpx))} node${plural()} ${first}..${first + prop.model.numpx - 1} to prop '${prop.model.name}' on port ${prop.port}`);
//        }
    }
    debug("port nodes used", alloc.used);
//    const allports = model("all ports", () => //(x, y) =>
//    {
//        return grid(NUM_UNIV, UNIV_LEN);
//    });
    return {ctlr, NUM_UNIV, UNIV_LEN, Audio};

    function alloc(port, count)
    {
        const used = alloc.used || (alloc.used = {});
        const next = used[port] || 0;
        used[port] = next + count;
        return next;
    }
}


//show port ID for easier wiring debug:
async function portids(ctlr)
{
    Object.values(ports) //use all ports in case props assigned to incorrect port#s
        .filter(dedup)
        .forEach((port) =>
        {
            const outnodes = ctlr.wsnodes[port]; //CAUTION: [0] includes all nodes
//use white/blue (1/0) to avoid misinterp red/green due to RGB vs GRB order
            outnodes[0] = (uint32(port) & 16)? WHITE_dim: BLUE_dim;
            outnodes[1] = (uint32(port) & 8)? WHITE_dim: BLUE_dim;
            outnodes[2] = (uint32(port) & 4)? WHITE_dim: BLUE_dim;
            outnodes[3] = (uint32(port) & 2)? WHITE_dim: BLUE_dim;
            outnodes[4] = (uint32(port) & 1)? WHITE_dim: BLUE_dim;
            outnodes[6] = RED_dim; //set 1 px red/green to check R/G polarity
            outnodes[7] = GREEN_dim; //set 1 px red/green to check R/G polarity
            outnodes[8] = BLUE_dim; //set 1 px red/green to check R/G polarity
//debug("r/g port# %d: 0x%x 0x%x 0x%x 0x%x 0x%x", port, ...outnodes.slice(0, 5));
        });
    ctlr.dirty = true;
    await ctlr.out(5e3); //msec
}


//test all nodes, all ports:
async function test_all(ctlr)
{
    for (const color of [RED_dim, GREEN_dim, BLUE_dim, BLACK])
    {
        ctlr.fill(color); //direct fill all ports
        ctlr.dirty = true;
        await ctlr.out(2e3);
    }
}


/////////////////////////////////////////////////////////////////////////////////
////
/// main/sequence
//

const cues =
[
];
//const FX =
//[
//    {univ: 0, color: RED_dim, } //TODO: generalize into reusable fx rtn?
//];
TODO("tabular seq");


//    const {UNIV, /*START,*/ DURATION, SPEED/*, FPS*/} = opts;
//model.nodes = 1D array
//model.nodesxy = 2D grid (using model)
//    const wsnodes = ws.wsnodes; //seems to be expensive; place outside inner loop
//        const x = n % NUMPX % 32, y = (n % NUMPX - x) / 32;
//        const xyofs = xy_smpanel(x, y);
//        if (duration) await await_until((inx + 1) * duration); //adaptive
//                model.dirty = true;
//debug("here3");

TODO("refactor seq funcs");
async function mtree_demo()
{
    const myprop = mtree;
    for (let i = 0;; ++i)
    {
        debug("demo loop[%'d]", i);
        await fxrun(pin_finder, myprop, {DURATION: 10e3, FPS: 2});
//        await fxrun(pxscan, myprop, {DURATION: 20e3, color: [RED, GREEN, BLUE]});
        await fxrun(drip, myprop, {DURATION: 10e3});
        await fxrun(butterfly, myprop, {DURATION: 10e3, FPS: 10});
        await fxrun(color_fade, myprop, {DURATION: 10e3, FPS: 20, color: [RED, YELLOW, GREEN, CYAN, BLUE, MAGENTA, RED_WRAP]});
    }
}

//const Pathlib = require("path");
//const path = "./olaf*.xpm"
//    .replace(/^\~/, process.env.HOME)
//    .replace(/^\.(?=\/)/, Pathlib.dirname(__stack[0].getFileName()));
//debug(path); process.exit();

function bradjust(hue, amt) { return amt / (2 - Math.abs(hue % 120 - 60) * 50/60 /50); }
if (false)
{
debug("0x%x, %f", rgb2RGB(hsv2rgb({h: 0, s: 100, v: bradjust(0, 25)})), bradjust(0, 25));
debug("0x%x, %f", rgb2RGB(hsv2rgb({h: 30, s: 100, v: bradjust(30, 25)})), bradjust(30, 25));
debug("0x%x, %f", rgb2RGB(hsv2rgb({h: 60, s: 100, v: bradjust(60, 25)})), bradjust(60, 25));
debug("0x%x, %f", rgb2RGB(hsv2rgb({h: 90, s: 100, v: bradjust(90, 25)})), bradjust(90, 25));
debug("0x%x, %f", rgb2RGB(hsv2rgb({h: 120, s: 100, v: bradjust(120, 25)})), bradjust(120, 25));
process.exit();
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 100, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 50, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 0, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 100, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 50, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 0, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 100, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 50, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 0, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 100, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 50, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 0, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 100, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 50, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 0, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 100, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 50, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 0, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 100, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 50, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 0, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 100, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 50, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 0, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 100, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 50, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 0, v: 0})));
}
async function main_seq()
{
//elapsed = msec rel to start of effect
//    ws.elapsed = 0; //reset performance stopwatch
    const {ctlr, NUM_UNIV, UNIV_LEN, Audio} = controller();
//main_seq.ctlr = ctlr;
    ctlr.fill(BLACK); //start all dark
//run tests before wkers start:
    await portids(ctlr); //show port#s for easier wiring debug
if (false)
{
    debug("blank all + portids");
    for (let i = 0; i < 60; ++i)
    {
        ctlr.dirty = true;
        await ctlr.out();
    }
    return;
}
//    await test_all(ctlr);
    const num_wkers = 0; ///////launch_workers(NUM_UNIV);
TODO("workers");
//    const seq = sequence(); //async

//    await Promise.all([u0, u1, u2, u3, u4, u5, u6, u7, u8, u9, u10, ..., u23]);
//    for (let u = 0; u < NUM_UNIV; ++u) //24
//    if (num_wkers) setTimeout(() => ctlr.ready = bits(0, 24), DURATION + 1e3); //ensure one last wakeup in case wkers die prematurely
if (false)
{
    const path = find_file("~/Songs/*Boy_Child*.mp3", 1);
    const audio = new Audio();
    audio.path = path[0];
    debug("audioPB '%s'", audio.path);
    await audio.play();
debug(audio.rate, audio.channels, audio.bits, audio.num_buf, audio.data_len);
return;
}
debugger;
    debug("NOT sleep 30 sec ...");
//    await sleep(30e3);
    debug("animation start: #univ %'d, UNIV_LEN %'d".brightGreen, NUM_UNIV, UNIV_LEN);
    ctlr.elapsed = 0; //reset performance stopwatch, sync with gpu refresh, tell wkers/fx to start
//ctlr.elapsed = 4200e3;
//    await Promise.all(...model.USED.map(async function(port_model) //(port) =>
//    {
//        port_model.await_until = async function(msec) { debug("await until #1 %'d + %'d msec", ctlr.elapsed, msec); return ctlr.out(ctlr.elapsed + msec); }
//        await fill(port_model, {color: [RED_dim, GREEN_dim, BLUE_dim, WHITE_dim, BLACK], DURATION: 2e3});
//        port_model.await_until = async function(msec) { debug("await until #2 %'d + %'d msec", ctlr.elapsed, msec); return ctlr.out(ctlr.elapsed + msec); }
//        await pin_finder(port_model, {DURATION: 30e3, FPS: 2}); //run 1 pin_finder for each univ
//    }));
//    await ws.out(step / SPEED * 1e3 - ws.elapsed); //adaptive frame rate: skip or add frames to maintain animation speed
//    if (debug.timestamp < Date.now() - 5e3) debug("progress: " + stats(), ...stats.args);
//    devpanel.fill(RED_dim); devpanel.out(true); await ctlr.out(2e3);
//    devpanel.fill(GREEN_dim); devpanel.out(true); await ctlr.out(2e3);
//    devpanel.fill(BLUE_dim); devpanel.out(true); await ctlr.out(2e3);
//    ctlr.fill(BLACK); ctlr.dirty = true; await ctlr.out(2e3);
//devpanel.fill(BLACK);
//for (let n = 10; n < 20; ++n)
//{
//    devpanel.nodes1D[n] = RED_dim;
//    devpanel.nodes2D[n][0] = RED_dim;
//    devpanel.nodes2D[n][3] = GREEN_dim;
//    devpanel.out(true);
//    await ctlr.out(1e3 / 2);
//}
//    await fxrun(fill, devpanel, {color: [RED_dim, GREEN_dim, BLUE_dim, YELLOW_dim, CYAN_dim, MAGENTA_dim, WHITE_dim, BLACK], DURATION: 2e3});
//devpanel.debug = 1;
//    nodes2D[x][y] = color;
//    await await_until((step + 1) * steplen); //adaptive
//    model.out(true);
//    ctlr.out(0);

    const DURATION = 8 * 2e3 + 10e3 + 10e3; //expected
    const myprop = gift_face; //mtree; //devpanel;

//    mtree.dump();
//    return;
TODO("fx: img, text, rainbow, vix2");
TODO("mp3, multi-core");
TODO("sched/boot");
TODO("heartbeat, fade delay bug");
//DEMO
    const PALETTE = [RGBdim(RED, 0.5), RGBdim(GREEN, 0.5), RGBdim(BLUE, 0.5), RGBdim(YELLOW, 0.3), RGBdim(CYAN, 0.3), RGBdim(MAGENTA, 0.3), RGBdim(COOL_WHITE, 0.2), RGBdim(WARM_WHITE, 0.2)];
    const PALETTE_DIM = [RED_dim, GREEN_dim, BLUE_dim, YELLOW_dim, CYAN_dim, MAGENTA_dim, WHITE_dim];
    const STYLES = ["l2r", "r2l", "t2b", "b2t"];
    const NOBLANK = true;
if (false)
{
//0x282814 min flicker   0 0 0 1  0 1 0 0  0 0 0 1  0 1 0 0  0 0 1 0  1 0 0 0
//0x242412 mod flicker   0 0 1 0  0 1 0 0  0 0 1 0  0 1 0 0  0 1 0 0  1 0 0 0
//0x26261b more flicker  0 1 1 0  0 1 0 0  0 1 1 0  0 1 0 0  1 1 0 1  1 0 0 0
    const color = 0x242412; //0x282814; //RGBdim(WARM_WHITE, 0.15); //0x26261b
    ctlr.fill(color);
    ctlr.dirty = true;
    await ctlr.out();
    return;
}
if (false)
    for (let i = 0;; ++i)
    {
//        const PAL = [0xFF0f0000, 0xFF000f00, 0xFF00000f, 0xFF070700, 0xFF000707, 0xFF070007, 0xFF050505]; //min flicker
//        const PAL = [0xFF3f0000, 0xFF003f00, 0xFF00003f, 0xFF1f1f00, 0xFF001f1f, 0xFF1f001f, 0xFF0f0f0f]; //mod flicker
        const PAL = [0xFF070000, 0xFF000700, 0xFF000007, 0xFF030300, 0xFF000303, 0xFF030003, 0xFF030303];
//        ctlr.fill(0xFF0f0000); //RED);
//        ctlr.dirty = true;
//        await ctlr.out(5e3);
//        ctlr.fill(0xFF000f00); //GREEN);
//        ctlr.dirty = true;
//        await ctlr.out(5e3);
//        ctlr.fill(0xFF00000f); //BLUE);
//        ctlr.dirty = true;
//        await ctlr.out(5e3);
        const color = PAL[i % PAL.length];
        const swcolor = RGSWAP(color);
//        ctlr.fill(color); //BLUE);
        for (let u = 0; u < 24; ++u)
            if (u == TREE);
            else if (u == GIFT);
            else ctlr.wsnodes[u].fill(need_swap[u]? swcolor: color, 0, UNIV_LEN); //BLACK; //CAUTION: [0] includes all nodes
//1=left-most, n = right-most (looking out from porch)
//        colors[0] = RGSWAP(0xFF0f0000); //shep-1
//??        colors[1] = 0xFF00000f;
//        colors[2] = RGSWAP(0xFF0f000f); //gift
//ok        colors[3] = 0xFF0f0000; //tree
//??        colors[4] = 0xFF00000f;
//??        colors[5] = 0xFF0f000f; //
//??        colors[6] = 0xFF0f0000; //
//ok        colors[7] = 0xFF00000f; //angel
//ok        colors[8] = 0xFF0f000f; //M+J+B
//        colors[9] = RGSWAP(0xFF0f0000); //ic-1
//ok        colors[10] = 0xFF00000f; //shep-2
//ok        colors[11] = 0xFF0f000f; //shep-3?
//ok        colors[12] = 0xFF0f0000; //K-1
//??        colors[13] = 0xFF00000f;
//??        colors[14] = 0xFF0f000f;
//ok        colors[15] = RGSWAP(0xFF0f0000); //bow
//??        colors[16] = 0xFF00000f;
//??        colors[17] = 0xFF0f000f;
//ok        colors[18] = RGSWAP(0xFF0f0000); //ic-2
//??        colors[19] = 0xFF00000f;
//ok        colors[20] = 0xFF0f000f; //star
//??        colors[21] = 0xFF0f0000; //
//??        colors[22] = 0xFF00000f;
//ok        colors[23] = 0xFF0f000f; //globes
//??        colors[24] = 0xFF00000f;
//        for (let u = 0; u < 24; ++u)
//            ctlr.wsnodes[u].fill(colors[u]); //CAUTION: [0] includes all nodes
        ctlr.dirty = true;
        await ctlr.out(5e3);
    }
if (false)
    {
        ictext(fxrun, ic.segments[0]); //run in parallel
//        await sleep(60e3);
        const px1 = new Uint32Array(24 * 1056);
        const px2 = new Uint32Array(24 * 1056);
        const sc1 = Array.from({length: 24}).map((row, inx) => px1.slice(inx * 1056, (inx + 1) * 1056));
        const sc2 = Array.from({length: 24}).map((row, inx) => px2.slice(inx * 1056, (inx + 1) * 1056));
        scene1(sc1);
        scene2(sc2);
        for (let i = 0;; ++i)
        {
            const mix = ZZ(i, 30) / 30;
//            scene1(1 - mix, ctlr.wsnodes); //CAUTION: [0] includes all nodes
//            scene2(mix, ctlr.wsnodes); //CAUTION: [0] includes all nodes
            const perf = ctlr.elapsed;
            for (let u = 0; u < ctlr.wsnodes.length; ++u)
            {
                if (u == DEVPANEL) continue;
                const nodes = ctlr.wsnodes[u]; //CAUTION: [0] includes all nodes
                for (let n = 0; n < nodes.length; ++n) nodes[n] = RGBblend(mix, sc1[u][n], sc2[u][n], 1/64);
            }
debug("loop[%'d]: mix %3.2f, blend(sc1 0x%x, sc2 0x%x) = 0x%x took %'d msec", i, mix, sc1[DEVPANEL][0], sc2[DEVPANEL][0], RGBblend(mix, sc1[DEVPANEL][0], sc2[DEVPANEL][0], 1/64), ctlr.elapsed - perf);
            ctlr.dirty = true;
            await ctlr.out(1e3/5); //msec
            if (i % 60) continue;
            const where = gift_face; //devpanel; //gift_face;
            for (let xofs = 0; xofs < 5*5; ++xofs)
                await fxrun(image, where, {DURATION: .3e3, /*yofs,*/ xofs: ZZ(xofs, 5) - 2, DIM: 0.1, path: "./hippo-20x26.xpm"});
            where.fill(BLACK); //clean up after image display
        }
//        if (ctlr.elapsed > 2e6) restart(); //kludge: avoid timer wrap
    }
//if (false)
    {
        const target = devpanel; //gift_face;
        target.fill(BLACK);
        const PAL = [RED_dim, GREEN_dim, BLUE_dim];
        for (let i = 0;; ++i)
        {
debug(`loop[${i}]: color ${hex(PAL[i % PAL.length])}`);
            for (let x = 0; x < target.width; ++x)
                for (let y = 0; y < target.height; ++y)
                    if (x < 2 || x >= target.width - 2 || y < 2 || y >= target.height - 2)
                        target.nodes2D[x][y] = PAL[i % PAL.length];
            target.dirty = true;
            target.out();
            ctlr.dirty = true;
            await ctlr.out();
            await sleep(5e3);
        }   
    }
//if (false)
    const NO_TARGET = {port: -1};
    const [DIM, target_gift, target_bow, target_angel, target_star, target_tree, target_ic, target_fence] = true?
          [20, gift_face, gift_bow, angel, star, mtree, ic, fence]: //live
          [4, NO_TARGET, NO_TARGET, devpanel || NO_TARGET, NO_TARGET, NO_TARGET, NO_TARGET, NO_TARGET]; //dev
//    target_ic.ctlr = ctlr;
    devpanel.body = {x: 8, y: 0, w: 12, h: 5}; //kludge: emulate angel
    devpanel.wings = [{x: 0, y: 0, w: 6, h: 8}, {x: 26, y: 0, w: 6, h: 8}];
    devpanel.trumpet = {x: 6, y: 6, w: 10, h: 2};
    devpanel.segments = [devpanel, devpanel]; //kludge: emulate ic segs
//    mtree.want_dump = true;
    ic.segments[0].want_dump = ic.segments[1].want_dump = true;
    for (let i = 0;; ++i)
    {
//        const fx = [];
//        ictext(fxrun, ic.segments[0]); //run in parallel
//if (false)
{
//        ctlr.fill(PALETTE[i % PALETTE.length]);
        const hue = (i * 2) % 360;
        const color = rgb2RGB(hsv2rgb({h: hue, s: 100, v: bradjust(hue, DIM)}));
//        const swcolor = RGSWAP(color);
        if (!(i % 20)) debug(`demo loop[${commas(i)}], hue %d, mood color 0x%x`, hue, color); //, rgswap 0x%x, gbswap 0x%x, node color 0x%x, RGSWAP(color), GBR2RGB(color), ctlr.wsnodes[0][0]); //render_stats.counts || {});
//        ctlr.fill(color);
//        const need_swap = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
//        const color = PAL[i % PAL.length];
//        const swcolor = RGSWAP(color);
//        ctlr.fill(color); //BLUE);
//pxcheck("pre");
        for (let u = 0; u < 24; ++u)
        {
//pxcheck(`u ${u} loop ${i}`);
//ctlr.wsnodes[u].fill(BLACK, 0, UNIV_LEN); //CAUTION: [0] includes all nodes
//ctlr.wsnodes[u][i
//if (!i) debug(u, hex(ctlr.wsnodes[mtree.port][0]), hex(ctlr.wsnodes[mtree.port][10]));
TODO("should render all models here, no direct port I/O");
//            const my_color = (u == FENCE)? GBR2RGB(color): need_swap[u]? RGSWAP(color): color; //BLACK; //only use for direct port I/O
            if (u == target_gift.port) gift_ani(target_gift, color, i, DIM);
            else if (u == target_bow.port) bow_ani(target_bow, color, i, DIM);
            else if (u == target_angel.port) angel_ani(target_angel, color, i, DIM);
            else if (u == target_star.port) star_ani(target_star, color, i, DIM);
            else if (u == target_tree.port) tree_ani(target_tree, color, i, DIM);
//            else if (u == target_ic.segments[0].port || u == target_ic.segments[1].port) target_ic.segments.forEach((seg) => ic_ani(seg, color, i, DIM));
            else if (u == target_ic.segments[0].port) ic_ani(target_ic, color, i, DIM); //use composite for first seg
            else if (u == target_ic.segments[1].port); //already done; avoid incl with ctlr fill below
            else if (u == target_fence.port) fence_ani(target_fence, color, i, DIM);
            else ctlr.wsnodes[u].fill((u == FENCE)? GBR2RGB(color): need_swap[u]? RGSWAP(color): color | 0x102, 0, UNIV_LEN); //BLACK; //CAUTION: [0] includes all nodes
//if (!i) debug(u, hex(ctlr.wsnodes[mtree.port][0]), hex(ctlr.wsnodes[mtree.port][10]));
        }
        ctlr.dirty = true;
//        await ctlr.out(5e3); //msec
        await ctlr.out(1e3/5); //msec
        if (i % 200) continue;
        continue;
}
        ctlr.wsnodes[MJB].fill(BLACK, 0, UNIV_LEN); //CAUTION: [0] includes all nodes
        const where = gift_face; //devpanel; //gift_face;
        for (let xofs = 0; xofs < 5*5; ++xofs)
            await fxrun(image, where, {DURATION: .3e3, /*yofs,*/ xofs: ZZ(xofs, 5) - 2, DIM: 0.1, path: "./hippo-20x13.xpm"});
        where.fill(BLACK); //clean up after image display

        continue;
//        await fxrun(/*wipe*/ fill, mtree, {color: PALETTE[i % PALETTE.length]});
//        mtree.fill(PALETTE[i % PALETTE.length]);
//        mtree.out(true);
//        await fxrun(color_fade, mtree, {DURATION: 10e3 / 2, FPS: 20, color: [RED, YELLOW, GREEN, CYAN, BLUE, MAGENTA, RED_WRAP]});
//continue;
//        await fxrun(/*wipe*/ fill, mtree, {color: PALETTE[i % PALETTE.length]});
        fx.splice(0, fx.length);
        fx.push(fxrun(fill, mtree, {DURATION: 5e3, color: PALETTE[i % PALETTE.length]}));
        fx.push(fxrun(fill, gift_face, {DURATION: 5e3, color: PALETTE[i % PALETTE.length]}));
        fx.push(fxrun(fill, gift_top, {DURATION: 5e3, color: PALETTE[i % PALETTE.length]}));
        fx.push(fxrun(fill, ic.segments[0], {DURATION: 5e3, color: PALETTE[i % PALETTE.length]}));
        fx.push(fxrun(fill, ic.segments[1], {DURATION: 5e3, color: PALETTE[i % PALETTE.length]}));
        fx.push(fxrun(fill, globes[0], {DURATION: 5e3, color: PALETTE[i % PALETTE.length]}));
        fx.push(fxrun(fill, globes[1], {DURATION: 5e3, color: PALETTE[i % PALETTE.length]}));
        fx.push(fxrun(fill, globes[2], {DURATION: 5e3, color: PALETTE[i % PALETTE.length]}));
        fx.push(fxrun(fill, globes[3], {DURATION: 5e3, color: PALETTE[i % PALETTE.length]}));
        await Promise.all(fx);
//        await fxrun(color_fade, mtree, {DURATION: 10e3 / 2, FPS: 20, color: [PALETTE[i % PALETTE.length], PALETTE[(i + 1) % PALETTE.length]]}); //RED, YELLOW, GREEN, CYAN, BLUE, MAGENTA, RED_WRAP]});
if (false)
//        for (let yofs = -32; yofs < myprop.height; ++yofs)
        for (let xofs = 0; xofs < 5*5; ++xofs)
            await fxrun(image, myprop, {DURATION: .3e3, /*yofs,*/ xofs: ZZ(xofs, 5) - 2, DIM: 0.1, path: "./olaf*.xpm"});
//        for (const xofs of [0, 10, 3, 5, 8])
//            await fxrun(meteors /*drip*/, myprop, {DURATION: 10e3/3, xofs});
//        await fxrun(pin_finder, myprop, {DURATION: 10e3, FPS: 2});
//        await fxrun(pxscan, myprop, {DURATION: 35e3, /*NOBLANK,*/ color: PALETTE[i % PALETTE.length]}); //[RED, GREEN, BLUE]});
TODO("drop, wipe delay broken on mtree");probably
//        await fxrun(drip, myprop, {DURATION: 10e3});
        fx.splice(0, fx.length);
        fx.push(fxrun(butterfly, mtree, {DURATION: 20e3 , FPS: 3})); //10 * 2}));
        fx.push(fxrun(butterfly, gift_face, {DURATION: 20e3 , FPS: 3})); //10 * 2}));
        fx.push(fxrun(butterfly, gift_top, {DURATION: 20e3 , FPS: 3})); //10 * 2}));
        fx.push(fxrun(butterfly, ic.segments[0], {DURATION: 20e3 , FPS: 3})); //10 * 2}));
        fx.push(fxrun(butterfly, ic.segments[1], {DURATION: 20e3 , FPS: 3})); //10 * 2}));
        fx.push(fxrun(butterfly, globes[0], {DURATION: 20e3 , FPS: 3})); //10 * 2}));
        fx.push(fxrun(butterfly, globes[1], {DURATION: 20e3 , FPS: 3})); //10 * 2}));
        fx.push(fxrun(butterfly, globes[2], {DURATION: 20e3 , FPS: 3})); //10 * 2}));
        fx.push(fxrun(butterfly, globes[3], {DURATION: 20e3 , FPS: 3})); //10 * 2}));
        await Promise.all(fx);
//        await fxrun(color_fade, myprop, {DURATION: 10e3 / 2, FPS: 20, color: [RED, YELLOW, GREEN, CYAN, BLUE, MAGENTA, RED_WRAP]});
//        for (let a = 0; a < 4 * 7; ++a)
//        const a = 0;
//            await fxrun(/*wipe*/ fill, myprop, {DURATION: 5e3, NOBLANK, color: PALETTE_DIM[(i + a) % PALETTE_DIM.length], style: STYLES[(i + a) % STYLES.length]});
    }
//TEST
if (false)
    for (let i = 0; i < 5; ++i)
    {
//if (false)
    await fxrun(pin_finder, myprop, {DURATION: 20e3, FPS: 2});
//if (false)
    await fxrun(pxscan, myprop, {DURATION: 20e3, color: [RED, GREEN, BLUE]});
if (false)
    await fxrun(drip, myprop, {DURATION: 10e3});
//if (false)
    await fxrun(butterfly, myprop, {DURATION: 20e3, FPS: 10});
//if (false)
    await fxrun(color_fade, myprop, {DURATION: 20e3, FPS: 20, color: [RED, YELLOW, GREEN, CYAN, BLUE, MAGENTA, RED_WRAP]});
    }

//    await ctlr.out(5e3);
    
    debug("animation done: ".brightGreen + stats(), ...stats.args);
    debug(render_stats.counts);
    ctlr.fill(BLACK);
//    await minidev.await_until(15e3);
    await ctlr.out();
//    await wait_msec(5e3);

    async function fxrun(fx, model, opts)
    {
        const fxstart = ctlr.elapsed, force = true;
TODO("await_until: quad buf, frstamp queue, smarter dirty flag");
        model.await_until = async function(msec)
        {
            const TOOBIG = 1.5 * 60 * 60e3; //probably a bug if delay is this long; allow up to ~ 1 hr
            const delay = fxstart + msec - ctlr.elapsed;
            render_stats(fx.name, delay);
if ((delay < 5) || (delay > TOOBIG)) debug_nested(+1, "%s'%s' await until: start %'d + %'d msec = delay %'d msec, last age %'d", ((delay < 0) || (delay > TOOBIG))? "".brightRed: "".brightYellow, fx.name, fxstart, msec, delay, ctlr.elapsed - (fxrun.lastout || 0));
            model.out(force); //TODO: let caller do this?
            if ((delay < 0) && (ctlr.elapsed - (fxrun.lastout || 0) < 100)) return;
            fxrun.lastout = ctlr.elapsed;
            return ctlr.out((delay < 0)? 0: delay); //ignore late frames and try to catch up later
        }
        return fx(model, opts);
    }
//    const render_stats = auto_obj(), RENDER_STATUS = { LATE: 1, MARGINAL: 2, EARLY: 3, threshold: 5};
//    const status = (delay < -RENDER_STATUS.threshold)? RENDER_STATUS.LATE: (delay < 5)? RENDER_STATUS.MARGINAL: RENDER_STATUS.EARLY;
//    ++render_stats[fx.name][status] || (render_stats[fx.name][status] = 1);
    function render_stats(name, amt)
    {
        const threshold = 5; //, RENDER_STATUS = { LATE: 1, MARGINAL: 2, EARLY: 3};
        const counts = render_stats.counts || (render_stats.counts = auto_obj());
        const status = (amt < -threshold)? /*RENDER_STATUS.*/"LATE": (amt < +threshold)? /*RENDER_STATUS.*/"MARGINAL": /*RENDER_STATUS.*/"EARLY";
        ++counts[name][status] || (counts[name][status] = 1);
    }
    function stats() //dry to keep stats DRY
    {
//kludge: sprintf work-arounds are in debug() so just return args for debug(); DON'T call sprintf yet
//        return sprintf("elapsed %3.1f sec, %'d frames (%3.1f fps), busy %3.1f sec (%'d%%), idle %3.1f sec (%'d%%)", ws.elapsed, ws.numfr, ws.elapsed / ws.numfr / 1e3, ws.busy / 1e3, 100 * ws.busy / ws.elapsed, ws.slept / 1e3, 100 * ws.idle / ws.elapsed);
        const {elapsed, numfr, slept} = ctlr;
        stats.args = [elapsed / 1e3, numfr, numfr / (elapsed / 1e3), (elapsed - slept) / 1e3, Math.round(100 * (elapsed - slept) / elapsed), slept / 1e3, Math.round(100 * slept / elapsed)];
//console.log(...stats.args);
        return "elapsed %3.1f sec, %'d frames (%3.1f fps), busy %3.1f sec (%d%%), idle %3.1f sec (%d%%)";
    }
}
//NO- process.nextTick(isMainThread? main_seq: wker); //allow inline init but not I/O to finish first (avoids hoist problems)
if (!module.parent) run(isMainThread? main_seq: wker); //allow inline init and I/O to finish first (avoids hoist problems)

function run(main)
{
    if (run.what) clearImmediate(run.what); //cancel previous
    run.what = main && !run.hasOwnProperty("what") && setImmediate(main); //allow inline init and I/O to finish first, but only if not already decided
//    else run.what = null; //Object.defineProperty(run, "what", {value: null}); //kludge: prevent other calls
}

//function pxcheck(desc)
//{
//    assert(mtree.ctlr.wsnodes[mtree.port][12] == (tree_ani.last_color || BLACK), `${desc || ""} ${hex(mtree.ctlr.wsnodes[mtree.port][12])} != ${hex(tree_ani.last_color || BLACK)} ${srcline(+1)}`);
//}


//gift face edging, TODO: hearts falling?
function gift_ani(target, color, step, dim)
{
    const DENSITY = 3;
    if (!gift_ani.drops) gift_ani.drops = Array.from({length: target.width}).map(() => Math.round(Math.random() * DENSITY * target.height));
    target.fill(BLACK);
    const drip_color = RGBdim(color, 0.5);
    for (let x = 0; x < target.width; ++x)
    {
        const ydrip = (gift_ani.drops[x] - step + 999 * target.height) % (DENSITY * target.height);
        if (ydrip >= 0 && ydrip < target.height) target.nodes2D[x][ydrip] = drip_color; //clip

        const corners = { 0: 0, 1: 0, 2: -4, 3: -3, /*...,*/ [-4]: -3, [-3]: -4, [-2]: 0, [-1]: 0, };
        const xrel = (x > target.width / 2)? x - target.width: x;
//        for (let y = 0; y < target.height; ++y)
        for (let y = (target.height + isdef(corners[xrel], corners[xrel], -2)) % target.height; y < target.height; ++y)
//            if (x < 2 || x >= target.width - 2 || /*y < 2 ||*/ y >= (corners[x] || target.height - 2))
                target.nodes2D[x][y] = color; //PAL[i % PAL.length];
//if (!i) debug(`gift ${target.width} x ${target.height} port ${target.port}, corn[0], corn[-2]`, corners[0], typeof corners[target.width - 2], corners);
//            target.dirty = true;
    }
    target.out();
//if (!i) for (let x = 0; x < target.width; ++x) debug(x, corners[x]);
}

//tree drip:
function tree_ani(target, color, step, dim)
{
//debugger;
    const DENSITY = 3;
    if (!tree_ani.flakes) tree_ani.flakes = Array.from({length: target.width}).map(() => Math.round(Math.random() * DENSITY * target.height));
    target.fill(color);
//tree_ani.last_color = color;
//if (false)
{
    const [x, y] = [Math.floor(step / target.height) % target.width, step % target.height];
//    const ofs = x * target.height + y, hwofs = target.hwmap[ofs];
//const was = [target.nodes2D[x][y], target.nodes1D[ofs], target.ctlr.wsnodes[target.port][target.firstpx + hwofs]];
//debug(`tree[x ${x}, y ${y}] ${hex(target.nodes2D[x][y])} = [n ${step % target.height}] ${hex(target.nodes1D[step % target.height])} <= white ${hex(WHITE)}`.brightCyan);
    target.nodes2D[x][y] = WHITE;
    target.out();
//const isnow = [target.nodes2D[x][y], target.nodes1D[ofs], target.ctlr.wsnodes[target.port][target.firstpx + hwofs]];
//debug(`tree: xy [${x}, ${y}], step ${step}, port ${target.port} was: 0x%x 0x%x 0x%x, is now 0x%x 0x%x 0x%x`.brightCyan, ...was, ...isnow);
    return;
}
    const flake_color = RGBdim(WHITE, dim * 5 / 100); //0.3);
    for (let x = 0; x < target.width; ++x)
    {
        const yflake = (tree_ani.drops[x] - step + 999 * target.height) % (DENSITY * target.height);
        if (yflake >= 0 && yflake < target.height) target.nodes2D[x][yflake] = flake_color; //clip
    }
    target.out();
}


//ic drip:
function ic_ani(target, color, step, dim)
{
if (false)
{
    target.fill(color);
//    target.ctlr.wsnodes[target.port].fill(color, 0, UNIV_LEN); //CAUTION: [0] includes all nodes
//    target.out();
    return;
}
//debug("composite ic", target.width, target.height);
    const DENSITY = 5; //spread out to avoid too much color/brightness (and reduce cpu load)
//    const segs = target.segments || [target];
//TODO("ic segmentation -> composite model");
//    const totalw = segs.reduce((total, seg) => total + seg.width, 0);
    if (!ic_ani.drips) ic_ani.drips = Array.from({length: target.width}, () => ({yofs: Math.round(Math.random() * DENSITY * target.height), colors: palette_dim(rgb2RGB(hsv2rgb({h: Math.random() * 360, s: 100, v: /*100*/ dim}))).reverse()}));
//    segs.forEach((seg) => seg.ctlr.wsnodes[seg.port].fill(BLACK, 0, UNIV)_LEN)); //in case mapped incorrectly; //CAUTION: [0] includes all nodes
    target.fill(BLACK);
    for (let x = 0; x < target.width; ++x)
//    for (const [x, drip] of Object.entries(ic_ani.drips))
    {
//        const [seg, xofs] = (x < segs[0].width)? [segs[0], 0]: [segs[1], segs[0].width]; //segs[+(x >= segs[0].width)];
        const {yofs, colors} = ic_ani.drips[x];
        const ydrip = (yofs - step + 999 * target.height) % (DENSITY * target.height);
        if (ydrip >= 0 && ydrip < target.height) target.nodes2D[x][ydrip] = colors[0]; //clip
        if (ydrip + 1 >= 0 && ydrip + 1 < target.height) target.nodes2D[x][ydrip + 1] = colors[1]; //clip
    }
//    segs.forEach((seg) => { seg.out(); seg.dirty = true; });
//    target.segments.forEach((seg) => seg.out()); //send submodel nodes to each port
    for (const seg of target.segments) seg.out(target.dirty); //send submodel nodes to each port
}


//star radiate (vertical):
function star_ani(target, color, step, dim)
{
    target.fill(color);
//    /*target*/ target.ctlr.wsnodes[target.port].fill(BLACK, 0, UNIV_LEN); //in case mapped incorrectly //CAUTION: [0] includes all nodes
//    if (!star_ani.spikes) star_ani.spikes = Array.from({length: target.width}).map(() =>
//    {
//        const hue = Math.round(Math.random() * 360);
//        const colors = palette_dim(rgb2RGB(hsv2rgb({h: hue, s: 100, v: 100})), [1/16, 1/8, 1/4, 1/2, 1]);
//        return colors;
//    });
    const DENSITY = 2;
    if (!star_ani.spikes) star_ani.spikes = Array.from({length: target.width}).map(() => ({yofs: Math.round(Math.random() * DENSITY * target.height), colors: palette_dim(rgb2RGB(hsv2rgb({h: Math.random() * 360, s: 100, v: /*100*/ dim * 3}))).reverse()}));
    const SPIKELEN = star_ani.spikes[0].colors.length; //5;
//if (!hue) debug("0x%x ".repeat(5), ...colors);
//if (!hue) debug(intlist(10).map((i) => ZZ(i, WAVELEN)));
    for (let x = 0; x < target.width; ++x)
//    for (const [x, drip] of Object.entries(ic_ani.drips))
    {
        const {yofs, colors} = star_ani.spikes[x];
        const ydrip = (yofs - step + 999 * target.height) % (DENSITY * target.height);
        for (let y = 0; y < SPIKELEN; ++y)
            if (ydrip + y >= 0 && ydrip + y < target.height) //clip
                target.nodes2D[x][ydrip + y] = colors[y];
    }
    target.out();
}


//bow, fence chase radiate (horizontal wave):
//fence wave width ~= 6.5 nodes
function fence_ani(target, color, step, dim) { return bow_ani(target, color, step, dim); }
function bow_ani(target, color, step, dim)
{
    target.fill(color);
    const colors = palette_dim(color); //, [1/16, 1/8, 1/4, 1/2, 1]); //[0.05, 0.12, 0.3, 0.8, 1.0]);
    const WAVELEN = colors.length; //5;
//if (!hue) debug("0x%x ".repeat(5), ...colors);
//if (!hue) debug(intlist(10).map((i) => ZZ(i, WAVELEN)));
    for (let x = 0; x < target.width; ++x)
    {
//        target.nodes2D[x][1] = BLACK;
//        target.nodes2D[x][0] = colors[ZZ(x + step, WAVELEN)];
        target.nodes2D[x].fill(colors[ZZ(x + step, WAVELEN)]);
    }
    target.out();
}


//angel animation: hem waving, trumpet, hair
function angel_ani(target, color, step, dim)
{
if (false)
{
    target.fill(color);
//    target.ctlr.wsnodes[target.port].fill(color, 0, UNIV_LEN); //CAUTION: [0] includes all nodes
//    target.out();
    return;
}
//if (false)
{
//debugger;
    target.fill(BLACK);
    target.fill(RED, target.wings[0]);
    target.fill(YELLOW, target.hair);
    target.fill(GREEN, target.wings[1]);
    target.fill(BLUE, target.trumpet);
    target.fill(CYAN, target.halo);
    target.fill(MAGENTA, target.body);
    target.out();
    return;
}
    const GOLD = RGBdim(0xFF808000, dim / 100);
//    target.fill(GOLD, target.hair);
//    target.fill(GOLD, target.trumpet);
//    target.fill(GOLD, target.halo);
//debugger;
    target.fill(GOLD);
    target.fill(color, target.body);
//            target2.fill(BLACK);
//shape the wings a little:
    const cornersT = { 0: -4, 1: -2, /*...,*/ [-3]: -1, [-2]: -2, [-1]: -4, };
    const cornersB = { 0: 4, 1: 3, 2: 2, 3: 1, /*...,*/ [-2]: 2, [-1]: 4, };
    for (const wing of target.wings)
        for (let x = 0, xofs = wing.x; x < wing.w; ++x)
        {
            const xrel = (x > wing.w / 2)? x - wing.w: x;
            for (let y = (wing.h + isdef(cornersT[xrel], cornersT[xrel], -2)) % wing.h, yofs = wing.y; y < wing.h; ++y)
                target.nodes2D[xofs + x][yofs + y] = BLACK;
            for (let y = (wing.h + isdef(cornersB[xrel], cornersB[xrel], -2)) % wing.h - 1, yofs = 0; y >= 0; --y)
                target.nodes2D[xofs + x][yofs + y] = BLACK;
        }   
//trumpet:
    const BLOWLEN = 5;
    for (let x = 0, xofs = target.trumpet.x; x < target.trumpet.w; ++x)
        for (let y = 0; y < target.trumpet.y; ++y)
            if (ZZ(x + step, BLOWLEN) < BLOWLEN / 2) target.nodes2D[x][y] = BLACK;
//hem wave:
    const WAVEH = 4; //5;
//if (false)
    for (let y = 0, yofs = target.body.y; y < WAVEH / 2; ++y) //hem
        for (let x = 0, xofs = target.body.x; x < target.body.w; ++x)
        {
//                    const x_ani = Math.floor(x + target.width * hue / 360) % target.width;
//                    const dim = ZZ(x, WAVEH + 1) / WAVEH;
//                    target.nodes2D[x][y] = RGBdim(my_color, dim);
//                    target.nodes2D[x][y] = (y > ZZ(x, WAVEH))? my_color: BLACK;
            if (y < ZZ(x + ZZ(step / 2, 3), WAVEH)) target.nodes2D[xofs + x][yofs + y] = BLACK;
        }
    target.out();
//if (!i)
//for (let x = 0, y = 0; x < target.width; ++x)
//{
//    const x_ani = Math.floor(x + target.width * hue / 360) % target.width;
//    const dim = ZZ(x_ani, WAVEH + 1) / WAVEH;
//    debug("xy [%d][%d] => dim(0x%x, %2.1f) = 0x%x", x, y, my_color, dim, RGBdim(my_color, dim));
//}
}


//(async function main()
//{
//    debug("start");
//    await sleep(1e3);
//    debug("hello");
//    await sleep(5e3);
//    debug("stop");
//    restart();
//})();
const {spawn} = require("child_process");
//based on https://github.com/nodejs/help/issues/923
function restart()
{
debug("restarting");
    spawn(process.argv[1], process.argv.slice(2), {detached: true, stdio: ['ignore', process.stdout, process.stderr]}).unref();
    process.exit();
}


async function ictext(fxrun, where)
{
    const path = "./MerryXmas.xpm";
    const text = ((ictext.cache || {}).name == path)? ictext.cache: ictext.cache = XPM.fromFile(path);
//debug(text);
    where.fill(BLACK);
    for (;;)
    {
        await fxrun(meteors_new, devpanel, {DURATION: 10e3});
//        for (let xofs = -text.width; xofs < where.width; ++xofs) //L2R; harder to read
        for (let xofs = where.width - 1; xofs >= -text.width; --xofs) //R2L; easier to read
            await fxrun(image, where, {DURATION: 1e3/15, xofs, DIM: 0.5, path});
    }
}


async function OLD_WAY_dedicated_wkers()
{
    ws.elapsed = 0; //reset performance stopwatch, sync with gpu refresh
    for (let step = 0; step < DURATION * SPEED; ++step)
    {
//        if (wkers) await wkers(); //multi-threaded: wait for wkers to render
        if (NUM_WKERS) //multi-threaded: wait for wkers to render
        {
            await ws.await_ready(bits(0, 24)); //0xfff); //sh_ready == -1);
            ws.ready = 0; //synct.ready = ~0xfff; //0; //Atomic(sh_ready = 0);
            await ws.out(-1); //enque buf, don't wait for vsync
//        for (;;)
//        {
            ws.frnum = fr2msec(frnum(ws.elapsed + 1)); //tell wkers to render next frame; skip frames if behind schedule
//            const dup = (synct.frstamp == main.frstamp);
//            debug("next req: fr# %'d, frstamp %'d/%'d"[dup? "brightRed": "brightGreen"], frnum(synct.frstamp), synct.frstamp, frnum.duration);
//            await out();
//            if (!dup) break;
//        }
        }
        else //single-threaded
//        ws.fill(BLACK); //not needed if setting all nodes
        for (let u = 0; u < NUM_UNIV; ++u) //24
            if (MYUBITS & bits(u)) //render my universe
            {
//    const nodes = ws.wsnodes[u]; //seems to be expensive; place outside inner loop //CAUTION: [0] includes all nodes
//TODO: show multi-threaded example; use blocking mutex on dirty flag in workers?
function pin_finder({univ}, {nodes, step, dirty}){}
//            const color = [RED_dim, GREEN_dim, BLUE_dim][u >> 3]; //Math.floor(x / 8)];
                const [color, repeat] = [[RED_dim, GREEN_dim, BLUE_dim][u >> 3], (u & 7) + 1];
                const nodes = ws.wsnodes[u]; //seems to be expensive; place outside inner loop //CAUTION: [0] includes all nodes
//TODO: show multi-threaded example; use blocking mutex on dirty flag in workers?
                for (let n = 0; n < UNIV_LEN; ++n)
                nodes[n + NULLPX] = ((n - step) % repeat)? BLACK: color;
                ws.dirty = true;
            }
//        while (ws.elapsed / 1e3 < step / SPEED) await ws.out(); //adaptive frame rate: skip or add frames to maintain animation speed
        await ws.out(step / SPEED * 1e3 - ws.elapsed); //adaptive frame rate: skip or add frames to maintain animation speed
        if (debug.timestamp < Date.now() - 5e3) debug("progress: " + stats(), ...stats.args);
    }
}

    
function launch_workers(NUM_UNIV)
{
//const OS = require('os'); //cpus()
    const NUM_CPUs = require('os').cpus().length;
    const NUM_WKERs = Math.max(1, NUM_CPUs - 1);  //0; //1; //1; //2; //3; //leave 1 core for node event loop, audio, or other OS stuff; bkg render wkers: 43 fps 1 wker, 50 fps 2 wkers on RPi
//    NUM_WKERs: 0, //whole-house fg render
//  NUM_WKERs: 1, //whole-house bg render
//    NUM_WKERs: os.cpus().length, //1 bkg wker for each core (optimal)
//    NUM_WKERs: 6, //hard-coded #bkg wkers

//    ws.ready = ws.frnum = 0; //wkers will start on first frame immediately
//    controller.ctlr.frstamp = -1e3; //wkers !start yet
    const WKER_UNIV = Math.ceil(NUM_UNIV / (NUM_WKERs || 1)); //#univ each wker should render
    debug(`${plural(NUM_CPUs)} cpu${plural()}, cre ${plural(NUM_WKERs)} wker${plural()}, each handles ${WKER_UNIV} univ`.brightCyan);
    const SKIPBITS = 32 - NUM_UNIV;
    for (let u = 0; u < NUM_UNIV; u += WKER_UNIV) //wker(w);
//    return new Promise((resolve, reject) => {
        /*return*/ new Worker(__filename, {workerData: { univmask: bits(SKIPBITS + u, SKIPBITS + u + WKER_UNIV)}}) //stuniv: u, numuniv: Math.min(NUM_UNIV - u, WKER_UNIV)})
            .on('message', (msg) => debug(`wker[${u}] msg`, typeof msg, msg + "")) //resolve);
            .on('error', (err) => debug(`wker[${u}] err`.brightRed, typeof err, err + "")) //reject);
            .on('exit', (code) => debug(`wker[${u}] exit`.brightGreen, typeof code, code + "")); //reject(new Error(`Worker stopped with exit code ${code}`));
//            .unref();
//    if (NUM_WKERs) setTimeout(() => ws.ready = bits(0, 24), DURATION + 1e3); //ensure one last wakeup in case wkers die prematurely
    return NUM_WKERs;
//debug("TODO: multi-core".brightRed);
}


//test
function scene1_dev(nodes2D)
{
//    debug(typeof nodes2D, Array.isArray(nodes2D));
    nodes2D[DEVPANEL].fill(GREEN);
}

function scene2_dev(nodes2D)
{
    nodes2D[DEVPANEL].fill(RED);
}


//xmas
function scene1(nodes2D)
{
    nodes2D[TREE].fill(GREEN);
    nodes2D[STAR].fill(YELLOW);
//    nodes2D[IC1].fill(CYAN);
//    nodes2D[IC2].fill(CYAN);
    const ic1 = nodes2D[IC1], ic2 = nodes2D[IC2];
    for (let n = 0; n < ic1.length; ++n) ic1[n] = [BLUE, RGBdim(CYAN, 0.5), RGBdim(WHITE, 0.33)][Math.floor(n / 10) % 3];
    for (let n = 0; n < ic2.length; ++n) ic2[n] = [BLUE, RGBdim(CYAN, 0.5), RGBdim(WHITE, 0.33)][Math.floor(n / 10) % 3];
    const fence = nodes2D[FENCE];
//    nodes2D[FENCE].fill(GREEN);
    for (let n = 0; n < fence.length; ++n) fence[n] = [RED, RGBdim(WHITE, 0.33)][n % 2];
    nodes2D[STAR].fill(YELLOW);
    nodes2D[GLOBES].slice(0 * 228, 1 * 228).fill(RED);
    nodes2D[GLOBES].slice(1 * 228, 2 * 228).fill(GREEN);
    nodes2D[GLOBES].slice(2 * 228, 3 * 228).fill(RED);
    nodes2D[GLOBES].slice(3 * 228, 4 * 228).fill(GREEN);
    nodes2D[BOW].fill(RED);
    const gift = nodes2D[GIFT];
    gift.fill(BLACK);
    const xofs = yofs = 0;
    const img = XPM.fromFile("./hippo-20x26.xpm");
//debug("w, h: img (%'d, %'d), model (%'d, %'d)", img.width, img.height, W, H);
//    if (!opts.NOBLANK) model.fill(BLACK); //reset bkg or allow overlays
    for (let y = 0; y < img.height; ++y)
        for (let x = 0; x < img.width; ++x)
        {
            if ((y + yofs < 0) || (y + yofs >= H)) continue; //vert clip
            if ((x + xofs < 0) || (x + xofs >= W)) continue; //horiz clip
            const color = img.palette[img.colorinx[y][x]];
            if (typeof color != 'number') continue; //color = BLACK; //bkg
//                  else color = png.color((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, 
//            if ((x == 0) && (x + xofs > 0)) main.nodes[img.xy(x + xofs - 1, y)] = BLACK;
            const yflip = H - (yofs + y) - 1;
            gift[x + xofs][yflip] = color; //RGBdim(color, DIM);
        }
    
    
    nodes2D[SHEP1].fill(BLACK);
    nodes2D[SHEP2].fill(BLACK);
    nodes2D[SHEP3].fill(BLACK);
    nodes2D[SHEP4].fill(BLACK);
    nodes2D[K1].fill(BLACK);
    nodes2D[K2].fill(BLACK);
    nodes2D[K3].fill(BLACK);
    nodes2D[ANGEL].fill(BLACK);
    nodes2D[MJB].fill(BLACK);
}

//nativity
function scene2(nodes2D)
{
    nodes2D[STAR].fill(YELLOW);
    const white = RGBdim(WHITE, 0.3);
    nodes2D[SHEP1].fill(white);
    nodes2D[SHEP2].fill(white);
    nodes2D[SHEP3].fill(white);
    nodes2D[SHEP4].fill(white);
    nodes2D[K1].fill(RGBdim(MAGENTA, 0.3));
    nodes2D[K2].fill(RGBdim(CYAN, 0.3));
    nodes2D[K3].fill(RGBdim(YELLOW, 0.3));
    nodes2D[BOW],fill(MAGENTA);
    nodes2D[ANGEL].fill(YELLOW);
    nodes2D[MJB].fill(white);

//    const ic1 = nodes2D[IC1], ic2 = nodes2D[IC2];
//    for (let n = 0; n < ic1.length; ++n) ic1[n] = [BLUE, RGBdim(CYAN, 0.5), RGBdim(WHITE, 0.33)][Math.floor(n / 10) % 3];
//    for (let n = 0; n < ic2.length; ++n) ic2[n] = [BLUE, RGBdim(CYAN, 0.5), RGBdim(WHITE, 0.33)][Math.floor(n / 10) % 3];
//    const fence = nodes2D[FENCE];
    nodes2D[FENCE].fill(GREEN);
//    for (let n = 0; n < fence.length; ++n) fence[n] = [RED, RGBdim(WHITE, 0.33)][n % 2];

    nodes2D[IC1].fill(BLACK);
    nodes2D[IC2].fill(BLACK);
    nodes2D[GLOBES].fill(BLACK);
    nodes2D[TREE].fill(BLACK);
}


function wker()
{
debug(workerData);
    const MYUNIV = uint32(workerData.univmask);
    debug("wker: my univ 0x%x", MYUNIV);
    for (let u = 0; bits(u); ++u)
        debug("univ %d: mine? %d", u, !!(MYUNIV & bits(u)));
    setTimeout(() => debug("done"), 10e3);
    parentPort.postMessage("hello");
parentPort.postMessage("hello again");
}
//debug("here4");


function sleep(msec)
{
    return new Promise((resolve, reject) => setTimeout(() => resolve(), msec));
}


////////////////////////////////////////////////////////////////////////////////
////
/// Helpers:
//

function TODO(msg) { /*if (!TODO[msg]*/ ++debug.depth; return debug_limit(1, "TODO: ".brightYellow + msg); }

//CAUTION: shift appears to be mod 32; shift 35 == shift 3
//CAUTION: use ">>>" here to force uint32 result
function bits(from, to)
{
    return !isdef(to)? (((from < 32)? 0xffffffff: 0) >>> from) & ~(((to < 32)? 0xffffffff: 0) >>> to): //bit range
        ((from < 32)? 0x80000000: 0) >>> from; //single bit
}
//debug(`bits from ${from} = 0x%x`, 0xffffffff >>> from)[1]; }
//debug("0x%x, 0x%x, 0x%x, 0x%x, 0x%x, 0x%x, 0x%x", bits(0), bits(0, 4), bits(8, 16), bits(35), bits(10, 35), bits(32), bits(0, 32)); process.exit();


//convert to uint32:
//NOTE: operands to bit-wise operators *must* be uint32 in order to give correct result
function uint32(n) { return n >>> 0; }

//mix 2 values:
//mix:
// = 0 => 100% "from" value
// = 1 => 100% "to" value
function tween(mix, from, to)
{
//    return Array.isArray(from)? from.map((val, inx) => mix * val + (1 - mix) * to[inx]):
    if (typeof from != "object") return (1 - mix) * from + mix * to; //scalar
    assert(typeof to == "object");
//        const from_ents = Object.entries(from), to_ents = Object.entries(to);
//        assert(from_ents.length == to_ents.length);
    const retval = {};
    for (const [key, val] of Object.entries(from)) retval[key] = (1 - mix) * val + mix * to[key];
    return retval;        
}

//create ary from scalar val:
//allow ary element to be undef
function toary(val) { return /*toary.ary =*/ (/*isdef(val) &&*/ !Array.isArray(val))? [val]: val; }


//zig-zag:
function ZZ(val, limit)
{
    const [cycle, step] = [Math.floor(val / limit), val % limit];
    return (cycle & 1)? limit - step - 1: step;
}


function find_file(path, count)
{
debug(path, count, path.match(/^~/));
    const [min, max] = Array.isArray(count)? count: isdef(count)? [count, count]: ["", ""];
    const [min_desc, max_desc] = [isNaN(min)? "(no min)": min, isNaN(max)? "(no max)": max];
    const path_fixup = path.replace(/^\~/, process.env.HOME);
    const retval = find_file.files = glob.sync(path_fixup) || [];
    debug(`'%s' matches ${commas(plural(retval.length))} file${plural()}, ${min_desc}${(max != min)? `...${max_desc}`: ""} expected`, path_fixup, retval.length);
    assert((retval.length >= min) && (retval.length <= max), `path '${path}' !match ${min_desc}..${max_desc} files`);
    return retval;
}


//duplicate first array entry at end:
//useful for iterating over arrays that require 2 values
//function dupfirst(ary) { const retval = toary(ary); retval.push(retval[0]); return retval; }

//limit value to a range:
//just use Uint8ClampedArray
//function clamp(val, mix, max) { return Math.min(Math.max(val, isdef(min, min, 0)), isdef(max, max, 0xFF)); }

//ary filter to remove dups:
function dedup(val, inx, all) { return all.indexOf(+val) == inx; }

//return a lookup object that complains about undef entries:
function strict_obj(obj) //, allow_inh)
{
    return new Proxy(obj || {},
    {
        get: function(target, propname, rcvr) { assert(/*allow_inh? propname in target:*/ target.hasOwnProperty(propname), `missing property '${propname}'`.brightRed); return target[propname]; }, //Reflect.get(...arguments); },
    });
}

//lookup object that auto-creates new entries:
function auto_obj(obj)
{
    return new Proxy(obj || {},
    {
        get: function(target, propname, rcvr) { if (!target.hasOwnProperty(propname)) target[propname] = {}; return target[propname]; }, //Reflect.get(...arguments); },
    });
}


//show %:
//function percent(val)
//{
//    return round(100 * val, 10); //+ "%";
//}


//round to specified #decimal places:
//function round(val, digits)
//{
//    return Math.floor(val * (digits || 1) + 0.5) / (digits || 1); //round to desired precision
//}

function extensions()
{
    if (extensions.done) return;
    if (!Array.prototype.hasOwnProperty("top"))
    Object.defineProperties(Array.prototype,
    {
        top: { get() { return this[this.length - 1]; }, }, //NOTE: undef when array is empty
        push_fluent: { value: function(...args) { this.push(...args); return this; }, },
//        pop_fluent: { value: function(...args) { this.pop(...args); return this; }, },
    });
    if (!String.prototype.hasOwnProperty("replace_if"))
    Object.defineProperties(String.prototype,
    {
        replace_if: { value: function(want_repl, from, to) { return want_repl? this.replace(from, to): this; }, }, //conditional replace; in-line "if" reduces verbosity
    });
    debug("extensions installed");
    extensions.done = true;
}


//eof
