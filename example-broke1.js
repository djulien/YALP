#!/usr/bin/env node
//YALP multi-core example

//"universe" mapping on RPi GPIO pins:
// YALP univ/port  func  GPIO  GW?  RPi Hdr
// [0] = R7 = GPIO27 (GEN2)
// [1] = R6 = GPIO26 (absent on GoWhoops board)
// [2] = R5 = GPIO25 (GEN6)
// [3] = R4 = GPIO24 (GEN5)
// [4] = R3 = GPIO23 (GEN4)
// [5] = R2 = GPIO22 (GEN3)
// [6] = R1 = GPIO21
// [7] = R0 = GPIO20
// [8] = G7 = GPIO19 (PWM)
// [9] = G6 = GPIO18 (GEN1)
// [10] = G5 = GPIO17 (GEN0)
// [11] = G4 = GPIO16
// [12] = G3 = GPIO15 (RXD0)
// [13] = G2 = GPIO14 (TXD0)
// [14] = G1 = GPIO13 (PWM)
// [15] = G0 = GPIO12 (PWM)
// [16] = B7 = GPIO11 (SPI_CLK)
// [17] = B6 = GPIO10 (SPI_MOSI)
// [18] = B5 = GPIO09 (SPI_MISO)
// [19] = B4 = GPIO08 (SPI_CE0_N)
// [20] = B3 = GPIO07 (SPI_CE1_N)
// [21] = B2 = GPIO06
// [22] = B1 = GPIO05
// [23] = B0 = GPIO04 (GPIO_GCLK)
//---------------------------------
//    H SYNC = GPIO03 (SCL1, I2C)
//    V SYNC = GPIO02 (SDA1, I2C)
//        DE = ID_SD (I2C ID EEPROM)
//     PXCLK = ID_SC (I2C ID EEPROM)

"use strict";
require('colors').enabled = true; //for console output (all threads)
//require("magic-globals"); //__file, __line, __stack, __func, etc
const {isMainThread, threadId, workerData, Worker, parentPort} = require('worker_threads');
//elapsed.started = isMainThread? Date.now(): workerData.epoch; //use same time base for all threads
//console.log("ex-here2", JSON.stringify(workerData), whoami(), srcline());
//const {debug, /*nodes1D, nodes2D,*/ UNIV_LEN, NUM_PORTS, NUM_WKERS, frtime_usec} = require("./index.js")
//    .custom({opts, main, worker}); //startup, render, quit});
const /*addon*/{NUM_PORTS, UNIV_LEN, frtime_usec, FPS, FB, debug, srcline, elapsed, isUN} = require("./index.js"); //require('bindings')('yalp-addon'); //.options({fbnum: 1}); //FB object
const NUM_WKERS = require("os").cpus().length; //1 thread per core
//console.log("ex-here3", whoami(), srcline());
debug("enter".brightMagenta, {NUM_PORTS, UNIV_LEN, frtime_usec, FPS, NUM_WKERS}); //, workerData});


//config options:
//TODO: put in .json file instead?
const cfg =
{
//    num_wkers: require("os").cpus().length, //1 thread per core
    brlimit: 3 * 256 * 0.5, //50%
//    univlen: layout.nodes,
};
//debug({cfg});


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// layout
//


//try to group related models onto same port? (to consolidate rendering logic)
const layout = asmap(Object.entries(ary(NUM_PORTS, (port) =>
({
//TBD
    num_nodes: port * 100, //400, //varied by port
}))));
//debug({layout});


//const models = ary(NUM_PORTS); //list of port#s
//[
//TBD
//];
//debug({models});


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// seq
//

const seq =
{
//TBD
    duration: 2500, //msec; == 50 fr @20 FPS
};
//debug({seq});


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// shared memory
//

//shared data buf:
//use shared memory to reduce serialization overhead between threads
//first part for job control/wker thread status, remainder for layout/model node rendering
//debug(isMainThread, workerData);
function wker_shmofs(wker) { return wker * L2pad(u32len(4)); } //byte ofs of wker shm data
function port_shmofs(port) { return port * L2pad(u32len(UNIV_LEN)); } //byte ofs of in-mem node buf for port
//const [wker_shmlen, port_shmlen] = [L2pad(u32len(4)), L2pad(u32len(UNIV_LEN))]; //pad to reduce memory conflicts between threads
//const shmbuf = isMainThread? new SharedArrayBuffer((NUM_WKERS + 1) * wker_shmlen + NUM_PORTS * port_shmlen): workerData.shmbuf; //allow sharing across threads/procs
const shmbuf = isMainThread? new SharedArrayBuffer(wker_shmofs(NUM_WKERS + 1) + port_shmofs(NUM_PORTS)): workerData.shmbuf; //allow sharing across threads/procs
//debug("shmbuf", {shmbuf_bytelen: shmbuf.byteLength, NUM_WKERS, wker_shmlen: wker_shmofs(1), NUM_PORTS, port_shmlen: port_shmofs(1)});
//thread status + control:
if (isMainThread? threadId: (threadId < 1 || threadId > NUM_WKERS))
    throw `threadid out of range: ${threadId} should be 0 for main, 1..${NUM_WKERS} for workers`.brightRed;
