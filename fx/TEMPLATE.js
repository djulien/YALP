#!/usr/bin/env node

//YALP color fade
//Copyright (c) 2020 Don Julien
//Can be used for non-commercial purposes.
//
//History:
//ver 1.20.12 DJ 12/20/20  move to separate incl folder

'use strict'; //find bugs easier
//require('colors').enabled = true; //for console output (all threads)
//require("magic-globals"); //__file, __line, __stack, __func, etc
const Path = require('path');
//const {blocking, wait} = require('blocking-style');
//const cluster = require('cluster');
//const JSON = require('circular-json'); //CAUTION: replaces std JSON with circular-safe version
//const {sprintf, vsprintf} = require('sprintf-js'); //https://www.npmjs.com/package/sprintf-js
const glob = require("glob");
const {hsv2rgb, rgb2hsv} = require("./incl/colors");
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
const {/*WS281x, CFG,*/ debug, debug_nested, debug_limit, srcline, plural, commas, hex, isdef} = require("gpuport"); //"../"); //npm link allows real module name to be used here
debug.max_arg_len = 400;
debug("here2");

//const { debug } = require('console');
extensions(); //hoist for inline init usage below

TODO("WS281x config calculator: clk 2.4MHz (overridable), 3 ppb/hblank (overridable), #null px, fps/frtime (selectable: 20/50ms, 30/33ms, 40/25ms, 100/10ms) => UNIV_LEN => xres (must be even, 3n-1), yres, aspect, nodes/row; vblank => tweak (down) fps");


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


//raster image:
//xofs, yofs allows scrolling, panels, etc
async function image(model, opts)
{
debug("image ...", opts, model);
    const {nodes2D, width: W, height: H, await_until} = model;
    const {DURATION, path, /*xofs, yofs*/} = opts;
    const [xofs, yofs] = [opts.xofs || 0, opts.yofs || 0];
    const DIM = isdef(opts.DIM, opts.DIM, 0.3);
//TODO: stretch, shrink, etc
    const img = ((image.cache || {}).name == path)? image.cache: image.cache = XPM.fromFile(path);
debug("w, h: img (%'d, %'d), model (%'d, %'d)", img.width, img.height, W, H);
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
    const durations = toary(opts.DURATION || 0);
    const colors = toary(opts.color || BLACK);
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
*/


const ports = `
//red pins 0-7 = ports 0-7:
    R0,R1,R2,R3,R4,R5,R6,R7,
//green pins 0-7 = ports 8-15:
    G0,G1,G2,G3,G4,G5,G6,G7,
//blue pins 0-7 = ports 16-23:
    B0,B1,B2,B3,B4,B5,B6,B7,
//aliases:
    MTREE=R3,
    GIFT_FACE=R2,
    GIFT_TOP=B6,
    GLOBES=G2,
    IC1=B5, IC2=R7,
    DEVPORT=R1,
//    COLS=G3,
//    K3=R4,
//TODO? ALL=??,
        `.replace(/\/\/[^\n]*/g, "") //strip comments
        .replace(/^\s+|\s+$/g, "") //strip leading/trailing whitespace
        .split(/\s*,\s*/)
        .filter((name) => name) //drop blank entries
        .reduce((retval, name, inx, _, alias) => (alias = name.split("="), /*debug(name, alias, Object.entries(retval)),*/ retval[alias[0]] = alias[1]? retval[alias[1]]: inx, retval), strict_obj()); //convert ary to dict + expand aliases
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
    {model: mtree, port: ports.MTREE},
    {model: gift_face, port: ports.GIFT_FACE},
    {model: gift_top, port: ports.GIFT_TOP},
    {model: globes[0], port: ports.GLOBES},
    {model: globes[1], port: ports.GLOBES},
    {model: globes[2], port: ports.GLOBES},
    {model: globes[3], port: ports.GLOBES},
    {model: ic.segments[0], port: ports.IC1},
    {model: ic.segments[1], port: ports.IC2},
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
    const segs = xymapper();
//debug(typeof segs); //, srcline(+2));
//debug(Array.isArray(segs));
//debug(segs);
//debug(segs.constructor.name);
    Object.assign(this, Array.isArray(segs)? segs.shift(): segs); //{numpx, nodes2D or nodes1D};
//debug(this.nodes2D);
//give xymapper as much flexibility as possible; reconstruct missing data from provided data
    assert((isdef(this.nodes1D) && (isdef(this.height) || isdef(this.width))) || isdef(this.nodes2D)); //can reconstruct from the other data
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
    this.hwmap = new Int32Array(this.nodes1D); //JSON.parse(JSON.stringify(this.nodes1D)); //clone node map < caller overwrites with node data; CAUTION: must alloc memory here; don't share mem with this.nodes
    Object.freeze(this.nodes2D); //prevent 2D sttr from being damaged
//debug(typeof this.hwmap, (this.hwmap.constructor || {}).name, !!this.hwmap.join, this.hwmap.length, Array.isArray(this.hwmap), this.hwmap);
//debug("nodes2D len", this.nodes2D.length, this.nodes2D.flat().length);
//debug("xymap len", this.xymap.length, this.xymap.flat().length);
//    const H = this.height = this.nodes2D.length;
//    const W = this.width = this.nodes2D[0].length;
//debug(typeof this.nodes2D, this.nodes2D.constructor.name);
//debug(typeof this.nodes2D[0], (this.nodes2D[0] || "huh?").constructor.name, this.nodes2D[0]);
//    const [W, H] = [this.width, this.height]; //= [this.nodes2D.length, this.nodes2D[0].length]; //[this.width, this.height];
debug_nested(depth +1 || +1, `creating model '${name}', segs? ${Array.isArray(segs)? segs.length: "no"}, ${this.width}x${this.height} nodes`);
//    assert(H == this.nodes2D.length, `height mismatch: got ${this.nodes2D.length}, expected ${H}`.brightRed);
//    assert(W == this.nodes2D[0].length, `width mismatch: got ${this.nodes2D[0].length} expected ${W}`.brightRed);
    const tags = name.split(/\s*:\s*/);
    this.name = tags.shift();
    this.srcline = srcline(+1);
    this.fill = function(color) { this.nodes1D.fill(color || BLACK); this.dirty = true; } //for (const col of this.nodes2D) col.fill(color || BLACK); }
//    this.split = function(nparts) { const retval = []; } //too complex; needs to be done manually
    this.dump = function(label, fmt)
    {
        debug_nested(+1, label || `model '${name}' ${commas(this.width)}x${commas(this.height)} (${commas(plural(this.nodes1D.length))} node${plural()}):`);
        debug.max_arg_len = 10e3;
        for (let y = this.height - 1; y >= 0; --y) //origin is bottom left, need to display top-to-bottom
            if ((y < this.height - 5) && (y >= 5)) { if (y == 5) debug(` :  (${this.height - 10} more lines)`); } //hide rows to reduce clutter
//            else debug(`[${y},0..${this.nodes2D.length}]: ${this.nodes2D.map((col) => hex(col[y])).join(", ")}`); //use "," to allow copy/paste to csv file
            else debug(`[${y},0..${this.nodes2D.length - 1}]: ${this.nodes2D.map((col, inx, all) => (fmt || "%'d, ").replace_if(inx == all.length - 1, /,\s*$/, "")).join("")}`, ...this.nodes2D.map((col) => col[y])); //use "," to allow copy/paste to csv file
//        debug(`cols: ${Object.keys(this.nodes2D).join(" ")}`);
        debug(`${this.numpx || 0} mapped:`, (this.hwmap || []).join(", "));
        debug.max_arg_len = null;
    }
//    assert(this.name && isdef(this.numpx) && this.width && this.height && this.nodes1D && this.nodes2D);
//collection tracking:
    for (const tag of tags)
        (model[tag] || (model[tag] = [])).push(this);
    (model.all || (model.all = [])).push(this);
    if (Array.isArray(segs)) //create smaller model segments that can be mapped to h/w
        this.segments = segs.map((seg, inx) => new model(name.replace(/:|$/, `_${inx + 1}$&`), () => seg));
}


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
    ctlr.frstamp = -99e3; //don't play seq yet, but allow wkers to pre-render first frame
    const [NUM_UNIV, UNIV_LEN, uniq_ports] = [ctlr.wsnodes.length, ctlr.univlen, Object.values(ports).filter(dedup)]; //or ws.chlen;
