#!/usr/bin/env node
//YALP config choices
//Copyright (c) 2019-2021 Don Julien
//Can be used for non-commercial purposes.

'use strict'; //find bugs easier
require('colors').enabled = true; //for console output (all threads)
//require("magic-globals"); //__file, __line, __stack, __func, etc
//const {sprintf} = require('sprintf-js'); //https://www.npmjs.com/package/sprintf-js
const {plural, commas} = require("yalp21/incl/utils");


//constraints:
const NUMPORTS = 24; //RPi #usable dpi24 output pins (24-bit RGB); requires device tree overlay
const [WSBITS, WSTIME] = [24, 30e-6]; //#bits, usec/node; determined by WS281X protocol
const PXCLOCK = [2.4e6]; //recommended pixel clock freq (MHz); lower numbers == less CPU overhead; < 20 MHz must be integral divisor of 19.2MHz; >= 50 MHz can be even multiples of 2 MHz
//variables:
const ASPECT = ['4:3', '14:9', '16:9', '5:4', '16:10', '15:9', '21:9', '64:27']; //RPi config supports several aspect ratios; not clear how it affects output; don't care?
//fps or univ len are the primary constraints:
const FPS = [10, 15, 20, 22.5, 25, 30, 35, 40, 45, 50, 55, 60, 80, 100]; //min, max #fps; set reasonable range
const UNIVLEN = [1000, 1200, 1518, 1600, 2000]; //max univ len; some target values


function main()
{
    const choices = [];
    console.log("YALP config calculator".brightCyan);
console.log("ppb", Math.trunc(3 * 0.55/1.25), "...", Math.ceil(3 * 0.85/1.25));
    console.log(plural(FPS.map(fps => find_cfg({fps}).map(cfg => choices.push(cfg))).flat().length()) + ` choice${plural()} by fps`);
    console.log(plural(UNIVLEN.map(univlen => find_cfg({univlen}).map(cfg => choices.push(cfg))).flat().length()) + ` choice${plural()} by univ len`);
    choices.forEach(cfg => output(
    {
        fps: Math.round10(cfg.fps),
        'frtime (usec)': Math.round10(1e6 / cfg.fps),
        'max univlen': Math.trunc(1 / cfg.fps / WSTIME),
        'RPi max': { get() { return NUMPORTS * this['max univlen']; }, enumerable: true},
        pxclock: cfg.pxclock,
        'px/bit': cfg.ppb, //Math.round10(WSTIME / WSBITS / cfg.pxclock),
        'rowtime (usec)': Math.round10((cfg.xres + cfg.xblank) / cfg.pxclock * 1e6),
        'nodes/row': { get() { return Math.round10(this['rowtime (usec)'] / WSTIME); }, enumerable: true},
        xres: cfg.xres,
        xblank: cfg.xblank,
        yres: cfg.yres,
        yblank: cfg.yblank,
        aspect: cfg.aspect,
        'univ actual': { get() { return Math.trunc((this.xres + this.xblank) * this.yres / this.pxclock / WSTIME); }, enumerable: true},
        '%util': { get() { return Math.round(this['univ actual'] / this['max univlen']); }, enumerable: true},
        notes: cfg.notes,
    }));
}
if (!module.parent) setImmediate(main); //run after inline init


//show config options for a given fps or univ len (primary constraints):
//fps, pxclock, ppb, xres, xblank, yres, yblank, aspect, notes
function find_cfg({fps, univlen})
{
    const retval = [];
    const frtime = univlen * WSTIME || 1 / fps; //sec
    const wsnodes = univlen || Math.trunc(1 / fps / WSTIME);
    for (const pxclock of PXCLOCK)
    {
        const [PPB_MIN, PPB_MAX] = [Math.trunc(WSTIME / WSBITS * pxclock), Math.ceil(WSTIME / WSBITS * pxclock)];
        for (let ppb = PPB_MIN; ppb <= PPB_MAX; ++ppb) //simplest timing = 1/1/1
            for (let xblank = Math.trunc(ppb * 0.55/1.25); xblank <= Math.trunc(ppb * 0.85/1.25); ++xblank)
                for (const aspect of ASPECT) //not clear how this affects GPU output; don't care?
                {
                    const xyres = wsnodes * WSBITS * ppb; //== (xres + xblank) * yres, RPi GPU wants xres even
                    const [xasp, yasp] = aspect.split(/\s*:\s*/).map(n => +n); //str => num
//xres = xasp * n, yres = yasp * n, solve for n:
//xyres == xtotal * yres = (xasp * n + xblank) * yasp * n == xasp * yasp * n^2 + xblank * yasp * n
//=>  n^2 + xblank / xasp * n - xyres / xasp / yasp = 0
//=> n = (-xblank / xasp +- sqrt(xblank^2 / xasp^2 + 4 * xyres / xasp / yasp) / 2
                    const [a, b, c] = [1, xblank / xasp, -xyres / xasp / yasp];
                    const discrim = b * b - 4 * a * c; //c < 0 => always +ve
                    const N = [-1, +1].map(op => (-b + op * Math.sqrt(discrim)) / 2).filter(dedupe);
                    for (const n of N)
                    {
                        const [xres, yres] = [Math.round(n * xasp), Math.round(n * yasp)];
                        const errs = [];
                        if (xres & 1) errs.push("non-even"); //RPi GPU wants xres even
                        const xtotal = xres + xblank;
                        if (xtotal % ppb) errs.push("jitter"); //interferes with start + data bits
                        const rowtime = xtotal / pxclock; //sec
                        const ytotal = Math.trunc(frtime / rowtime);
                        const yblank = ytotal - yres;
                        if (yblank < 1) errs.push("no-yblank"); //must be >= 1
                        const result = errs.join("+") || "okay";
                        retval.push({fps, pxclock, ppb, xres, xblank, yres, yblank, aspect, notes: result});
                    }
                }
    }
    return retval;
}


function output(row)
{
    if (!output.hdr) console.error(Object.keys(row).map(colname => `"${colname}"`).join(","));
    output.hdr = true;
    console.error(Object.values(row).map(colval => `"${colval.toLocaleString()}"`).join(","));
}


function dedupe(val, inx, all) { return all.indexOf(val) == inx; }


Math.round10 = function(n) { return this.round(10 * n) / 10; }

//eof