const wkstate = ary(NUM_WKERS + 1, wker => new Int32Array(shmbuf, wker_shmofs(wker), u32ofs(wker_shmofs(1)))); //main is 0, wkers are 1..n; At.notify() doesn't like uint32 so use int32
//const fbstate = ary_wrap(wkstate[0], "FRTIME_NUMRD, frtime, numrd, X, numwr, numfr, ENDIAN, last32, first32", "WANT_ATOMIC"); //needs to be atomic for multiple threads to access safely
const fbstate = ary_wrap(wkstate[0], "frtime, numrd, numwr, numfr", "WANT_ATOMIC"); //needs to be atomic for multiple threads to access safely
function is_rendering(numrd) { return isUN(numrd, fbstate.numrd) < NUM_PORTS; }
function is_ready(numwr) { return isUN(numwr, fbstate.numwr) >= NUM_PORTS; }
function is_eof(frtime) { return isUN(frtime, fbstate.frtime) >= seq.duration; }
//endian test:
//const NDN_TEST = 0x123456789ABCDEFn, [NDN_HI, NDN_LO] = u64split(NDN_TEST); //[Number(NDN_TEST >> 32n), Number(NDN_TEST & (1n << 32n - 1n))];
//const ONE_BE = 0x100000000n, ONE_LE = 1n;
//if (isMainThread) fbstate.ENDIAN = NDN_TEST; //also used by workers, but only needs to be set once
//const isLE = (u32(fbstate.first32) == NDN_LO && u32(fbstate.last32) == NDN_HI); //CAUTION: array is int32 (required by Atomics); must use u32 to get correct result
//const isBE = (u32(fbstate.first32) == NDN_HI && u32(fbstate.last32) == NDN_LO); //RPi seems to be big endian
//debug("endian test", {isLE, isBE, first32: hex(fbstate.first32), last32: hex(fbstate.last32), NDN_HI: hex(NDN_HI), NDN_LO: hex(NDN_LO)});
//if (isBE == isLE) throw `endian test broken: isLE/isBE ${isLE}/${isBE}, first/second ${hex(fbstate.first32)}/${hex(fbstate.last32)}, hi/lo ${hex(NDN_HI)}/${hex(NDN_LO)}`.brightRed;
//pixel/node rendering:
const nodes1D = new Uint32Array(shmbuf, wker_shmofs(NUM_WKERS + 1)); //in-memory copy of layout/model nodes, starts after worker state
const nodes2D = ary(NUM_PORTS, port => new Uint32Array(shmbuf, wker_shmofs(NUM_WKERS + 1) + port_shmofs(port), UNIV_LEN)); //nodes1D.buffer, port * L2pad(u32len(UNIV_LEN)), UNIV_LEN));
//debug("nodes", {nodes1D_len: u32ofs(nodes1D.byteLength), NUM_PORTS, UNIV_LEN, univlen_L2pad: port_shmofs(1)}); //L2pad(u32len(UNIV_LEN))});
nodes1D.fill = function(val = 0) { for (let i = 0; i < this.length; ++i) this[i] = val /*isUN(val, 0)*/; return this; }
nodes1D.dump = function()
{
//    const num_nodes = u32ofs(this.byteLength);
    for (let ofs = 0, previous = ""; ofs < this.length/*num_nodes*/; ofs += 16)
    {
        const next = this.slice(ofs, ofs + 16).map(val => hex(val));
        if (!ofs || previous != next.join(" ")) debug(`nodes[${commas(ofs)}/${this.length}]:`, ...next); 
        previous = (ofs < this.length - 16)? next.join(" "): ""; //force last row to show
    }
}
if (false) //dev test
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


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// thread control
//

setImmediate(() => isMainThread? main(): module.exports[workerData.entpt](workerData)); //worker); //allow in-line init code to finish first