//debug(NUM_UNIV, Object.entries(ports));
    assert(NUM_UNIV == uniq_ports.length, `#univ mismatch: got ${NUM_UNIV}, expected ${uniq_ports.length}`.brightRed);
//allow raw ports to also be used as models:
    for (const name of used_ports)
        layout.push({model: model(`port ${name}: USED`, () => mapall(grid(UNIV_LEN))), port: ports[name], start: 0});
//    if (cfg.xorfb) ws.shadowfb = cfg.fb ^ cfg.xorfb;
//assign physical nodes + i/o function to each model in layout:
//debug(layout);
    for (const [inx_prop, prop] of Object.entries(layout))
    {
//        debug(prop);
        assert(prop.model instanceof model, `layout[${inx_prop}] missing model`.brightRed);
        for (const [inx_sub, subprop] of Object.entries(prop.model.segments || [prop.model])) //.forEach((seg) =>
        {
            const numpx = subprop.numpx; //isdef(seg.numpx, seg.numpx, (seg.hwmap || []).flat().length);
            assert(numpx > 0, `prop '${subprop.name}' no nodes?`.brightRed);
//debug(prop.port, prop.start);
            const port = toary(prop.port)[inx_sub], start = toary(prop.start)[inx_sub];
            assert(isdef(port), `prop '${subprop.name}' missing port#`.brightRed);
            const want_alloc = !isdef(start); //alloc vs. re-assign nodes
            const first = !want_alloc? start: alloc(port, numpx);
            assert(first + numpx <= UNIV_LEN, `prop '${subprop.name}' ${first} + ${numpx} exceeds #nodes ${UNIV_LEN} available on port ${port}`.brightRed);
            [subprop.port, subprop.ctlr] = [port, ctlr]; //backdoor to full functionality
            subprop.out = function(force)
            {
const want_debug = this.debug; //false; //(this.iocount++ || (this.iocount = 1)) < 5;
if (want_debug)
    if (typeof want_debug == "number") --this.debug; else this.debug = false; //turn off for next time
//debug(this.name, this.numpx, this.width, this.height, port, first);
if (want_debug) debug("'%s' out: dirty? %d, force? %d, copying %'d nodes of %'dx%'d grid to port %d, stofs %'d", this.name, +!!this.dirty, +!!force, this.numpx, this.width, this.height, port, first);
                if (!this.dirty && !force) return;
                const outnodes = ctlr.wsnodes[port]; //shmslice(ctlr.wsnodes[port], first, first + numpx); //ctlr.wsnodes[port].slice(first, first + numpx);
//                for (let y = 0; y < this.height; ++y)
//                    for (let x = 0; x < this.width; ++x)
//                        if (this.hwmap[x][y] != UNMAPPED) outnodes[this.hwmap[x][y]] = this.nodes2D[x][y];
TODO("check perf, optimize?");
                for (let n = 0; n < numpx; ++n)
                    if (this.hwmap[n] != UNMAPPED) outnodes[first + this.hwmap[n]] = prop.RGSWAP? prop.RGSWAP(this.nodes1D[n]): this.nodes1D[n]; //uint32
if (want_debug)
    for (let n = 0, shown = 0; n < numpx; ++n)
    {
        debug("'%s' out: nodes1D[%'d] 0x%x -> outnodes[%'d + %'d]? %d, swap? %d = 0x%x", this.name, n, this.nodes1D[n], first, this.hwmap[n], +(this.hwmap[n] != UNMAPPED), +!!prop.RGSWAP, outnodes[first + this.hwmap[n]]);
        if (this.hwmap[n] != UNMAPPED) if (++shown > 50) break;
    }
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
if (want_debug) subprop.dump();
                ctlr.dirty = true;
                this.dirty = false;
            }
            debug(`${want_alloc? "allocated": "assigned"} ${commas(plural(numpx))} node${plural()} ${first}..${first + numpx - 1} to prop '${subprop.name}' on port ${port}`);
        }
    }
    debug("used", alloc.used);
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
            const outnodes = ctlr.wsnodes[port];
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
    ctlr.fill(BLACK); //start all dark
