#!/usr/bin/env node
//YALP controller
//Copyright (c) 2020 Don Julien
//Can be used for non-commercial purposes.
//
//History:
//ver 1.20.12 DJ 12/20/20  rework

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


/////////////////////////////////////////////////////////////////////////////////
////
/// controller
//

//RPi GPU restrictions:
//hres even
//hres = multiple of 16? 
//hres + 1 = multiple of 3 -for 2.4 MHz SPI to work with WS281X
//4x*3x/72 = univlen  => x = sqrt(72 * ulen/12)  -for 4:3 aspect ratio
//16n, 3n - 1
//hres:vres ~= 4:3 or other RPi aspect ratio (not sure how this is used)
//(hres + hpad) * vres / 72 determines max univ len + fps

if (false) //determine valid hres with above constraints:
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


function controller(opts)
{
    assert(isMainThread, "don't call controller() in worker threads".brightRed);
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
    if ((opts || {}).start_black !== false) ctlr.fill(BLACK); //start all dark
    if ((opts || {}).portids !== false) await portids(ctlr); //show port#s for easier wiring debug
    if ((opts || {}).delay) await ctlr.out(opts.delay);
//run tests before wkers start:
//    debug("blank all + portids");
//    for (let i = 0; i < 60; ++i)
//    {
//        ctlr.dirty = true;
//        await ctlr.out();
//    }
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
TODO("convert to pinout fx");
async function portids(ctlr)
{
//    Object.values(ports) //use all ports in case props assigned to incorrect port#s
//        .filter(dedup)
//        .forEach((port) =>
    for (let port = 0; port < 24; ++port)
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


//eof