async function main()
{
    debug("main start".brightMagenta);
    const fb = new FB({rdwr: true, brlimit: 3 * 256 * 0.5}); //{fbnum: +fb.fbdev.last, xres: fb.xres, xblank: fb.xtotal - fb.xres, yres: fb.yres, linelen: fb.line_length, ppb: fb.ws_ppb});
//    await startup();
    nodes1D.fill(); //start with all nodes off
    fbstate.frtime = fbstate.numrd = fbstate.numwr = fbstate.numfr = 0; //allow wkers to start rendering immediately - gives them a head start

//    debug("fbstate", fbstate.slice(0, 5));
//    debug(fbstate.FRTIME_NUMRD + "");
//    debug(fbstate.frtime_bump(), fbstate.frtime, u64split(fbstate.FRTIME_NUMRD, isBE)); //, fbstate.slice(0, 5));
//    debug(fbstate.numrd_bump(), fbstate.numrd, u64split(fbstate.FRTIME_NUMRD, isBE)); //, fbstate.slice(0, 5));
//    debug(fbstate.numwr_bump(), fbstate.numwr); //, fbstate.slice(0, 5));
//    debug(fbstate.numfr_bump(), fbstate.numfr); //, fbstate.slice(0, 5));
//    const [frtime, numrd, numwr, numfr] = fbstate;
//    if (frtime != 1 || numrd != 1 || numwr != 1 || numfr != 1) throw `bad fbstate1: ${frtime} ${numrd} ${numwr} ${numfr}`.brightRed;
//    const [frtime_pre, numrd_pre] = u64split(fbstate.FRTIME_NUMRD_bump(), isBE); //[Number(combo >> 32n), Number(combo & (1n << 32n - 1n))]; //split atomic value after read
//    const [frtime_upd, numrd_upd] = u64split(fbstate.FRTIME_NUMRD, isBE); //[Number(combo >> 32n), Number(combo & (1n << 32n - 1n))]; //split atomic value after read
//    if (frtime_pre != 1 || numrd_pre != 1 || frtime_upd != 1 || numrd_upd != 2) throw `bad fbstate2: ${frtime_pre} ${numrd_pre} ${frtime_upd} ${numrd_upd}`.brightRed;
//    fbstate.numwr_bump(25);
//    debug(fbstate.slice(0, 5));
//    fbstate.numwr_bump(-NUM_PORTS);
//    debug(fbstate.slice(0, 5));
//    if (fbstate.numwr != 1) throw "bad".brightRed;
    
//    debug("fbstate bump test", fbstate.FRTIME_NUMRD_bump(isBE? ONE_BE: ONE_LE), fbstate.FRTIME_NUMRD); //, fbstate.slice(0, 5));
//    const [frtime_upd, numrd_upd] = u64split(fbstate.FRTIME_NUMRD, isBE); //[Number(combo >> 32n), Number(combo & (1n << 32n - 1n))]; //split atomic value after read
//    if (frtime_upd || numrd_upd != 1) throw `bad fbstate/endian: ${hex(frtime_upd)} ${hex(numrd_upd)}`.brightRed;
//    debug("fbstate test", fbstate.frtime, fbstate.numrd);
//    if (fbstate.frtime || fbstate.numrd != 1) throw `bad fbstate/endian: ${hex(fbstate.frtime)} ${hex(fbstate.numrd)}`.brightRed;
//    fbstate.numrd = 0;

    for (let w = 0; w < -3+NUM_WKERS; ++w) /*await*/ cre_wker(worker, {shmbuf}); //, NUM_WKERS);
//    for (let frnum = 0;;) //NOTE: frtime is seq time, *not* current time
//    {
//        await Promise.all(models.map(model => render_model(frnum * frtime_usec / 1e6, model)).concat(fb.await4sync(pxbuf)));
//        const [more, err] = await Promise.all([render(frnum * frtime_usec / 1e6), await4sync(pxbuf)]);
//        if (!more || err < 0) break; //eof
//        pivot(nodes1D, pxbuf);
//    }
    const started = Date.now();
    const monitor = setInterval(progress, 1e3);
    await bkgloop_sim(); //fb.abkgloop(fbstate, nodes1D, seq.duration); //pivot + sync in bkg until eof
    clearInterval(monitor);
//    await quit();
    debug("wait for wkers to finish", cre_wker.all.length);
    await Promise.all(cre_wker.all || []); // || [work()]); //wait for wkers to finish; run on fg if !wkers
    progress("main done".brightMagenta);

    async function bkgloop_sim()
    {
        for (let fr = 0;; ++fr)
        {
            const was_ready = is_ready();
            if (was_ready) await asleep(0.5e3); //pivot placeholder
//        const ready = (fbstate.numwr >= NUM_PORTS); //all ports rendered
            const next_frtime = Math.round(frtime_usec * (fbstate.numfr_bump(10) + 1) / 1e3); //usec => msec; NOTE: expected wakeup, not necessarily actual wakeup time
//        const eof = next_frtime >= duration;
            debug("next frame: %d, rendering? %d, ready? %d, eof? %d", milli(next_frtime), is_rendering(), is_ready(), is_eof(next_frtime), fbstate.slice(0, 5));
//            if (was_ready) fbstate.FRTIME_NUMRD = next_frtime << 32; // numrd = 0; //ignore excess, allow render threads to resume; atomic upd frtime + numrd
            if (was_ready) [fbstate.numrd, fbstate.frtime] = [0, next_frtime]; //NOTE: workers ok if numrd == 0 < new frtime (frtime ignored ; 
//        if (eof) break;
//        if (!ready) continue;
            await asleep(1e3); //wait4sync placeholder
            debug("bkg resume, frtime", milli(next_frtime), is_eof(next_frtime), is_ready());
            if (is_eof(next_frtime)) return; //clearInterval(monitor);
            if (was_ready) fbstate.numwr_bump(-NUM_PORTS); //only remove jobs from completed cycle, preserve pre-completed work from next cycle
        }
    }

    function progress(label)
    {
        const [frtime, numrd, numwr, numfr] = fbstate.slice(0, 5);
        debug(label || "progress", {frtime: milli(frtime), numfr, duration: milli(seq.duration), eof: is_eof(frtime), numrd, is_rendering: is_rendering(numrd), NUM_PORTS, numwr, is_ready: is_ready(numwr), elapsed: milli(elapsed(started)), fbstate: fbstate.slice(0, 5)});
    }
}


