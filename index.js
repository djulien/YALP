#!/usr/bin/env node
//GpuPort JS wrapper
"use strict";

require('colors').enabled = true; //for console output (all threads)
require("magic-globals"); //__file, __line, __stack, __func, etc
//const fs = require("fs");
const util = require("util");
const Path = require("path");
//const framebuffer = require("node-framebuffer");
//try { var heapdumpLoaded = !!require.cache[require.resolve('heapdump')]; } catch (ex) {} //https://github.com/nodejs/node/issues/1381
const had_wker = require.cache[require.resolve("worker_threads")];
//console.log(require.resolve("worker_threads"), !!require.cache[require.resolve("worker_threads")], srcline());
const {isMainThread, threadId, workerData, parentPort, Worker: Worker_sv} = require('worker_threads');
//console.log(require.resolve("worker_threads"), !!require.cache[require.resolve("worker_threads")], srcline());
const addon = require('bindings')('yalp-addon');
elapsed(); //set epoch at load time


//console.log !worky within web workers when worker or main thread busy :(
//redirect worker console to stdout/stderr so it won't be lost:
if (!isMainThread)
//    Object.entries({log: process.stdout, error: process.stderr})
//        .forEach(([meth, dest]) => console[meth] = function(...args) { dest.write(util.format(meth.charAt(0).toUpper(), ...args, "\n")); });
{
//console + process.stdout/stderr !worky from worker
    console.log = function(...args) { /*process.stdout.write addon.debug*/parentPort.postMessage(util.format("L", ...args, /*elapsed_str(), whoami(), srcline(+1), "\n"*/)); }
    console.error = function(...args) { /*process.stderr.write addon.debug*/parentPort.postMessage(util.format("E", ...args, /*elapsed_str(), whoami(), srcline(+1), "\n"*/)); }
}

//get version# and addon name:
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync("./package.json"));

//console.log(Object.keys(require.cache), srcline());
if (had_wker) throw `Please include '${cfg.name}' before 'worker_threads'`.brightRed;
//console.log(require('worker_threads').Worker, srcline());
//require('worker_threads').Worker = function(startup, wkopts)
class myWorker extends Worker_sv 
{
    constructor(startup, wkopts)
    {
//        console.log("wedged Worker()", srcline());
        const wkdata = Object.assign({}, wkopts || {}, {workerData: Object.assign({}, (wkopts || {}).workerData || {}, {epoch: elapsed.epoch, shmbuf: options.shmbuf})}); //kludge: add shmbuf and shared epoch to worker startup data
        super(startup, wkdata);
//        console.log(this.threadId, srcline());
    }
};
//no worky require("worker_threads").Worker = myWorker;
//console.log(require('worker_threads').Worker, srcline());


//const MY_EXPORTS = 
//expose addon exports + additional useful funcs to caller:
//Object.assign(module.exports, addon, ); //expose ctors + util funcs/consts
//Object.assign(module.exports, new addon.FB({rdwr: false})); //expose default FB attrs
options(); //{rdwr: false}); //expose default FB attrs
Object.assign(module.exports, /*with_methods(addon),*/ {version: cfg.version, options, debug, trunc, isobj, isUN, elapsed, milli, srcline, Worker: myWorker}); //elapsed_str
//console.log("exports:".brightBlue, Object.entries(module.exports).map(([key, val]) => truncate(`${key} = ${typeof val}: ` + fmt(val), 65)));
//console.log(module.exports);

//CLI (debug):
if (!module.parent)
{
    console.log(`Use "npm test" rather than running index.js directly.`.brightCyan);
    console.log("exports:".brightBlue, Object.entries(module.exports)
        .map(([key, val]) => `${key} = ${fmt(val, {truncate: 50, base: key.match(/mask|map/i)? 16: 10})} (${fmt.typeof})`));
    console.log("TODO? add single-threaded mini-seq?".brightYellow);
}

function fmt(val, opts = {})
{
//    return (Object.keys(val) || [val.toString()]).join(", ");
    const retval = //Array.isArray(val)? "[0.." + (val.length - 1) + "]":
        isobj(val)? [val.constructor.name + "!", 
            (typeof val == "function")? trim(val.toString()).replace(/(\n|\/\/)[\s\S]*$/, " ..."): //first line (signature) only
//            val.hasOwnProperty("length")?  "[0.." + (val.length - 1) + "]": //[Array.isArray(val)? "array": "array-like",
            ("length" in val)?  "[0.." + (val.length - 1) + "]": //[Array.isArray(val)? "array": "array-like",
            "{" + trim(Object.keys(val).join(", ")) + "}"]:
        (typeof val == "string")? ["string", "'" + trim(val) + "'"]:
//        (typeof val == "number")? ["number", val.toLocaleString()]: //use commas to group 1000s
//        [typeof val, val.toString()];
        [typeof val, (opts.base == 16)? hex(val): val.toLocaleString()];
    fmt.typeof = retval[0];
    return retval[1];
    function trim(thing) { return opts.truncate? trunc(thing, opts.truncate): thing; }
}


