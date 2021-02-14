#!/usr/bin/env node
//YALP raster image effects
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

TODO("fx: scroll, text, stroke");

Object.assign(module.exports,
{
    image,
    polyline,
    fill,
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

//eof