my_export(worker);
async function worker(shdata = {})
{
    let now = Date.now();
    debug("wker start".brightMagenta, Object.keys(shdata));
    const mystate = ary_wrap(wkstate[threadId], "total, sleep, count, wait, busy"); //make this atomic if another thread will monitor this thread's workload
    mystate.count = mystate.wait = mystate.busy = 0;
    let chkpt = mystate.total = -now;
//    const isBE = (u32(fbstate.first32) == NDN_HI); //&& u32(fbstate.last32) == NDN_LO); //RPi seems to be big endian
    for (;;)
    {
//        debug("wker loop");
//        const numfr = fbstate.numfr;
  //      const combo =
  //      {
  //          val64: fbstate.NUMRD_bump, //only get+bump 1x; need to save value
  //          get numrd() { return this.val >> 32n; },
  //          get frtime() { return Number(this.val & 0xffffffffn); }, //numrd_bump_with_frtime();
  //      };
//        const combo = fbstate.numrd_frtime_bump(NUMRD_LSB), numrd = combo >> FRTIME_BITS, frtime = combo & (1 << FRTIME_BITS - 1); //24-bit msec frtime ~= 4.5 hr, 8-bit port# == 256 (only need 24)
//debug("fbstate", wkstate[0].slice(0, 5)); //[frtime, numrd, FRTIME_NUMRD, numwr, numfr, test]
//        const [frtime_pre, numrd_pre] = u64split(fbstate.FRTIME_NUMRD_bump(isBE? ONE_BE: ONE_LE), isBE); //[Number(combo >> 32n), Number(combo & (1n << 32n - 1n))]; //split atomic value after read
//        const [frtime_upd, numrd_upd] = u64split(fbstate.FRTIME_NUMRD, isBE); //[Number(combo >> 32n), Number(combo & (1n << 32n - 1n))]; //split atomic value after read
//debug("fbstate", wkstate[0].slice(0, 5)); //[frtime, numrd, FRTIME_NUMRD, numwr, numfr, test]
        const [frtime, numrd] = [fbstate.frtime, fbstate.numrd_bump()];
//        debug("wker fbstate", {eof: is_eof(frtime_pre), rendering: is_rendering(numrd_pre), isBE, frtime_pre, numrd_pre, frtime_upd, numrd_upd, frtime_sec: milli(frtime_pre), elapsed: milli(elapsed()), fbstate: fbstate.slice(0, 5)});
        debug("wker fbstate", {eof: is_eof(frtime), rendering: is_rendering(numrd), frtime, numrd, frtime_sec: milli(frtime), elapsed: milli(elapsed(-mystate.total)), fbstate: fbstate.slice(0, 5)});
//        if (numrd_upd != numrd_pre + 1) throw "endian update error".brightRed;
        if (is_rendering(numrd))
        {
            debug("wker render", numrd);
            ++mystate.count;
            now = Date.now();
            mystate.wait += chkpt + now; chkpt = -now;
//            const frtime = fb.numfr * 50; //shim 20 fps
            render_models(frtime, numrd); //port
//debug("fbstate", wkstate[0].slice(0, 5)); //[frtime, numrd, FRTIME_NUMRD, numwr, numfr, test]
            fbstate.numwr_bump(); //maube updates is_ready()
//debug("fbstate", wkstate[0].slice(0, 5)); //[frtime, numrd, FRTIME_NUMRD, numwr, numfr, test]
            now = Date.now();
            mystate.busy += chkpt + now; chkpt = -now;
            continue; //get more work; full throttle (no sleep)
        }
        if (is_eof(frtime)) break;
        ++mystate.sleep; //this should always happen; else render threads are too slow
        debug("wker sleep#%d on", mystate.sleep, milli(frtime));
//        const result = await asleep(1e3);
        const result = fbstate.frtime_sleep(frtime); //sleep until next frame requested
        debug("wker wake", result, mystate.sleep);
    }
    now = Date.now();
    mystate.wait += chkpt + now;
    mystate.total += now;
    debug("wker done".brightMagenta, {total_sec: milli(mystate.total), num_sleep: mystate.sleep, num_render: mystate.count, wait_sec: milli(mystate.wait), avg_wait: milli(mystate.wait / mystate.count), busy_sec: milli(mystate.busy), avg_busy: milli(mystate.busy / mystate.count)}); //{stats: mystate});
}