//const custom =
//module.exports.opts = 
function options(opts) //, startup, render, quit})
{
//    if (custom.already) console.error("custom: called already".brightRed);
//    custom.already = true;
    if (!isUN(opts)) debug("custom opts", opts); //, whoami(), "@" + Path.basename(__file) + ":" + __line);
    options.shmbuf = isMainThread? new SharedArrayBuffer(u32bytes(24 + 16)): workerData.shmbuf; //kludge: node addon api !support SharedArrayBuffer so cre in JS and pass to addon
    const u32shmbuf = new Uint32Array(options.shmbuf); //kludge: napi !support SharedArrayBuffer; pass in something it can handle
//    console.log(require('worker_threads').Worker, srcline());
//    require('worker_threads').Worker = function(startup, wkopts)
//    {
//        console.log("wedged Worker()", srcline());
//        const wkdata = Object.assign({}, wkopts || {}, {workerData: Object.assign({}, (wkopts || {}).workerData || {}, {epoch: elapsed.epoch, shmbuf})}); //kludge: add shmbuf and shared epoch to worker startup data
//        return Worker_sv(startup, wkdata);
//    };
//    console.log(require('worker_threads').Worker, srcline());
    const obj = new addon.FB(Object.assign({shmbuf: u32shmbuf}, opts || {}));
    const statslen = obj.statsdir.split(/\s*,\s*/).length;
    [obj.stats, obj.brlimit] = [new Int32Array(options.shmbuf, u32bytes(0), statslen), new Uint32Array(options.shmbuf, u32bytes(statslen), obj.MAX_PORTS)]; //kludge: make shmbuf look like it came from addon; CAUTION: atomics req int32 not uint32
//    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(obj))
//        .filter(prop => typeof obj[prop] == "function")
//        .reduce((methods, method) => Object.assign(methods, {[obj.constructor.name + "." + method]: obj[method]}), {}); //tell everything
    const methods = (!module.parent? Object.getOwnPropertyNames(Object.getPrototypeOf(obj)): []) //show class methods (for debug only)
        .filter(prop => typeof obj[prop] == "function")
        .reduce((methods, method) => Object.assign(methods, {[obj.constructor.name + "." + method]: obj[method].bind(obj)}), {FB: addon.FB});
    const retval = Object.assign(module.exports, methods, {fb: obj}, obj); //expose customized fb instance + FB attrs
//    for (let obj = new addon.FB(opts), level = 0; obj; obj = Object.getPrototypeOf(obj), ++level)
//        console.log("methods", level, Object.getOwnPropertyNames(obj).filter(prop => typeof obj[prop] == "function"));
//    return module.exports;
    return retval; //fluent imports
//    Object.assign(OPTS, opts || {}); //override built-in options with caller options
//    cre_nodes(OPTS);
//    const fb = module.exports.fb = new addon.FB(isMainThread? opts: {}); //{brlimit: 3 * 256 * 0.5}); //{fbnum: +fb.fbdev.last, xres: fb.xres, xblank: fb.xtotal - fb.xres, yres: fb.yres, linelen: fb.line_length, ppb: fb.ws_ppb});
//console.log("fb", Object.getOwnPropertyDescriptors(addon.FB.prototype), fb.fps, fb.frtime_usec, fb.vblank_usec, fb.NUM_PORTS);
//console.log(Object.keys(yalp));
//console.log("yalp", {xres: yalp.xres, xblank: yalp.xblank, yres: yalp.yres, linelen: yalp.linelen, ppb: yalp.ppb, NUM_PORTS: yalp.NUM_PORTS, 'brlimit[0]': yalp.brlimit[0]}, srcline());
//[fb.xtotal, fb.ytotal] = [fb.xres + fb.xblank, fb.yres + fb.yblank];
//fb.univlen_t = Math.floor((fb.frtime_usec - 50) / 30); //allow 50 usec for WS281X latch
//fb.univlen_r = Math.floor(fb.xtotal * fb.yres / 3 / 24); //50 usec = 50/1.25 == 40 bits for WS281X latch
//fb.rowgap = fb.stride32 - fb.xres; //fb.xtotal; //memory wasted/padding on each raster scan line
//fb.numpx = fb.yres * fb.stride32;
//fb.ppb = 3; //SPI3x encoding
//console.log("fb", JSON.stringify(fb, (key, val) => (isUN(val, {}).length > 30)? `(${typeof val} len ${val.length})`: val, "  ")); //, Object.keys(fb));
//    console.log("fb", util.formatWithOptions({maxArrayLength: 20, maxStringLength: 200, colors: true, getters: true}, fb)); //, Object.keys(fb));
//    setImmediate(isMainThread? main: worker); //allow in-line init code to finish first
//    return this; //fluent
}


//helpers:
//for profiling see https://nodejs.org/en/docs/guides/simple-profiling/
function debug(...args)
{
//    args.forEach((arg, inx) => console.error("isbuf?", !isUN(isUN(arg, {}).byteLength)));
//    args.forEach((arg, inx) => !isUN(isUN(arg, {}).buffer) && args.splice(inx, 1, Object.assign({}, arg, {buffer: `(buffer bytelen ${arg.buffer.byteLength})`))));
//    args.unshift(whoami());
    const want_srcline = true; //(debug.opts || {}).srcline; //__stack[] is useful but expensive; allow it to be turned off
    const [valargs, srcargs] = (want_srcline !== false)? args.reduce((partitioned, arg) => (partitioned[+isUN(arg, "").hasOwnProperty("isSrcline")].push(arg), partitioned), [[], [srcline(+1).toString()]]): [args, []];
//    valargs.push("T+" + milli(elapsed()), whoami(), ...srcargs); //, srcline(+1)); //TODO: remove redundant file names from srcargs
    return console.log(...valargs.map(arg => fmt(arg)), "T+" + milli(elapsed()), whoami(), ...srcargs);

//    function fmt(val) { return !isUN(isUN(arg, {}).buffer)? Object.assign({}, arg, {buffer: `(buffer bytelen ${arg.buffer.byteLength})`}): arg; }
    function fmt(val) { return util.formatWithOptions({maxArrayLength: 20, maxStringLength: 200, colors: true, getters: true}, val).replace(/(?<!0x|[\d.])\d+/gi, val => (+val).toLocaleString()); }
}

function whoami() { return "$" + threadId + "MT".charAt(+!isMainThread); }


function trunc(val, len = 30)
{
    return val
        .toString()
        .replace(new RegExp(`(?<=[\s\S]{${len},}\\b)[\s\S]*$`), " ..."); //[^]; //try to cut on word boundary
}

//check for undefined or null:
//based on https://stackoverflow.com/questions/2647867/how-can-i-determine-if-a-variable-is-undefined-or-null
function isUN(thing, unval)
{
    const retval = (thing == null);
    return (unval === undefined)? retval: retval? unval: thing;
}

//from https://stackoverflow.com/questions/8511281/check-if-a-value-is-an-object-in-javascript
function isobj(thing, objval)
{
//    const answer1 = (typeof thing == 'object' && thing !== null);
    const retval = (thing === Object(thing));
//    if (answer1 != answer2) throw `disagree: ${answer1} ${answer2}${srcline()}`.brightRed;
    return (objval === undefined)? retval: retval? objval: thing;
}

function elapsed(since)
{
    if (!elapsed.epoch) elapsed.epoch = (workerData || {}).epoch || Date.now(); //isMainThread? Date.now(): workerData.epoch; //use same time base for all threads
//    if (!elapsed.epoch) elapsed.epoch = isMainThread? Date.now(): workerData.epoch; //use same time base for all threads
    return ((elapsed.latest = Date.now()) - (since || elapsed.epoch));
}

//show msec val to 3 dec places:
function milli(n) { return (n / 1e3).toFixed(3); }

//function elapsed_str(when) { return "T+" + milli(elapsed(when)); } //msec -> sec

function u32(val) { return val >>> 0; }
function u32bytes(u32inx) { return u32inx * Uint32Array.BYTES_PER_ELEMENT; }
function hex(val, prefix = "0x") { return /*isUN(pref, "0x")*/ prefix + u32(val).toString(16); } //force to uint32 for correct display value

//function good_srcline(depth = 0) { return ` @:${(__stack[depth + 1] || {getLineNumber: () => -1}).getLineNumber()}`; }
function srcline(depth = 0)
{
    if (!isUN(srcline.bypass)) return srcline.bypass; //__stack[] is useful but expensive; allow it to be turned off
    const stkfr = __stack[depth + 1] || {getFileName: () => "??", getLineNumber: () => "?"};
//    process.stdout.write(util.format(typeof stkfr, isobj(stkfr, stkfr.constructor.name) || "none", "\n"));
//    process.stdout.write(util.format(((stkfr || {}).getFilename || (() => "??"))(), "\n"));
//    process.stdout.write(util.format(((stkfr || {}).getLinenumber || (() => -1))(), "\n"));
//    try { return " @" + Path.basename(((stkfr || {}).getFilename || (() => "??"))()) + ":" + ((stkfr || {}).getLineNumber || (() => -1))(); }
//no worky    try { return " @" + Path.basename(stkfr.getFilename()) + ":" + stkfr.getLineNumber(); }
//    try { return " @" + Path.basename(stkfr.getFilename()) + ":" + stkfr.getLineNumber(); }
//    catch { return " @!!:!"; }
//console.log(typeof stkfr, (stkfr.constructor || {}).name, typeof stkfr.getFileName, typeof (stkfr.prototype || {}).getFileName);
//console.log(stkfr.getFileName(), stkfr.getFileName().constructor.name);
    const retval = " @" + Path.basename(stkfr.getFileName()) + ":" + stkfr.getLineNumber(); //CAUTION: CallSite method names are camel case
    return Object.defineProperty(new String(retval), "isSrcline", {value: true}); //allow mult (nested) srcline to be detected; need obj for prop; !enum
}