//run tests before wkers start:
    await portids(ctlr); //show port#s for easier wiring debug
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
    ctlr.elapsed = 0; //reset performance stopwatch, sync with gpu refresh
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
//if (false)
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
        ctlr.fill(color); //BLUE);
        ctlr.dirty = true;
        await ctlr.out(5e3);
    }
if (false)
    for (let i = 0;; ++i)
    {
        const fx = [];
        
//        ctlr.fill(PALETTE[i % PALETTE.length]);
        const color = rgb2RGB(hsv2rgb({h: i % 360, s: 100, v: bradjust(i % 360, 20)}));
        if (!(i % 20)) debug(`demo loop[${i}], hue %d, color 0x%x`, i % 360, color); //render_stats.counts || {});
        ctlr.fill(color);
        ctlr.dirty = true;
//        await ctlr.out(5e3); //msec
        await ctlr.out(1e3/5); //msec
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
TODO("drop, wipe delay broken on mtree");
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
if ((delay < 5) || (delay > TOOBIG)) debug_nested(+1, "%s'%s' await until: start %'d + %'d msec = delay %'d msec", ((delay < 0) || (delay > TOOBIG))? "".brightRed: "".brightYellow, fx.name, fxstart, msec, delay);
            model.out(force); //TODO: let caller do this?
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
process.nextTick(isMainThread? main_seq: wker); //allow inline init to finish first (avoids hoist problems)


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
//    const nodes = ws.wsnodes[u]; //seems to be expensive; place outside inner loop
//TODO: show multi-threaded example; use blocking mutex on dirty flag in workers?
function pin_finder({univ}, {nodes, step, dirty}){}
//            const color = [RED_dim, GREEN_dim, BLUE_dim][u >> 3]; //Math.floor(x / 8)];
                const [color, repeat] = [[RED_dim, GREEN_dim, BLUE_dim][u >> 3], (u & 7) + 1];
                const nodes = ws.wsnodes[u]; //seems to be expensive; place outside inner loop
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
function dedup(val, inx, all) { return all.indexOf(val) == inx; }

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
    Object.defineProperties(Array.prototype,
    {
        top: { get() { return this[this.length - 1]; }, }, //NOTE: undef when array is empty
        push_fluent: { value: function(...args) { this.push(...args); return this; }, },
//        pop_fluent: { value: function(...args) { this.pop(...args); return this; }, },
    });
    Object.defineProperties(String.prototype,
    {
        replace_if: { value: function(want_repl, from, to) { return want_repl? this.replace(from, to): this; }, }, //conditional replace; in-line "if" reduces verbosity
    });
    debug("extensions installed");
    extensions.done = true;
}


//eof