function cre_wker(entpt, shdata = {})
{
    const startup = (typeof entpt == "function")? [__filename, (module.exports[entpt.name] || whoops(entpt.name)).name]: [entpt.toString(), undefined];
    const retval = new Promise((resolve, reject) =>
    {
//const worker = new wt.Worker(path.resolve(path.join(__dirname, 'consoleissue-worker.js')));
//console.log("wk-here22", JSON.stringify(shdata), whoami(), srcline());
        const wkdata = Object.assign({epoch: elapsed.epoch, entpt: startup[1]}, /*wker,shmbuf*/ shdata); //copy, don't alter caller's shdata obj
//        debug("cre wker", typeof entpt, Object.keys(wkdata));
//console.log("wk-here2", JSON.stringify(wkdata), whoami(), srcline());
        const wker = new Worker(startup[0], {workerData: wkdata}); //__dirname + '/worker-node.js');
//         {workerData: {/*wker,*/ shmbuf, epoch: elapsed.started}})
        debug("created wker", wker.threadId);
        wker
            .on("message", msg => console.log(msg.italic)) //debug(`msg from wker ${wker.threadId}:`, msg))
            .on("error", err => { debug(`wker ${wker.threadId} error:`.brightRed, err); reject(); })
            .on("exit", code => { debug(`wker ${wker.threadId} exit`.brightGreen, code); resolve(code); });
//        worker.postMessage(buffer); //send shm buf
//        worker.unref();
    });
    (cre_wker.all || (cre_wker.all = [])).push(retval); //allow caller to wait for all workers to finish
    return retval;
    function whoops(name) { throw `worker func '${name}' must be exported`.brightRed; }
}


//async function startup()
//{
//TBD
//}


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// model rendering
//

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


//render all models for a port:
//can be single- or multi-threaded
//async function render(frtime)
//{
//    return (frtime < seq.duration)? Promise.all(models.map(model => render_model(frtime, model))): null;
//    layout[port].models
//        .forEach(model => render_model(frtime, model));
//}

//async function quit()
//{
//TBD
//}


//render models:
//render all models for a port (related models tend to be grouped by port)
/*async*/ function render_models(frtime, port)
{
//TBD
    const frnum = Math.round(frtime * 1e3 / frtime_usec); //Math.floor(frtime / 50); //TODO: round or floor?  do we want closest or latest?
    debug("render", {frnum, frtime: milli(frtime), port});
//    await sleep(5e3);
    nodes2D[port][port + frnum + 0] = 0;
    nodes2D[port][port + frnum + 1] = 0x030000;
    nodes2D[port][port + frnum + 2] = 0x000300;
    nodes2D[port][port + frnum + 3] = 0x000003;
}


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// helpers
//


//async sleep:
function asleep(delay = 1e3) { return new Promise(resolve => setTimeout(resolve, delay)); } //isUN(delay, 1e3))); }
//async function sleep(delay_msec) { return new Promise(resolve => setTimeout(resolve, delay_msec || 1e3)); }