//function isSrcline(str) { return isUN(str, "").toString().match(/^ @[^^&{}[\]\$=()%]+:\d+$/); }

//eof
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

function ignore()
{
setImmediate(custom); //call this in case caller doesn't; allow in-line init code to finish first

const {Worker, isMainThread, parentPort, workerData, threadId} = require('worker_threads');
elapsed.started = isMainThread? Date.now(): workerData.epoch; //use same time base for all threads

extensions(); //hoist

//if ((workerData || {}).buffer) workerData.buffer.toString = function() { return `(buffer bytelen ${this.byteLength})`; };
//if (!isUN((workerData || {}).byteLength) && args.splice(inx, 1, `(buffer bytelen ${arg.byteLength})`));
debug("entry", workerData); //Object.assign({}, workerData || {}, (workerData || {}).buffer? {buffer: `(buffer bytelen ${workerData.buffer.byteLength})`}: {}));
//setImmediate(isMainThread? main: worker); //allow in-line init code to finish first

/* RPi DPI24 pinout
refs:
https://www.raspberrypi.org/documentation/hardware/raspberrypi/dpi/README.md
https://pinout.xyz/
http://www.mosaic-industries.com/embedded-systems/microcontroller-projects/raspberry-pi/gpio-pin-electrical-specifications


GW * dpi      func  YALP# header YALP# func   dpi * GW
              3.3V        1  2         5V
(gw)pu(VSYNC) GPIO2  VS   3  4         5V
(gw)pu(HSYNC) GPIO3  usr  5  6         0V
(gw)!f B0     GPIO4  23   7  8  13   GPIO14  G2 !f GW
                0V        9 10  12   GPIO15  G3 !f GW
(gw)!f G5    GPIO17  10  11 12   9   GPIO18  G6 !f GW
GW !f R7     GPIO27   0  13 14         0V
GW !f R2     GPIO22   5  15 16   4   GPIO23  R3 !f GW
              3.3V       17 18   3   GPIO24  R4 !f (gw)
GW !f B6     GPIO10  17  19 20         0V
GW !f B5      GPIO9  18  21 22   2   GPIO25  R5 !f (gw)
GW !f B7     GPIO11  16  23 24  19    GPIO8  B4:(fl)GW
                0V       25 26  20    GPIO7  B3:FL (gw)
--    (CLK)   GPIO0  CK  27 28  usr   GPIO1 (EN)    --
(gw)FL:B1     GPIO5  22  29 30         0V
GW FL:B2      GPIO6  21  31 32  15   GPIO12  G0:fl  GW
GW FL:G1     GPIO13  14  33 34         0V
GW fl:G7     GPIO19   8  35 36  11   GPIO16  G4:fl  GW
-- FL:R6     GPIO26   1  37 38   7   GPIO20  R0:fl? (gw)
                0V       39 40   6   GPIO21  R1 !f  GW

* flicker:    5 6 7 8         12 13       16       19 20                26   
* !flicker: 4         9 10 11       14 15    17 18       21 22 23 24 25    27
pu = pull-ups
GW = Gowhoops break-out board
YALP ctlr break-out: TOP= 3(R3) 2(R2) 22(B6) 10(G2) 21(B5) 7(R7) 11(G3) 14(G6) 18(B2) 8(G0) 1(R1) 12(G4) 15(G7) 9(G1) 20(B4) 23(B7) =BOTTOM
todo: 0(R0), 4(R4), 5(R5), 6(R6), 13(G5), 16(B0), 17(B1), 19(B3)
*/


//console.log("misc", {NUM_PORTS, UNIV_LEN, '1dlen': nodes1D.byteLength, '2dlen': `${nodes2D.length} x ${nodes2D[0].byteLength}`}, srcline());

//fb.fill(0, true);
//process.exit();

//pxbuf[0] = -1;
//console.log(hex(fb.pxbuf[0]));
//fb.pxbuf[0] = fb.pxbuf[1] = fb.pxbuf[2] = 0;
//fb.pxbuf.fill(0); //NOTE: this will not clear WS281X (not SPI3x encoded)
//fb.wait4sync();

//console.log(hex(fb.pxbuf[0]));
//process.exit();


const OPTS =
{
    num_wkers: require("os").cpus().length, //default 1 thread per core
    brlimit: 3 * 256 * 5/6, //default 85% (50mA per pixel)
//    univlen: 
    portmask: -1,
};
const NOFUNC = () => {};
process.on("beforeExit", () => debug("about to exit".brightYellow));


//allow caller to supply custom logic or override defaults:
module.exports.custom = 
function custom({opts, startup, render, quit})
{
    if (custom.already) { debug("custom: called already"); return this; }
    custom.already = true;
    Object.assign(OPTS, opts || {}); //override built-in options with caller options
//    cre_nodes(OPTS);
    const fb = module.exports.fb = new addon.FB(isMainThread? opts: {}); //{brlimit: 3 * 256 * 0.5}); //{fbnum: +fb.fbdev.last, xres: fb.xres, xblank: fb.xtotal - fb.xres, yres: fb.yres, linelen: fb.line_length, ppb: fb.ws_ppb});
//console.log("fb", Object.getOwnPropertyDescriptors(addon.FB.prototype), fb.fps, fb.frtime_usec, fb.vblank_usec, fb.NUM_PORTS);
//console.log(Object.keys(yalp));
//console.log("yalp", {xres: yalp.xres, xblank: yalp.xblank, yres: yalp.yres, linelen: yalp.linelen, ppb: yalp.ppb, NUM_PORTS: yalp.NUM_PORTS, 'brlimit[0]': yalp.brlimit[0]}, srcline());
//[fb.xtotal, fb.ytotal] = [fb.xres + fb.xblank, fb.yres + fb.yblank];
//fb.univlen_t = Math.floor((fb.frtime_usec - 50) / 30); //allow 50 usec for WS281X latch
//fb.univlen_r = Math.floor(fb.xtotal * fb.yres / 3 / 24); //50 usec = 50/1.25 == 40 bits for WS281X latch
//fb.rowgap = fb.stride32 - fb.xres; //fb.xtotal; //memory wasted/padding on each raster scan line
//fb.numpx = fb.yres * fb.stride32;
//fb.ppb = 3; //SPI3x encoding
//console.log("fb", JSON.stringify(fb, (key, val) => (isUN(val, {}).length > 30)? `(${typeof val} len ${val.length})`: val, "  ")); //, Object.keys(fb));
    console.log("fb", util.formatWithOptions({maxArrayLength: 20, maxStringLength: 200, colors: true, getters: true}, fb)); //, Object.keys(fb));

    setImmediate(isMainThread? main: worker); //allow in-line init code to finish first
    return this; //fluent
}
setImmediate(custom); //call this in case caller doesn't; allow in-line init code to finish first


//CLI (debug):
if (!module.parent)
{
    console.log(`Use "npm test" instead of running index.js directly.`.brightCyan);
    console.log("exports:".brightBlue, Object.entries(module.exports).map(([key, val]) => truncate(`${key} = ${typeof val}: ` + fmt(val), 65)));
//    addon.start.call(new Date(), function(clock) { console.log(this, clock); }, 5);
//console.log("js ret");
//    module.exports.yalp({render: NOFUNC}); //kludge: allow clean exit
}
else debug("loaded by", module.parent.path);


//example web worker code at https://www.oreilly.com/library/view/multithreaded-javascript/9781098104429/ch04.html

//const stay_alive = setInterval(() => { /*console.log("alive");*/ }, 1e3); //kludge: keep process alive until async main finishes
async function main()
{
    debug("start");
//    const buffer = new SharedArrayBuffer(32); //1024);
//    const view = new Uint32Array(buffer);
//    jobctl.epoch = Date.now();
//    view[0] = view[1] = view[2] = 0;
    debug('first view', fb.numrd, fb.numwr, fb.numfr); //jobctl.numrd, jobctl.numwr, jobctl.numcycle);
//    fb.job_count = fb.job_wait = fb.job_busy = 0; //add wker stats
    (OPTS.startup || NOFUNC)();
//    if (OPTS.brlimit) fb.brlimit.fill(OPTS.brlimit);
//    jobctl.numrd = jobctl.numwr = 0;
    nodes1D.fill(0); //start all WS px off
    nodes1D.dump();

    if (!OPTS.render) throw "render() needed from caller".brightRed;
    for (let i = 0; i < OPTS.num_wkers || 0; ++i) cre_wker();
//    if (!cre_wker.all.length) await work(); //optional: main thread can be a worker also
//    setTimeout(() =>
//    setInterval(() =>
//    {
//      console.log('later', Atomics.load(view, 0), buffer.foo, srcline());
//      console.log('prop', buffer.foo, srcline());
//      worker.unref();
//    }, 500);

//  fb.wait4sync(); //start with clean time slice
//    for (let port = 0; port < NUM_PORTS; ++port) fb.limit[port] = 3 * 256 * 1/2; //50% brightness
//  for (let ofs = 0; ofs < 256/10; ++ofs)
//  {
//      for (let port = 0; port < NUM_PORTS; ++port)
//      {
//          nodes2D[port][port + ofs + 0] = 0;
//          nodes2D[port][port + ofs + 1] = 0x030000;
//          nodes2D[port][port + ofs + 2] = 0x000300;
//          nodes2D[port][port + ofs + 3] = 0x000003;
//      }
//      console.log("frame", ofs);
//      await redraw(100); //1e3);
//eak;
//  }
    const started = Date.now();
    await fb.main(nodes1D, 256/10);
    await Promise.all(cre_wker.all || [work()]); //wait for wkers to finish; run on fg if !wkers
    const run_time = Date.now() - started;
    nodes1D.dump();
    debug("perf stats:".brightCyan);
    debug(`job: #total ${fb.job_count}, avg wait ${(fb.job_wait / fb.job_count).toFixed(3)} sec, avg busy ${(fb.job_busy / fb.job_count).toFixed(3)} sec`);
    debug(`update: #total ${fb.upd_count}, avg idle ${(fb.upd_idle / fb.upd_count).toFixed(3)} sec, avg pivot ${(fb.upd_pivot / fb.upd_count).toFixed(3)} sec, avg sync ${(fb.upd_sync / fb.upd_count).toFixed(3)} sec`);
    debug(`duration: ${(run_time / 1e3).toFixed(3)} sec, avg ${(run_time / 1e3 / fb.numfr).toFixed(3)}/frame`);
    debug("quit");
    (OPTS.quit || NOFUNC)();
//console.log(fb.line_length, fb.xres, fb.xtotal);
//    console.log("perf:", {busy_avg: Math.round(redraw.busy / redraw.count), sleep_avg: Math.round(redraw.sleep / redraw.count), count: redraw.count});
//    fb.brlimit = null; //deref before C++ dtor, else memory problems
//    fb.pxbuf = null;
//    fb = null;
    console.log("fix buf detach here".brightRed);
//    clearInterval(stay_alive); //allow process to exit
}
// /*await*/ main();
//process.exit();                              
//setImmediate(main); //allow in-line init to finish first

function X_worker()
{
//    let view;
    debug("start", workerData);
    parentPort.on('message', msg => debug("msg from parent:", msg)); //(buffer) =>
//    {
//      const view = new Uint32Array(buffer);
    work(); //view);
//      buffer.foo = 42;
//        setInterval(() =>
//        {
//            Atomics.add(view, 0, 2);
//            console.log('updated in worker', workerData, srcline());
//        }, 25);
//    const { arr } = data
//    console.log('modifying sharred array')
//    arr[0] = 1
//    parentPort.postMessage({})
//    });
    debug("ret");
}


function cre_wkers(shdata)
{
    const retval = new Promise((resolve, reject) =>
    {
        const wker = new Worker(__filename, {workerData: Object.assign({epoch: elapsed.started}, /*wker,shmbuf*/ shdata || {})}); //__dirname + '/worker-node.js');
        wker
            .on("message", msg => debug(`msg from wker ${wker.threadId}:`, msg))
            .on("error", err => { debug(`wker ${wker.threadId} error:`.brightRed, err); reject(); })
            .on("exit", code => { debug(`wker ${wker.threadId} exit`.brightGreen, code); resolve(code); });
//        worker.postMessage(buffer); //send shm buf
//        worker.unref();
    });
    (cre_wker.all || (cre_wker.all = [])).push(retval);
    return retval;
}


//rendering:
//can be called by main or worker threads
async function X_work() //shmbuf)
{
    const EOF = fb.NUMFR; //-1 >>> 0;
    debug("start working".brightCyan);
//    elapsed();
    let job_ready, upd_ready; //, now;
    job_ready = upd_ready = -Date.now();
    for (;;)
    {
        const numrd = fb.numrd_bump; //Atomics.add(shmbuf, 0, 1);
        if (numrd < NUM_PORTS)
        {
            let now = Date.now();
            fb.job_count_bump;
            fb.job_wait_bump = job_ready + now; job_ready = -now; //elapsed(elapsed.latest);
            const frtime = fb.numfr * 50; //shim 20 fps
            (OPTS.render || NOFUNC)(frtime, numrd); //port
            /*const numwr =*/ fb.numwr_bump; //Atomics.add(shmbuf, 1, 1);
            now = Date.now();
            fb.job_busy_bump = job_ready + now; job_ready = -now; //elapsed(elapsed.latest);
//            if (numwr+1 == NUM_PORTS)
//            {
//                now = Date.now();
//                jobctl.upd_count_bump;
//                jobctl.upd_idle_bump = upd_ready + now; upd_ready = -now;
//                if (jobctl.numcycle_bump+1 > 3) jobctl.numcycle = EOF; //_bump; //Atomics.add(shmbuf, 2, 1); //#cycles
//                pivot(frtime);
//                now = Date.now();
//                jobctl.upd_pivot_bump = upd_ready + now; upd_ready = -now;
//                jobctl.numrd = 0; //Atomics.store(shmbuf, 0, 0); //wipe out excess
//                await sync(frtime);
//                now = Date.now();
//                jobctl.upd_sync_bump = upd_ready + now; upd_ready = -now;
//                jobctl.numwr_bump = -6; //drop; //Atomics.add(shmbuf, 1, -6); //only remove jobs from completed cycle, preserve pre-completed work on next cycle
//                debug("allow next cycle".brightCyan); //"#wr bump back, new val:", shmbuf.numwr); //Atomics.load(shmbuf, 1));
//            }
//            elapsed();
        }
        else { debug(`wait, job# ${numrd}`); await sleep(1e3); }
        if (fb.numfr >= EOF) break; //Atomics.load(shmbuf, 2) > 5) break;
    }
    debug("all work done".brightCyan);
    process.exit();
}


/*
function pivot(frtime)
{
    const frnum = Math.floor(frtime / 50); //useless/shim
    debug(`pivot + reset #${frnum}`);
//    await sleep(3e3);
    fb.ws3x_pivot(nodes1D, pxbuf);
}


async function sync(frtime)
{
    const frnum = Math.floor(frtime / 50); //useless/shim
    debug(`sync + update #${frnum}`);
//    await sleep(8e3);
    await fb.await4sync(0, pxbuf);
}
*/


function X_cre_nodes(opts)
{
//const fbdev = [3, 2, 1, 0]
//    .map(fbnum => `/dev/fb${fbnum}`)
//    .find(fbname => fs.existsSync(fbname)); //use highest fb#
//const fb = new framebuffer(fbdev, "want_timing"); //'/dev/fb0');
//fb.ws_ppb = Math.round(1.25e6 / fb.pixclock);
//if (fb.xtotal % fb.ws_ppb) throw `fractional bit: xtotal ${fb.xtotal}/${fb.ws_ppb}`.brightRed;
//fb.univlen_t = Math.floor((fb.frtime_usec - 50) / 30); //allow 50 usec for WS281X latch
//fb.univlen_r = Math.floor((fb.xtotal * fb.ytotal / fb.ws_ppb - 50/1.25)/ 24); //50 usec = 50/1.25 == 40 bits for WS281X latch
//console.log(fb.toString());
//console.log(Object.keys(fb));
//console.log("fb", {fbdev, xres: `${fb.xres} + ${fb.xtotal - fb.xres}`, linelen32: u32ofs(fb.line_length), yres: `${fb.yres} + ${fb.ytotal - fb.yres}`, order: fb.order, /*red: fb.red.offset, green: fb.green.offset, blue: fb.blue.offset, alpha: fb.transp.offset, bpp: fb.bits_per_pixel, pixclock: fb.pixclock.toFixed(1), frtime_usec: fb.frtime_usec.toFixed(1),*/ fps: fb.fps.toFixed(2), univlen_t: fb.univlen_t, univlen_r: fb.univlen_r, vblank: ((fb.ytotal - fb.yres) * fb.xtotal * fb.pixclock / 1e6).toFixed(1)}, srcline());
//console.log({ws_ppb: 1.25e6 / fb.pixclock, ws_nodes_per_frame: [Math.floor((fb.frtime_usec - 50) / 30), Math.floor(fb.xtotal * fb.ytotal / (1.25e6 / fb.pixclock) / 24)]});
//fb.pxbuf is BGRA
//console.log(Object.keys(addon));
//console.log({path: addon.path}, srcline());
    const fb = module.exports.fb = new addon.FB(isMainThread? opts: {}); //{brlimit: 3 * 256 * 0.5}); //{fbnum: +fb.fbdev.last, xres: fb.xres, xblank: fb.xtotal - fb.xres, yres: fb.yres, linelen: fb.line_length, ppb: fb.ws_ppb});
//console.log("fb", Object.getOwnPropertyDescriptors(addon.FB.prototype), fb.fps, fb.frtime_usec, fb.vblank_usec, fb.NUM_PORTS);
//console.log(Object.keys(yalp));
//console.log("yalp", {xres: yalp.xres, xblank: yalp.xblank, yres: yalp.yres, linelen: yalp.linelen, ppb: yalp.ppb, NUM_PORTS: yalp.NUM_PORTS, 'brlimit[0]': yalp.brlimit[0]}, srcline());
//[fb.xtotal, fb.ytotal] = [fb.xres + fb.xblank, fb.yres + fb.yblank];
//fb.univlen_t = Math.floor((fb.frtime_usec - 50) / 30); //allow 50 usec for WS281X latch
//fb.univlen_r = Math.floor(fb.xtotal * fb.yres / 3 / 24); //50 usec = 50/1.25 == 40 bits for WS281X latch
//fb.rowgap = fb.stride32 - fb.xres; //fb.xtotal; //memory wasted/padding on each raster scan line
//fb.numpx = fb.yres * fb.stride32;
//fb.ppb = 3; //SPI3x encoding
//console.log("fb", JSON.stringify(fb, (key, val) => (isUN(val, {}).length > 30)? `(${typeof val} len ${val.length})`: val, "  ")); //, Object.keys(fb));
    console.log("fb", util.formatWithOptions({maxArrayLength: 20, maxStringLength: 200, colors: true, getters: true}, fb)); //, Object.keys(fb));
//process.exit();
//if (fb.xtotal % fb.ppb || fb.xtotal - fb.xres > fb.ppb / 3) throw `xtotal ${fb.xtotal} !multiple of ppb ${fb.ppb} or xblank ${fb.xtotal - fb.xres} exceeds ppb/3, WS data bits will drop`.brightRed;
//if (fb.vblank_usec < 50) throw `vblank ${fb.vblank_usec} usec too short for WS latch (must be >= 50 usec)`.brightRed;


//set up node buffers:
//const JOBCTL = "numrd, numwr, numcycle, job_count, job_wait, job_busy, upd_count, upd_idle, upd_pivot, upd_sync".split(/\s*,\s*/);
//const NUM_PORTS = 24; //one "universe" per port (bit plane)
    const [UNIV_LEN, NUM_PORTS] = [fb.UNIV_LEN, fb.NUM_PORTS]; //Math.min(fb.univlen_r, fb.univlen_t), fb.NUM_PORTS]; //max "universe" length determined by #GPU pixels available
//const NODE_SIZE = Uint32Array.BYTES_PER_ELEMENT;
    const shmbuf = module.exports.shmbuf = isMainThread? new SharedArrayBuffer(NUM_PORTS * L2pad(u32len(UNIV_LEN))): workerData.shmbuf; //allow sharing across threads/procs
    const nodes1D = module.exports.nodes1D = new Uint32Array(shmbuf); //allow sharing across threads/procs
    const nodes2D = module.exports.nodes2D = Array.from({length: NUM_PORTS}, (nodes, port) => new Uint32Array(nodes1D.buffer, port * L2pad(u32len(UNIV_LEN)), UNIV_LEN));
    console.log({nodes1D_bytelen: nodes1D.byteLength, NUM_PORTS, UNIV_LEN, univlen_L2pad: L2pad(u32len(UNIV_LEN))});
//const threadctl = new Uint32Array(new SharedArrayBuffer(u32len(2 + fb.numpx))); //reserve space for #reads, #writes; GPU pad
/*
const shmbuf = isMainThread? new SharedArrayBuffer(L2pad(u32len(JOBCTL.length)) + u32len(fb.numpx)): workerData.shmbuf;
const jobctl = new Uint32Array(shmbuf);
const pxbuf = new Uint32Array(jobctl.buffer, L2pad(u32len(JOBCTL.length))); //remainder are px for GPU
JOBCTL.forEach((name, inx, all) =>
{
    if (u32len(jobctl.byteLength) < all.length) throw `job ctl too short: ${u32len(jobctl.byteLength)} vs ${all.length} quadbytes`.brightRed;
    Object.defineProperties(jobctl,
    {
        [name]:
        {
            get() { return Atomics.load(this, inx); },
            set(newval) { Atomics.store(this, inx, newval); },
            enumerable: true,
        },
        [name + "_bump"]:
        {
            get() { return Atomics.add(this, inx, 1); },
            set(newval) { Atomics.add(this, inx, newval); },
            enumerable: false, //avoid accidental changes
        },
    });
});
*/
    nodes1D.fill = function(val) { for (let i = 0; i < this.length; ++i) this[i] = isUN(val, 0); return this; }
    nodes1D.dump = function()
    {
        const num_nodes = u32ofs(this.byteLength);
        for (let ofs = 0, previous = ""; ofs < num_nodes; ofs += 16)
        {
            const next = this.slice(ofs, ofs + 16).map(val => hex(val));
            if (!ofs || previous != next.join(" ")) console.log(`nodes[${commas(ofs)}/${commas(num_nodes)}]:`, ...next); 
            previous = (ofs < num_nodes - 16)? next.join(" "): "";
        }
    }
if (false) //tests
{
//    console.log({px0: hex(fb.pxbuf[0]), px1: hex(fb.pxbuf[1]), px2: hex(fb.pxbuf[2]), px3: hex(fb.pxbuf[3])});
//    fb.pxbuf[0] = 0xffffffff;
//    fb.pxbuf[1] = 0xff0000ff;
//    fb.pxbuf[2] = 0x00ff00ff;
//    fb.pxbuf[3] = 0x0000ffff;
//    console.log({px0: hex(fb.pxbuf[0]), px1: hex(fb.pxbuf[1]), px2: hex(fb.pxbuf[2]), px3: hex(fb.pxbuf[3])});
        const TEST1 = 0x111, TEST2 = 0x2345;
        nodes1D[1] = TEST1;
//console.log(hex(nodes2D[0][1]), srcline());
        if (nodes2D[0][1] != TEST1) throw ("test1 failed: " + hex(nodes2D[0][1]) + srcline()).brightRed;
        nodes2D[1][2] = TEST2;
//console.log(hex(nodes1D[u32ofs(L2pad(u32len(UNIV_LEN))) + 2]), srcline());
        if (nodes1D[u32ofs(L2pad(u32len(UNIV_LEN))) + 2] != TEST2) throw ("test2 failed: " + hex(nodes1D[u32ofs(L2pad(u32len(UNIV_LEN))) + 2]) + srcline()).brightRed;
    }
}


//TODO: double buffer?
//async function redrawa(delay)
//{
//    redraw(false);
//    await fb.await4sync(delay); //sleep(delay);
//}
//24-bit pivot into pxbuf:
//optional brightness limit
//optional delay
async function DEV_redraw(delay_msec)
{
//    const trace = [];
    const started = elapsed(); //Date.now();
    let bp = 0, eol = 0 + fb.xtotal; //rewind, set first gap
if (false) //too slow, but good enough for prototyping
{
    const cached = new Uint32Array(NUM_PORTS);
    for (let node = 0; node < UNIV_LEN; ++node)
    {
        for (let port = 0; port < NUM_PORTS; ++port) cached[port] = limit(nodes2D[port][node], port); //limit brightness + localize memory access for bit loop
        for (let pxbit = 0x800000; pxbit; pxbit >>= 1)
        {
            pxbuf[bp++] = -1; //start of bit
            let pxbits = 0xff000000;
            for (let port = 0, portbit = 1 << (NUM_PORTS - 1); port < NUM_PORTS; ++port, portbit >>= 1)
                if (cached[port] & pxbit) pxbits |= portbit;
            pxbuf[bp++] = pxbits; //live part of bit
            pxbuf[bp++] = 0xff000000; //end of bit
//            trace.push({count: redraw.count || 0, x: Math.floor(bp / fb.stride32), xres: fb.xres, y: bp % fb.stride32, yres: fb.yres, gap: eol, '@gap?': bp == eol});
            if (bp == eol) eol = fb.xtotal + (bp += fb.stride32 - fb.xtotal); //fb gap at end of each raster line
        }
    }
}
else { fb.ws3x_pivot(nodes1D, pxbuf); --bp; }
    const took = elapsed(started);
    ++redraw.count || (redraw.busy = redraw.sleep = 0, redraw.count = 1);
    redraw.busy += took;
    if (redraw.count == 1) console.log("redraw first eof:", {bp, x: `${bp % fb.stride32}/${fb.xres}`, y: `${Math.floor(bp / fb.stride32)}/${fb.yres}`, gaplen: fb.stride32 - fb.xtotal, took});
//    if (redraw.count == 1)
//    {
//        const dump = name2file("pivot.txt");
//        trace.forEach(px => dump.writeln(JSON.stringify(px)));
//        await dump.aclose(true);
//        console.log(`${commas(plural(dump.numlines))} line${plural.suffix} written to '${dump.name}'`);
//    }
//    else console.log("redraw", {count: redraw.count, took});
//const pxbuf = new Uint32Array(new SharedArrayBuffer(u32len(2) + yalp.yres * yalp.linelen)); //reserve space for #reads, #writes; GPU pad
    if (isUN(delay_msec)) return;
    await fb.await4sync(delay_msec, pxbuf);
    redraw.sleep += elapsed(started) - took;
}


//get RGB color components:
//NOTE: caller always uses ARGB byte order (for simplicity)
//#define cbyte_1ARG(val)  ((val) & 0xFF)
//#define cbyte_2ARGS(val, shift)  cbyte_3ARGS(val, shift, 0xFF)
//#define cbyte_3ARGS(val, shift, mask)  (shiftlr(val, shift) & (mask))
function A(color) { return (color >> 24) & 0xFF; }
function R(color) { return (color >> 16) & 0xFF; }
function G(color) { return (color >> 8) & 0xFF; }
function B(color) { return color & 0xFF; }
//#define brightness(color)  (R(color) + G(color) + B(color)) //approximation; doesn't use HSV space (for perf)
function Abits(color) { return color & 0xFF000000; } //cbyte(color, -24) //-Ashift)
//#define RGBbits(color)  ((color) & 0x00FFFFFF) //((color) & ~ABITS(0xFFffffff))
//#define Rbits(color)  ((color) & 0x00FF0000) //cbyte(color, -16) //-Rshift)
//#define Gbits(color)  ((color) & 0x0000FF00) //cbyte(color, -8) //-Gshift)
//#define Bbits(color)  ((color) & 0x000000FF) //cbyte(color, -0) //-Bshift)


//limit brightness:
//212 == 83% limit; max 60 => 50 mA / LED
//170 == 67% limit; max 60 => 40 mA / LED
//128 == 50% limit: max 60 => 30 mA / LED
function DEV_limit(color, port)
{
    const LIMIT3 = fb.brlimit[port];
    if (!LIMIT3) return color;
    const r = R(color), g = G(color), b = B(color);
    const br = r + g + b; //brightness(color);
    if (br <= LIMIT3/*_BRIGHTNESS * 3*/) return color; //TODO: maybe always do it? (to keep relative brightness correct)
//TODO: cache results?
//NOTE: palette-based nodes would make this more efficient
//    return toARGB(A(color), r, g, b);
//linear calculation is more efficient but less accurate than HSV conversion+adjust:
    const dimr = r * LIMIT3/*_BRIGHTNESS * 3*/ / br;
    const dimg = g * LIMIT3/*_BRIGHTNESS * 3*/ / br;
    const dimb = b * LIMIT3/*_BRIGHTNESS * 3*/ / br;
//debug("r %d * %d / %d => %d, g %d * %d / %d => %d, b %d * %d / %d => %d", r, 3 * LIMIT_BRIGHTNESS, br, dimr, g, 3 * LIMIT_BRIGHTNESS, br, dimg, b, 3 * LIMIT_BRIGHTNESS, br, dimb);
    return Abits(color) | (dimr << 16) | (dimg << 8) | (dimb << 0); //LIMIT3 / br < 1; don't need clamp()
}


//fb.pxbuf.fill(0);
//for (let nodeofs = 0; nodeofs < fb.univlen_r; ++nodeofs)
//   fb.pixbuf[72
//ports with 1 prop: use WS281X protocol (SPI 3x)
//ports with 2..4 props: use splitter protocol
//fb.setNode = function(univ, nodeofs, color)
//{
//    const chbit = 1 << (23 - univ); //channel bit
//    const xy = Math.floor(nodeofs / 72), x = xy % this.xtotal, y = Math.floor(xy / this.xtotal);
//    console.log({univ, nodeofs}, {x, y, chbit});
//}

//for (let x = 0; x < 16; ++x) { fb.pxbuf[3 * x] = 0x800000; 

    
    
//module mgmt:
//const addon = require('bindings')('yalp-addon');
//const utils = require("./utils");
//console.log(typeof debug, JSON.stringify(Object.keys(debug)));
//Object.assign(module.exports, addon); //, Debug); //re-export all add-on exports
//Object.defineProperty(module.exports, "debout", //kludge: export setter also
//{
//    get() { return addon.debout; },
//    set(newfd) { addon.debout = newfd; }, //console.log("new fd", typeof newfd, newfd); },
//    enumerable: true,
//});
//module.exports.pkgpath = require.resolve("./package.json"); //my_exports({yalp}); //https://stackoverflow.com/questions/10111163/in-node-js-how-can-i-get-the-path-of-a-module-i-have-loaded-via-require-that-is

//console.log(Object.keys(module.exports));
//{
//debug utils:
//added here so caller can use them without any additional requires()
//    debug, srcline,
//these are defined by addon:
//    cfg, //config info (isXWindows, noGUI, isXTerm, isSSH, isRPi)
//    WS281X, //high-level WS281X formatting
//    Pivot24, //24-bit parallel port
//    FBPixels: //unfmted screen I/O
//    GpuPort, //low-level GPIO
//});

//debug info:
//const started = Date.now();
//require('colors').enabled = true; //for console output (all threads)
//require("magic-globals"); //__file, __line, __stack, __func, etc
//const Path = require("path");
////const { format } = require('path');
//function debug(...args)
//{
//    console.log(...args, `$${addon.thrinx} T+${(Date.now() - started) / 1e3} ${srcline(+1)}`.brightBlue);
//}
//function srcline(nested)
//{
//    const caller = __stack[nested + 1 || 1];
//    const retval = `  @${Path.basename(caller.getFileName().replace(__filename, "me"))}:${caller.getLineNumber()}`;
//    return retval;
//}


//high-level WS281X formatting:
//function WS281X() { }

//function FBPixels() { }

//low-level GPIO:
//function GpuPort() { }


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// helpers:
//

function sleep(delay) { return new Promise(resolve => setTimeout(resolve, isUN(delay, 1e3))); }
//async function sleep(delay_msec) { return new Promise(resolve => setTimeout(resolve, delay_msec || 1e3)); }


function debug(...args)
{
//    args.forEach((arg, inx) => console.error("isbuf?", !isUN(isUN(arg, {}).byteLength)));
//    args.forEach((arg, inx) => !isUN(isUN(arg, {}).buffer) && args.splice(inx, 1, Object.assign({}, arg, {buffer: `(buffer bytelen ${arg.buffer.byteLength})`))));
    args.unshift(whoami());
    args.push(elapsed(), srcline(+1));
    return console.log(...args.map(arg => !isUN(isUN(arg, {}).buffer)? Object.assign({}, arg, {buffer: `(buffer bytelen ${arg.buffer.byteLength})`}): arg));
}
//function debug(...args)
//{
//    console.log(...args);
//    return args;
//}

function fmt(val)
{
//    return (Object.keys(val) || [val.toString()]).join(", ");
    return (typeof val == "object")? Object.keys(val).join(", "): val.toString();
}


function whoami() { return "[" + ["main-", "thread-"][+!!threadId] + threadId + "]"; } //isUN(workerData)? "[main]": `wker[${workerData.wker}]`; } 

//use consistent time base between JS and C++:
//function elapsed(when) { let now; return ((when || now || (now = Date.now())) - (elapsed.epoch || (elapsed.epoch = now || (now = Date.now())))) / 1e3; }
function TOMERGE_elapsed(started) { return !isUN(started)? fb.elapsed(started): fb.elapsed(); }
//function elapsed(...args) { return fb.elapsed.apply(fb, args); }
function elapsed(started) { return "T+" + (((elapsed.latest = Date.now()) - (started || elapsed.started)) / 1e3).toFixed(3); }
//function elapsed_str(when) { return (elapsed(when) / 1e3).toFixed(3); }


function u32len(bytelen) { return bytelen * Uint32Array.BYTES_PER_ELEMENT; }
function u32ofs(byteofs) { return Math.floor(byteofs / Uint32Array.BYTES_PER_ELEMENT); } //round down
function U32OFS(byteofs) { return Math.ceil(byteofs / Uint32Array.BYTES_PER_ELEMENT); } //round up

//reduce memory contention between threads:
function L2pad(len)
{
    const L2CACHELEN = 64; //RPi 2/3 reportedly have 32/64 byte cache rows; use larger size to accomodate both
    return Math.ceil(len / L2CACHELEN) * L2CACHELEN;
}

function truncate(val, len)
{
    return val
        .toString()
        .replace(new RegExp(`(?<=[^]{${len || 30},}\\b)[^]*$`), " ...");
}

//from https://stackoverflow.com/questions/8511281/check-if-a-value-is-an-object-in-javascript
function isobj(thing, objval)
{
//    const answer1 = (typeof thing == 'object' && thing !== null);
    const retval = (thing === Object(thing));
//    if (answer1 != answer2) throw `disagree: ${answer1} ${answer2}${srcline()}`.brightRed;
    return (objval === undefined)? retval: retval? objval: thing;
}

//check for undefined or null:
//based on https://stackoverflow.com/questions/2647867/how-can-i-determine-if-a-variable-is-undefined-or-null
function isUN(thing, unval)
{
    const retval = (thing == null);
    return (unval === undefined)? retval: retval? unval: thing;
}

function hex(val, pref) { return isUN(pref, "0x") + val.toString(16); }


//sec:
//function elapsed(started) { return started? elapsed.cached = (Date.now() - started) / 1e3: elapsed.cached; }

function numkeys(obj, filt) { return Object.keys(obj || {}).filter(filt || (() => true)).length; }

//satisfy grammar police:
function plural(num, single, multiple)
{
    if (!arguments.length) return plural.suffix;
    plural.suffix = (num == 1)? single || "": multiple || "s";
    return num; //allows inline usage
}


function srcline(depth)
{
//    const callers = __stack; //getter has overhead; save in temp
//    const NOSTKFR = {getFileName: () => `??DEPTH${nested}??`, getLineNumber: () => -1};
//    const level = (nested === undefined)? 0+1: //default = next level up
//        (nested == Math.trunc(nested))? nested + 1: //caller-specified depth
//        ((callers[Math.floor(nested)] || NOSTKFR).getFileName() == (callers[Math.ceil(nested)] || NOSTKFR).getFileName())? Math.ceil(nested) + 1: //caller optional 1 more level
//        Math.floor(nested) + 1; //caller
//    const retval = ` @${Path.basename((callers[level] || NOSTKFR).getFileName()/*.replace(srcline.me || __filename, "me")*/ || "?lambda?")}:${(callers[level] || NOSTKFR).getLineNumber()}`;
//    return retval;
    return ` @:${(__stack[depth + 1 || 1] || {getLineNumber: () => -1}).getLineNumber()}`;
}

function commas(n, quo)
{
    const retval = n.toLocaleString();
    return retval.match(/[^\d]/)? (quo || "") + retval + (quo || ""): retval;
}


function name2file(name, retry)
{
    if (retry) throw "need to use async aname2file()".brightRed;
//try to cre/open file, throws exc if fail:
    const retval = Object.assign(fs.createWriteStream(name /*, {emitClose: true}*/), {writeln, endln, name, numlines: 0, started: Date.now(), aclose})
        .on("error", (err) => console.log(`file '${name}' error: ${err}`.brightRed)); //kludge: prevent "unhandled error event" exceptions
//debout(typeof retval.writeln, typeof retval.name);
//    catch (exc) { debout("exc:".brightRed, exc); }
//    retval.write(" "); //kludge: try write to force error in case busy
//if (!retval.writeln) throwx("file retval broken");
//debug(typeof retval.writeln);
    return retval;

	async function aclose(want_summary)
	{
		if (want_summary)
		{
//		const is_json = this.name.match(/\.json$/i) && ;
			const numwr = this.numlines - 1; //don't count hdr
			this.writeln("");
			this.writeln(`"#total",${(typeof want_summary == "number")? want_summary: Array.isArray(want_summary)? want_summary.map(sum => isNaN(sum)? '"' + sum + '"': sum).join(','): numwr}`);
		}
		this.endln(); //show info
		this.end(); //??
		await this.close();
	}
	function endln(...args)
	{
		if (args.length) this.write(...args);
//TODO("caller choose whether to write summary msg");
		this.summary = `wrote ${commas(plural(this.numlines))} line${plural()} after ${commas(elapsed(this.started))} sec, check '${this.name}' for details ${srcline(+1)}`; //.brightCyan; //let caller choose whether to display or not
		return this.end("\n");
	}
	function writeln(buf, count)
	{
		this.write(buf);
		this.write("\n");
		if (!this.numlines) this.numlines = 0;
		this.numlines += count || isUN(buf, "").toString().split(/\r?\n/).length;
		return this; //fluent
	}
}


function extensions()
{
    Object.defineProperties(Array.prototype,
    {
        last: { get() { return this[this.length - 1]; }, },
    });
    [console.log_orig, console.log] = [console.log, function(...args)
    {
        const ANSI_re = /\x1B\[[\d;]+m/g;
        const colors = [];
//TODO: fix color stack
//        const cstk = [], rptANSI_re = new RegExp(`(^.*?)?(${ANSI_re.source})`, "g"), EOC = "39"; ///(^.*?)?(\x1B\[([\d;]+)m)/g, EOC = "39"; //"0";
//        const msg = (label + args.map((arg) => /*JSON.stringify*/escnp(arg)).join(" ") + caller).replace(rptANSI_re, (_, prefix, keep, code) => (code == EOC)? (cstk.pop(), /*`POP[${cstk.length}]` +*/ (cstk.last || /*keep*/ "")): (cstk.push(keep), /*`PUSH[${cstk.length} '${code}']` +*/ keep + (prefix || ""))).brightBlue;
        args.push("T+" + elapsed_str() + srcline(+1)); //.replace(/^\s/, "")); //show where called from + when
        args
            .forEach(arg => 
            {
                const found = isUN(arg, {}).match && arg.match(ANSI_re); //|| [])[0];
                if (found) colors.push(...found);
            });
//        console.error(colors.length, args.map(arg => (arg.match(ANSI_re) || []).join(",")).join(";"), srcline());
//        this.log_orig(JSON.stringify(colors), srcline());
//        this.log_orig(JSON.stringify(args), srcline());
        if (colors.length)
        {
            args.unshift(colors[0]); //extend first color to start of line
            args.push(colors.last); //turn off colors at end of line
        }
        return this.log_orig(...args.map((arg, inx) => isUN(arg, {}).replace? arg.replace(): arg));
    }];
}

//const s = new addon.testobj(5), s2 = new addon.testobj;
//addon.jsdebug(`s = ${s.i}, after func(5) = ${s.func(5)}, s = ${s.i}, s2 = ${s2.i}`);
}//ignore
//eof