function my_export(entpt) { Object.assign(module.exports, {[entpt.name]: entpt}); }


//const BE32 = true, LE32 = false;
function u64split(val64, swap)
{
//    debug(1n << 32n - 1n, 1 << 32 - 1, 0xffffffff, 0xffffffffn);
    const retval = [Number(val64 >> 32n), Number(val64 & 0xffffffffn)]; //broken: (1n << 32n - 1n))];
    return (swap)? retval.reverse(): retval;
}


function imported_instead()
{
//byte splitter:
const splitter =
{
    buf: new ArrayBuffer(4),
//    get buf() { return this.bytes; },
//no worky    uint32: new Uint32Array(this.bytes), //DataView(bytes),
//    view: new DataView(this.buf), //this.bytes),
//    read: function() { return this.view.getUint32(0, false); },
//    write: function(val) { this.view.setUint32(0, val, false); },
//    bytes: new Uint8Array(this.buf),
//kludge: can't use sibling buf member at instantiation time, so wrap with getters:
//    get view() { Object.defineProperty(this, "view", {value: new DataView(this.buf)}); return this.view; }, //replace getter with buffer after first time
    get bytes() { Object.defineProperty(this, "bytes", {value: new Uint8Array(this.buf)}); return this.bytes; }, //replace getter with buffer after first time
//    uint32: new Uint32Array(this.buf), //always little endian; see http://stackoverflow.com/questions/7869752/javascript-typed-arrays-and-endianness
    get uint32() { return this.view.getUint32(0, this.isLE); },
    set uint32(val) { this.view.setUint32(0, val, this.isLE); },
//determine endianness by trial & error (first time only), then replace with value:
//RPi is bi-endian (running as little endian); Intel is little endian; seems backwards?
    get isLE()
    {
        this.bytes.set([0x11, 0x22, 0x33, 0x44]);
        for (const [pattern, isle] of Object.entries({0x44332211: BE32, 0x11223344: LE32}))
        {
            Object.defineProperty(this, "isLE", {value: isle}); //NOTE: must replace property before using uint32 to avoid recursion
//console.log((pattern >>> 0).toString(16), isle, (this.uint32 >>> 0).toString(16), this.uint32 == pattern, this.isLE);
            if (this.uint32 != pattern) continue;
            debug("isLE? %d".blue_lt, this.isLE);
            return this.isLE;
        }
        throw `Can't determine endianness: 0x${this.uint32.toString(16)}`.red_lt;
    },
};
function debug(...args)
{
//    args.forEach((arg, inx) => console.error("isbuf?", !isUN(isUN(arg, {}).byteLength)));
//    args.forEach((arg, inx) => !isUN(isUN(arg, {}).buffer) && args.splice(inx, 1, Object.assign({}, arg, {buffer: `(buffer bytelen ${arg.buffer.byteLength})`))));
//    args.unshift(whoami());
    args.push(elapsed_str(), whoami(), srcline(+1));
    return console.log(...args.map(arg => !isUN(isUN(arg, {}).buffer)? Object.assign({}, arg, {buffer: `(buffer bytelen ${arg.buffer.byteLength})`}): arg));
}
function srcline(depth) { return ` @:${(__stack[depth + 1 || 1] || {getLineNumber: () => -1}).getLineNumber()}`; }
function broken_srcline(depth)
{
    const stkfr = __stack[depth + 1 || 1] || {getFilename: () => "??", getLineNumber: () => -1};
//    const util = require("util");
//    process.stdout.write(util.format(depth + 1 || 1, typeof (depth + 1 || 1), stkfr, typeof stkfr, "\n"));
//    return ` @:${(__stack[depth + 1 || 1] || {getLineNumber: () => -1}).getLineNumber()}`;
//    process.stdout.write(util.format(typeof stkfr, isobj(stkfr, stkfr.constructor.name) || "none", "\n"));
//    process.stdout.write(util.format(((stkfr || {}).getFilename || (() => "??"))(), "\n"));
//    process.stdout.write(util.format(((stkfr || {}).getLinenumber || (() => -1))(), "\n"));
//    try { return " @" + Path.basename(((stkfr || {}).getFilename || (() => "??"))()) + ":" + ((stkfr || {}).getLineNumber || (() => -1))(); }
//no worky    try { return " @" + Path.basename(stkfr.getFilename()) + ":" + stkfr.getLineNumber(); }
    try { return " @" + Path.basename(stkfr.getFilename()) + ":" + stkfr.getLineNumber(); }
    catch { return " @??:?"; }
}
//use consistent time base between JS and C++:
//function elapsed(when) { let now; return ((when || now || (now = Date.now())) - (elapsed.epoch || (elapsed.epoch = now || (now = Date.now())))) / 1e3; }
function TOMERGE_elapsed(started) { return !isUN(started)? fb.elapsed(started): fb.elapsed(); }
//function elapsed(...args) { return fb.elapsed.apply(fb, args); }
function elapsed(since)
{
    if (!elapsed.epoch) elapsed.epoch = (workerData || {}).epoch || Date.now(); //isMainThread? Date.now(): workerData.epoch; //use same time base for all threads
    return ((elapsed.latest = Date.now()) - (since || elapsed.epoch)); //use epoch if since !def *or* !init
}
//function elapsed_str(when) { return "T+" + milli(elapsed(when)); } //msec -> sec
//check for undefined or null:
//based on https://stackoverflow.com/questions/2647867/how-can-i-determine-if-a-variable-is-undefined-or-null
function isUN(thing, unval)
{
    const retval = (thing == null);
    return (unval === undefined)? retval: retval? unval: thing;
}
}// end of imported



//show val to 3 dec places:
function milli(n) { return (n / 1e3).toFixed(3); }

//function whoami() { return "[" + ["main-", "thread-"][+!!threadId] + threadId + "]"; } //isUN(workerData)? "[main]": `wker[${workerData.wker}]`; } 
function whoami() { return "$" + threadId + "MT".charAt(+!isMainThread); }


//populate a new array:
function ary(length, cre) { return Array.from({length}, (_, inx) => cre(inx)); }


//add named wrappers to typed array:
//atomic wrappers added: name for load/store, name_bump to add, name_sleep to wait
///*ary_wrap.*/ const WANT_ATOMIC = true;
//fbstate.numrd_bump_with_frtime = function(addval = 1n) //kludge: allow atomic access to (numfr, numrd) combined
//{
////    if (!this.buf64) this.buf64 = new Uint64Array(this.buffer, u32len(2), 1); //overlay 64-bit element onto 32-bit [2..3]
//    const retval = Atomics.add(this.buf64, 0, addval); //isUN(addval, 1n));
//    return { numrd: Number(retval >> 32n), frtime: Number(retval & 0xffffffffn), };
//};
//IEEE 754 standard: numbers as 64 bits, with number (fraction) in bits 51..0, exponent in bits 62..52, and sign in bit 63
function ary_wrap(ary32, names, want_atomic)
{
//    const retval = {ary32, ary64: new BigInt64Array(ary32.buffer)}; //NOTE: Atomics wants pure int-typed array (!uint); doesn't like added props so create a wrapper object
    const retval = Object.assign(ary32, {ary32, ary64: new BigInt64Array(ary32.buffer)}); //NOTE: Atomics wants int-typed array (!uint)
//    const ary_types = {64: BigUint64Array, 32: Uint32Array, 16: Uint16Array, 8: Uint8Array};
    names
        .split(/\s*,\s*/)
//        .map(name => ({name, bits: (name == name.toUpperCase())? 64: 32})) //TODO: maybe generalize by adding bit-size suffix to names and don't assume 32-bit typed array
        .map(name => ({name, bits: (name == name.toUpperCase())? 64: 32})) //TODO: maybe generalize by adding bit-size suffix to names and don't assume 32-bit typed array
//        .forEach(({name, bits}, inx, all) =>
        .forEach(({name, bits}) =>
        {
//            const [ARY, OFS, TYPE] = ["tary" + bits, "ofs" + bits, ary_types[bits]];
//            debug(ARY, OFS, TYPE, TYPE.name);
//            if (!retval[ARY]) [retval[ARY], retval[OFS]] = [new TYPE(tary.buffer), 0]; //, 0, 1); //kludge: overlay 64-bit elements to access pairs atomically
//            if (retval[OFS] >= retval[ARY].length) throw `${TYPE.constructor.name} ${retval[ARY].length} too short; needs to be >= ${retval[OFS] + 1}`.brightRed;
            const ONE = {32: 1, 64: 1n}[bits]; //kludge: can't mix data types
            const [inx, ary] = [(++retval["len" + bits] || (retval["len" + bits] = 1)) - 1, retval["ary" + bits]];
            if (inx >= ary.length) throw `${ary.constructor.name} len ${ary.length} too short; needs to be >= ${inx}`.brightRed; //retval[OFS] + 1}`.brightRed;
//            debug("wrap", want_atomic? [name, name + "_bump", name + "_sleep"]: [name]);
            Object.defineProperties(retval, want_atomic?
            {
                [name]:
                {
                    get() { return Atomics.load(ary, inx); }, //retval[ARY], retval[OFS]); },
//                    set(newval) { Atomics.store(retval[ARY], retval[OFS], newval); Atomics.notify(retval[ARY], retval[OFS]); }, //set + wake waiting threads
                    set(newval) { Atomics.store(ary, inx, newval); Atomics.notify(ary, inx); }, //set + wake waiting threads
                    enumerable: true,
                },
                [name + "_bump"]:
                {
//                    get() { return Atomics.add(this, inx, 1); },
//                    set(newval) { Atomics.add(this, inx, newval); },
//                   value: function(addval = TYPE(1)) { return Atomics.add(retval[ARY], retval[OFS], addval); }, //isUN(addval, 1)); },
                   value: function(addval = ONE) { return Atomics.add(ary, inx, addval); }, //isUN(addval, 1)); },
//                    enumerable: false, //avoid accidental changes
                },
                [name + "_sleep"]:
                {
//                    get() { return Atomics.add(this, inx, 1); },
//                    set(newval) { Atomics.wait(this, inx, newval, ); },
                    value: function(wantval, delay) { return Atomics.wait(ary, inx, wantval, delay); }, //retval[ARY], retval[OFS], wantval, delay); },
//                    enumerable: false, //avoid accidental changes
                },
            }:
            {
                [name]:
                {
                    get() { return ary[inx]; }, //retval[ARY][retval[OFS]]; },
                    set(newval) { ary[inx] = newval; }, //retval[ARY][retval[OFS]] = newval; },
                    enumerable: true,
                },
            } );
//            ++retval[OFS];
    });
    return retval; //tary; //no longer fluent
}


//from https://exploringjs.com/es2016-es2017/ch_shared-array-buffer.html
//TODO: also check https://github.com/lars-t-hansen/flatjs
//const UNLOCKED = 0;
//const LOCKED_NO_WAITERS = 1;
//const LOCKED_POSSIBLE_WAITERS = 2;
//lock() {
//    const iab = this.iab;
//    const stateIdx = this.ibase;
//    var c;
//    if ((c = Atomics.compareExchange(iab, stateIdx, // (A)
//    UNLOCKED, LOCKED_NO_WAITERS)) !== UNLOCKED) {
//        do {
//            if (c === LOCKED_POSSIBLE_WAITERS // (B)
//            || Atomics.compareExchange(iab, stateIdx,
//            LOCKED_NO_WAITERS, LOCKED_POSSIBLE_WAITERS) !== UNLOCKED) {
//                Atomics.wait(iab, stateIdx, // (C)
//                    LOCKED_POSSIBLE_WAITERS, Number.POSITIVE_INFINITY);
//            }
//        } while ((c = Atomics.compareExchange(iab, stateIdx,
//        UNLOCKED, LOCKED_POSSIBLE_WAITERS)) !== UNLOCKED);
//    }
//}
//unlock() {
//    const iab = this.iab;
//    const stateIdx = this.ibase;
//    var v0 = Atomics.sub(iab, stateIdx, 1); // A
//    // Wake up a waiter if there are any
//    if (v0 !== LOCKED_NO_WAITERS) {
//        Atomics.store(iab, stateIdx, UNLOCKED);
//        Atomics.wake(iab, stateIdx, 1);
//    }
//}

                 
//length conversions:
function u32len(bytelen) { return bytelen * Uint32Array.BYTES_PER_ELEMENT; }
function u32ofs(byteofs) { return Math.floor(byteofs / Uint32Array.BYTES_PER_ELEMENT); } //round down
function U32OFS(byteofs) { return Math.ceil(byteofs / Uint32Array.BYTES_PER_ELEMENT); } //round up

//reduce memory contention between threads:
function L2pad(len)
{
    const L2CACHELEN = 64; //RPi 2/3 reportedly have 32/64 byte cache rows; use larger size to accomodate both
    return Math.ceil(len / L2CACHELEN) * L2CACHELEN;
}


function u32(val) { return val >>> 0; }
function hex(val, prefix = "0x") { return /*isUN(pref, "0x")*/ prefix + u32(val).toString(16); } //force to uint32 for correct display value

//function asmap(namevals) { return namevals.reduce((map, [name, val]) => Object.assign(map, {[name]: val}), {}); }
function asmap(namevals, init) { return Object.assign(init || {}, ...namevals.map(([name, val]) => ({[name]: val}))); }


debug("TODO: move this to top".brightYellow);
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

//eof