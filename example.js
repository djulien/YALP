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
const {isMainThread, threadId, workerData, Worker_bk, parentPort} = require('worker_threads');
//console.log(Worker); //, srcline());
//elapsed.started = isMainThread? Date.now(): workerData.epoch; //use same time base for all threads
//console.log("ex-here2", JSON.stringify(workerData), whoami(), srcline());
//const {debug, /*pixels1D, pixels2D,*/ UNIV_LEN, NUM_PORTS, NUM_WKERS, frtime_usec} = require("./index.js")
//    .custom({opts, main, worker}); //startup, render, quit});
const /*addon*/{MAX_PORTS, UNIV_LEN, UNIV_PADLEN, frtime_usec: frtime_usec_from_api, FPS, /*FB,*/ brlimit, stats, statsdir, /*'FB.abkgloop': abkgloop,*/ fb, addr, debug, srcline, elapsed, isUN, Worker} = require("./index.js"); //.options({shmbuf()}); //require('bindings')('yalp-addon'); //.options({fbnum: 1}); //FB object
const frtime_usec = isMainThread? frtime_usec_from_api: workerData.frtime_usec; //kludge: need to make timing calculations consistent
const NUM_WKERS = require("os").cpus().length; //1 thread per core
//console.log("ex-here3", whoami(), srcline());
//debug("enter".brightMagenta, {MAX_PORTS, UNIV_LEN, frtime_usec, FPS, NUM_WKERS}); //, workerData});
//console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(fb)).map(method => (typeof fb[method]) + " " + method));
//process.exit();
//console.log(require('worker_threads').Worker, srcline());

//config options:
//TODO: put in .json file instead?
const cfg =
{
//    num_wkers: require("os").cpus().length, //1 thread per core
//    brlimit: 3 * 256 * 0.5, //50%
//    univlen: layout.pixels,
};
//debug({cfg});


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// layout
//


//cre one dummy model per every-third port:
//const models = ary(NUM_PORTS); //list of port#s
const models = ary(MAX_PORTS, inx => // / 2, inx => // / 3, inx =>
({
//TBD
    port: inx, //* 3,
    get num_pixels() { return (this.port || 1) * 100; }, //400, //varied by port
    brlimit: 3 * 256 * [1/2, 5/6, 1/10][inx % 3],
}));
//debug({models});
//TODO: try to group related models onto same port (to consolidate rendering logic)
//debug("models", models, new autoary());
const layout = models.reduce((byport, model) => ((byport[model.port] || (byport[model.port] = [])).push(model), byport), {}); //(byport[model.port].push(model), byport), new autoary()); //byport[model.port].push(model), new autoary());
const FIRST_PORT = 1 << (MAX_PORTS - 1); //0x800000;
const [NUM_PORTS, PORT_MASK] = [numkeys(layout), Object.keys(layout).reduce((bitmap, port) => bitmap | (FIRST_PORT >> port), 0)];
//debug(JSON.stringify({layout}));


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// seq
//

const seq =
{
//TBD
//duration controls bkg loop + render wkers
//render_time gives wkers a head-start
    duration: /*3.5*60e3 +*/3*150*51+ 2500, //msec; == 50 fr @20 FPS
    get render_time() { return this.duration + 100; }, //: /*3.5*60e3 +*/ 4000, //how long it takes wker threads to render all frames in this seq; comment out if < duration (no work-ahead needed); set to 2x duration to pre-render entire seq in memory
};
//debug({seq});
const NUMFR = Math.ceil(seq.duration * 1e3 / frtime_usec), WKAHEAD = Math.max(Math.ceil((seq.render_time || 0) * 1e3 / frtime_usec) - NUMFR, 0); //more accurate than FPS
debug("enter".brightMagenta, {MAX_PORTS, NUM_PORTS, PORT_MASK: hex(PORT_MASK), UNIV_LEN, padded: u32inx(portbytes(1)), frtime_usec, FPS, duration: milli(seq.duration), NUMFR, playback_delay: milli(Math.max(seq.render_time || 0) - seq.duration, 0), WKAHEAD, /*full_buf: NUMFR <= WKAHEAD, circ_buf: NUMFR > WKAHEAD,*/ NUM_WKERS}); //, workerData});
//  wkers             bkgloop
//  0..delay-1        hold
//  delay..dur-delay  0..dur


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// shared memory
//


//debug(workerData);
//frame buffer fifo:
//frifo has 1 frbuf for each wkahead + 1 working frbuf for render (bkg loop !allowed to use last one)
//each frbuf = #ports * univlen (padded for L2 cache)
//uses shared memory to avoid serialization overhead between threads
//
//function port_shmofs(port) { return port * L2pad(u32len(UNIV_LEN)); } //byte ofs pixelbuf for port
//function frbuf_shmofs(frbuf) { return frbuf * port_shmofs(NUM_PORTS); } //byte ofs pixels for frame
const FIFOLEN = NUMFR; //wrong: WKAHEAD;
function portbytes(port) { return port * u32bytes(UNIV_PADLEN); } //L2pad(u32bytes(UNIV_LEN)); } //padded to reduce cache contention between threads
const frbufs = isMainThread? new SharedArrayBuffer(portbytes((FIFOLEN + 1) * NUM_PORTS)): workerData.frbufs;
//const frifo = ary(WKAHEAD + 1, frbuf => new Uint32Array(frbufs, u32len(portofs32(frbuf * NUMPORTS)), portofs32(NUM_PORTS))));
const frifo = new Uint32Array(frbufs); //, 0, u32inx(portbytes(Math.max(WKAHEAD, 1) * NUM_PORTS))); //each frame buf consists of NUM_PORTS port bufs, each port buf consists of UNIV_LEN (padded) u32 values; exclude working copy @end
debug("frifo", {bytes: frifo.byteLength, len32: frifo.length, portbufs: frifo.byteLength / portbytes(1), frbufs: frifo.byteLength / portbytes(NUM_PORTS), wkbuf_ofs: u32inx(portbytes(FIFOLEN * NUM_PORTS)), addr: hex(fb.addr(frifo))});

//last frbuf used as working copy for pixel rendering:
//working copy becomes last frbuf
const pixels1D = new Uint32Array(frbufs, portbytes(FIFOLEN * NUM_PORTS)); //1 frbuf at end for rendering
//debug(pixels1D.length, pixels1D.byteLength);
const pixels2D = ary(NUM_PORTS, portinx => new Uint32Array(frbufs, portbytes(FIFOLEN * NUM_PORTS + portinx), UNIV_LEN)); //pixels1D.buffer, port 
debug("here2");
function enque(frnum, portinx)
{
    if (!FIFOLEN) return; // just pass working copy to bkg loop (not a good idea?)
//    if (frnum >= NUMFR && NUMFR <= WKAHEAD) return; //leave last frame in work buf if !wrap
    const [to, from_begin, from_end] = [frnum % FIFOLEN * NUM_PORTS + portinx, FIFOLEN * NUM_PORTS + portinx, FIFOLEN * NUM_PORTS + portinx + 1].map(ofs => u32inx(portbytes(ofs)));
//    if (portinx < 2 || portinx > 6) debug("enque: copy from %s..%s (len %s) to %s", from_begin, from_end, from_end - from_begin, to); //use %s because debug converts args to str
    frifo.copyWithin(to, from_begin, from_end); //place rendered port pixels into frifo; wrap (circular fifo)
}

//renderer thread data:
//first part for job control/wker thread status, remainder for layout/model pixel rendering
//debug(isMainThread, workerData);
//function wker_shmofs(wker) { return wker * L2pad(u32bytes(4)); } //byte ofs of wker shm data
//const [wker_shmlen, port_shmlen] = [L2pad(u32len(4)), L2pad(u32len(UNIV_LEN))]; //pad to reduce memory conflicts between threads
//const shmbuf = isMainThread? new SharedArrayBuffer((NUM_WKERS + 1) * wker_shmlen + NUM_PORTS * port_shmlen): workerData.shmbuf; //allow sharing across threads/procs
//const wkstats = isMainThread? new SharedArrayBuffer(u32bytes(7)): workerData.wkstats; //wker_shmofs(1) + port_shmofs(NUM_PORTS)): workerData.shmbuf; //allow sharing across threads/procs
//debug("shmbuf", {shmbuf_bytelen: shmbuf.byteLength, NUM_WKERS, wker_shmlen: wker_shmofs(1), NUM_PORTS, port_shmlen: port_shmofs(1)});
//thread status + control:
//if (isMainThread? threadId: (threadId < 1 || threadId > NUM_WKERS))
//    throw `threadid out of range: ${threadId} should be 0 for main, 1..${NUM_WKERS} for workers`.brightRed;
//const wkstate = ary(NUM_WKERS + 1, wker => new Int32Array(shmbuf, wker_shmofs(wker), u32bytelen(wker_shmofs(1)))); //main is 0, wkers are 1..n; At.notify() doesn't like uint32 so use int32
//const fbstate = ary_wrap(wkstate[0], "FRTIME_NUMRD, frtime, numrd, X, numwr, numfr, ENDIAN, first32, last32, upd_total, upd_count, upd_idle, upd_pivot, upd_sync", "WANT_ATOMIC"); //needs to be atomic for multiple threads to access safely; upd_* set by bkgloop
const wkstate = ary_wrap(/*new Int32Array(stats.buffer)*/ stats, statsdir, "want_atomic"); //atomics req int array !uint array; //"frtime, numrd, numfr, total, count, wait, busy");
//debug(wkstate.byteLength, Object.keys(wkstate).join(",").brightRed);
//function is_rendering(numrd) { return isUN(numrd, wkstate.numrd) < NUM_PORTS; } //loop_total, loop_count, loop_idle, loop_pivot, loop_sync, render_total, render_count, render_idle, render_busy, first32, last32
//wkstate.is_ready = function(numrd) { return isUN(numrd, this.render_count) >= NUM_PORTS; }
//wkstate.is_eof = function(frtime) { return isUN(frtime, this.render_total) >= seq.duration; }
//function debug_wkstate(...args) { return debug(...args, "ready?", is_ready(), "eof?", is_eof(), Object.values(wkstate.slice(0, 6)), srcline(+1)); }
//endian test:
//const NDN_TEST = 0x123456789ABCDEFn, [NDN_HI, NDN_LO] = u64split(NDN_TEST); //[Number(NDN_TEST >> 32n), Number(NDN_TEST & (1n << 32n - 1n))];
//const ONE_BE = 1n, ONE_LE = 0x100000000n; //put 0 in first u32, 1 in last u32
//if (isMainThread) fbstate.ENDIAN = NDN_TEST; //also used by workers, but only needs to be set once
//const isBE = (u32(fbstate.first32) == NDN_HI && u32(fbstate.last32) == NDN_LO); //CAUTION: array is int32 (required by Atomics); must use u32 to get correct result
//const isLE = (u32(fbstate.first32) == NDN_LO && u32(fbstate.last32) == NDN_HI); //RPi seems to be little endian
////const ONE = isLE? 0x100000000n: 1n;
//debug("endian test", {isLE, isBE, first32: hex(fbstate.first32), last32: hex(fbstate.last32), NDN_HI: hex(NDN_HI), NDN_LO: hex(NDN_LO)});
//if (isBE == isLE) throw `endian test broken: isLE/isBE ${isLE}/${isBE}, first/second ${hex(fbstate.first32)}/${hex(fbstate.last32)}, hi/lo ${hex(NDN_HI)}/${hex(NDN_LO)}`.brightRed;
//pixel/pixel rendering:
//const pixels1D = new Uint32Array(shmbuf, wker_shmofs(1)); //NUM_WKERS + 1)); //in-memory copy of layout/model pixels, starts after worker state
//const pixels2D = ary(NUM_PORTS, port => new Uint32Array(shmbuf, wker_shmofs(/*NUM_WKERS +*/ 1) + port_shmofs(port), UNIV_LEN)); //pixels1D.buffer, port * L2pad(u32len(UNIV_LEN)), UNIV_LEN));
//debug("pixels", {pixels1D_len: u32bytelen(pixels1D.byteLength), NUM_PORTS, UNIV_LEN, univlen_L2pad: port_shmofs(1)}); //L2pad(u32len(UNIV_LEN))});

//pixels1D.fill = function(val = 0) { for (let i = 0; i < this.length; ++i) this[i] = val /*isUN(val, 0)*/; return this; }
frifo.dump = pixels1D.dump = function(label)
{
//    const num_pixels = u32bytelen(this.byteLength);
    debug(label || "", `dump 0..${this.length}`, srcline(+1));
    for (let ofs = 0, previous = ""; ofs < this.length/*num_pixels*/; ofs += 16)
    {
        const next = Array.from(this.slice(ofs, ofs + 16), val => hex(val)); //kludge: need to copy slice to regular array in order to keep str fmt
        if (!ofs || previous != next.join(" ")) debug(`pixels[${commas(ofs)}/${this.length}] @${hex(fb.addr(pixels1D) + u32bytes(ofs))}:`, ...next); 
        previous = (ofs < this.length - 16)? next.join(" "): ""; //force last row to show
    }
    debug(label || "", "dumped", srcline(+1));
}
if (false) //dev test
{
//    console.log({px0: hex(fb.pxbuf[0]), px1: hex(fb.pxbuf[1]), px2: hex(fb.pxbuf[2]), px3: hex(fb.pxbuf[3])});
//    fb.pxbuf[0] = 0xffffffff;
//    fb.pxbuf[1] = 0xff0000ff;
//    fb.pxbuf[2] = 0x00ff00ff;
//    fb.pxbuf[3] = 0x0000ffff;
//    console.log({px0: hex(fb.pxbuf[0]), px1: hex(fb.pxbuf[1]), px2: hex(fb.pxbuf[2]), px3: hex(fb.pxbuf[3])});
    debug("pixels1D@", hex(fb.addr(pixels1D)), "pixels2D@", hex(fb.addr(pixels2D[0])));
    const TEST1 = 0x111, TEST2 = 0x2345;
    pixels1D[1] = TEST1;
//console.log(hex(pixels2D[0][1]), srcline());
    if (pixels2D[0][1] != TEST1) throw ("test1 failed: " + hex(pixels2D[0][1]) + srcline()).brightRed;
//    else debug("test1 pass".brightGreen);
    pixels2D[1][2] = TEST2;
//console.log(hex(pixels1D[u32bytelen(L2pad(u32len(UNIV_LEN))) + 2]), srcline());
    if (pixels1D[u32inx(portbytes(1)) + 2] != TEST2) throw ("test2 failed: " + hex(pixels1D[u32inx(portbytes(1)) + 2]) + srcline()).brightRed;
//    else debug("test2 pass".brightGreen);
    pixels1D.dump();
}


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// thread control
//

setImmediate(() => isMainThread? main(): module.exports[workerData.entpt](workerData)); //worker); //allow in-line init code to finish first


async function main()
{
    debug("main start".brightMagenta, fb.constructor.name);
//    const fb = new FB({rdwr: true, brlimit: 3 * 256 * 0.5}); //{fbnum: +fb.fbdev.last, xres: fb.xres, xblank: fb.xtotal - fb.xres, yres: fb.yres, linelen: fb.line_length, ppb: fb.ws_ppb});
//    await startup();
    pixels1D.fill(0); //start with all pixels off
    Object.entries(layout).forEach(([port, models]) => brlimit[port] = models[0].brlimit); //{ debug(port, JSON.stringify(models), (models[0] || {}).brlimit); brlimit[port] = models[0].brlimit; });
//    debug(JSON.stringify(brlimit).brightRed);
//    wkstate.frtime = wkstate.numrd = wkstate.total = wkstate.count = wkstate.wait = wkstate.busy = 0; //clear stats + job control
    wkstate.fill(0); //clear job control + perf stats
//    debug(wkstate.byteLength, Object.keys(wkstate).join(", ").brightRed);
//    const bkgstate = ary_wrap(new Uint32Array(bkgstats), "upd_total, upd_count, upd_idle, upd_pivot, upd_sync");

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
    
//    debug("fbstate bump test", fbstate.FRTIME_NUMRD_bump(isLE? ONE_LE: ONE_BE), fbstate.FRTIME_NUMRD); //, fbstate.slice(0, 5));
//    const [frtime_upd, numrd_upd] = u64split(fbstate.FRTIME_NUMRD, isLE); //[Number(combo >> 32n), Number(combo & (1n << 32n - 1n))]; //split atomic value after read
//    if (frtime_upd || numrd_upd != 1) throw `bad-1 fbstate/endian: ${hex(frtime_upd)} ${hex(numrd_upd)}`.brightRed;
//    debug("fbstate test", fbstate.frtime, fbstate.numrd);
//    if (fbstate.frtime || fbstate.numrd != 1) throw `bad-2 fbstate/endian: ${hex(fbstate.frtime)} ${hex(fbstate.numrd)}`.brightRed;
//    fbstate.numrd = 0;

    const frbufs_excl_wkbuf = new Uint32Array(frbufs, 0, u32inx(portbytes(Math.max(FIFOLEN, 1) * NUM_PORTS)));
    (cre_wker.all || (cre_wker.all = [])).push(fb.abkgloop(frbufs_excl_wkbuf, seq.duration, PORT_MASK)); //also wait for bkg loop to finish
    for (let w = 0; w < -3+NUM_WKERS; ++w) /*await*/ cre_wker(worker, {frbufs, frtime_usec}); //, wkstats}); //{shmbuf}); //, NUM_WKERS); //CAUTION: wkers will start (pre-)rendering immediately; delay bkg loop until enough frbufs are queued
//    for (let frnum = 0;;) //NOTE: frtime is seq time, *not* current time
//    {
//        await Promise.all(models.map(model => render_model(frnum * frtime_usec / 1e6, model)).concat(fb.await4sync(pxbuf)));
//        const [more, err] = await Promise.all([render(frnum * frtime_usec / 1e6), await4sync(pxbuf)]);
//        if (!more || err < 0) break; //eof
//        pivot(pixels1D, pxbuf);
//    }
    const started = Date.now();
    const monitor = setInterval(progress, 1e3); progress("starting");
//    const result = fbstate.numfr_sleep(0); //sleep until first frame rendered (to give wkers head start); CAUTION: blocks main thread?
//    await false? bkgloop_sim(): fb.abkgloop(fbstate, pixels1D, seq.duration); //pivot + sync in bkg until eof
//    await quit();
    debug("wait for %s wkers + bkg loop to finish", cre_wker.all.length); //CAUTION: debug() changes arg to str
    await Promise.all(cre_wker.all || []); // || [work()]); //wait for wkers to finish; TODO: run on fg if !wkers?
    debug("wkers done");
    clearInterval(monitor);
    progress("main done".brightMagenta);
//    debug("wker done".brightMagenta, {total_sec: milli(mystate.total), num_sleep: mystate.sleep, num_render: mystate.count, wait_sec: milli(mystate.wait), avg_wait: milli(mystate.wait / mystate.count), busy_sec: milli(mystate.busy), avg_busy: milli(mystate.busy / mystate.count)}); //{stats: mystate});
//    fbprogress("loop done".brightMagenta);

    async function TBD_bkgloop_sim()
    {
        bkgloop_sim.active = true;
        for (let frnum = 0;; frnum += 10)
        {
            const was_ready = is_ready();
            if (was_ready) await asleep(0.5e3); //pivot placeholder
//        const ready = (fbstate.numwr >= NUM_PORTS); //all ports rendered
            const next_frtime = Math.round(frtime_usec * (fbstate.numfr = frnum + 1) / 1e3); //usec => msec; NOTE: expected wakeup, not necessarily actual wakeup time
//        const eof = next_frtime >= duration;
//            debug("next frame: %d, rendering? %d, ready? %d, eof? %d", milli(next_frtime), is_rendering(), is_ready(), is_eof(next_frtime), fbstate.slice(0, 5));
            debug_state("bkgloop next frame", milli(next_frtime));
            if (was_ready) fbstate.FRTIME_NUMRD = BigInt(next_frtime); //RPi is little endian; u64join([next_frtime, 0], isLE); //ignore excess, allow render threads to resume; atomic upd frtime + numrd
//        if (eof) break;
//        if (!ready) continue;
            await asleep(1e3); //wait4sync placeholder
//            debug("bkg resume, frtime", milli(next_frtime), is_eof(next_frtime), is_ready());
            if (is_eof(next_frtime)) return; //clearInterval(monitor);
            if (was_ready) fbstate.numwr_bump(-NUM_PORTS); //only remove jobs from completed cycle, preserve pre-completed work from next cycle
        }
    }

    function progress(label)
    {
//        const [frtime, numrd, numwr, numfr] = fbstate.slice(0, 5);
//        debug(label || "progress", {frtime: milli(frtime), duration: milli(seq.duration), eof: is_eof(frtime), numrd, is_rendering: is_rendering(numrd), NUM_PORTS, numwr, is_ready: is_ready(numwr), numfr, elapsed: milli(elapsed(started)), fbstate: fbstate.slice(0, 5)});
//        debug_wkstate(label || "progress");
//        if (fbstate.numfr && !bkgloop_sim.active) //bkgloop_sim(); //wait until first frame rendered (to give wkers head start)
//            fb.abkgloop(fbstate, pixels1D, seq.duration); //pivot + sync in bkg until eof
//delay_ready, delay_total, delay_count, loop_total, loop_count, loop_idle, loop_pivot, loop_sync, render_total, render_count, render_idle, render_busy, first32, last32' 
        const {delay_count, delay_total, delay_ready, first32, last32, //} = wkstate;
            render_count, render_total, render_idle, render_busy, //} = wkstate;
            loop_count, loop_total, loop_idle, loop_pivot, loop_sync, loop_update} = wkstate;
//        debug(label || "progress", "delay", {frames: delay_count, time_avg: milli(delay_total / delay_count), time_total: milli(delay_total)},
//              /*"wk-ready?", wkstate.is_ready(), "wk-eof?", wkstate.is_eof(), "wkstate",*/ 
//              "wkers", {frames: render_count, render_frtime: milli(render_count * frtime_usec / 1e3), time_avg: milli(render_total / render_count), time_total: milli(render_total), idle_avg: milli(render_idle / render_count), idle_total: milli(render_idle), busy_avg: milli(render_busy / render_count), busy_total: milli(render_busy)},
//              "bkg loop", {frames: loop_count, sync_frtime: milli(loop_count * frtime_usec / 1e3), time_avg: milli(loop_total / loop_count), time_total: milli(loop_total), idle_avg: milli(loop_idle / loop_count), idle_total: milli(loop_idle), pivot_avg: milli(loop_pivot / loop_count), pivot_total: milli(loop_pivot), sync_avg: milli(loop_sync / loop_count), sync_total: milli(loop_sync)},
//              "endian", {first32: hex(first32), last32: hex(last32)}, (first32 == 0x1234567)? "BE": "LE",
//              "raw", wkstate.slice());
//        pixels1D.dump();
        debug(label || "progress", {delay: `frames: ${fmt(delay_count)}, time avg/total: ${milli(delay_total / delay_count)} ${milli(delay_total)}`,
              wkers: `frames: ${fmt(render_count)}, frtime: ${milli(render_count * frtime_usec / 1e3)}, time/total: ${milli(render_total / render_count)} ${milli(render_total)}, idle avg/total: ${milli(render_idle / render_count)} ${milli(render_idle)}, busy avg/total: ${milli(render_busy / render_count)} ${milli(render_busy)}`,
              bkgloop: `frames: ${fmt(loop_count)}, frtime: ${milli(loop_count * frtime_usec / 1e3)}, time avg/total: ${milli(loop_total / loop_count)} ${milli(loop_total)}, idle avg/total: ${milli(loop_idle / loop_count)} ${milli(loop_idle)}, pivot avg/total: ${milli(loop_pivot / loop_count)} ${milli(loop_pivot)}, sync avg/total: ${milli(loop_sync / loop_count)} ${milli(loop_sync)}, upd avg/total: ${milli(loop_update / loop_count)} ${milli(loop_update)}`,
              endian: `first32: ${hex(first32)}, last32: ${hex(last32)}, ${(first32 == 0x1234567)? "BE": "LE"}`,
              raw: wkstate.slice().join(", ")});
//"delay_ready, delay_total, delay_count, loop_total, loop_count, loop_idle, loop_pivot, loop_sync, render_total, render_count, render_idle, render_busy, first32, last32";
//"delay_ready, delay_total, delay_count, loop_total, loop_count, loop_idle, loop_pivot, loop_sync, render_total, render_count, render_idle, render_busy, first32, last32";
        function fmt(n) { return n.toLocaleString(); } //add commas
    }
}


my_export(worker);
async function worker(shdata = {})
{
//    console.log("wker start 1", srcline());
//    process.stdout.write("wker start 2" + srcline() + "\n");
    debug("wker start".brightMagenta, Object.keys(shdata));
    let now = Date.now(), delta = -now;
//    debug(wkstate.byteLength, Object.keys(wkstate));
    wkstate.render_total_bump(-now);
//    const mystate = ary_wrap(wkstate[threadId], "total, sleep, count, wait, busy"); //make this atomic if another thread will monitor this thread's workload
//const wkstate = ary_wrap(new Uint32Array(shmbuf, wker_shmofs(0), u32bytelen(wker_shmofs(1))), "frtime, numrd, total, count, wait, busy");
//    mystate.count = mystate.wait = mystate.busy = 0;
//    let delta = -now;
//    const isBE = (u32(fbstate.first32) == NDN_HI); //&& u32(fbstate.last32) == NDN_LO); //RPi seems to be big endian
    
//    srcline.bypass = "@__:_";
    let rendered = 0;
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
//        const [frtime_pre, numrd_pre] = u64split(fbstate.FRTIME_NUMRD_bump(isLE? ONE_LE: ONE_BE), isLE); //[Number(combo >> 32n), Number(combo & (1n << 32n - 1n))]; //split atomic value after read
//        const [frtime_upd, numrd_upd] = u64split(fbstate.FRTIME_NUMRD, isLE); //[Number(combo >> 32n), Number(combo & (1n << 32n - 1n))]; //split atomic value after read
//debug("fbstate", wkstate[0].slice(0, 5)); //[frtime, numrd, FRTIME_NUMRD, numwr, numfr, test]
//        debug_state("wker loop");
//        debug("wker fbstate", {eof: is_eof(frtime_pre), rendering: is_rendering(numrd_pre), isBE, frtime_pre, numrd_pre, frtime_upd, numrd_upd, frtime_sec: milli(frtime_pre), elapsed: milli(elapsed()), fbstate: fbstate.slice(0, 5)});
//        if (numrd_upd != numrd_pre + 1) throw "endian update error".brightRed;
//        const [frtime_pre, numrd_pre] = [wkstate.frtime, wkstate.numrd_bump()];
        const job = wkstate.render_count_bump(), [frnum, portinx] = [Math.floor(job / NUM_PORTS), job % NUM_PORTS];
        const frtime = Math.round(frnum * frtime_usec / 1e3); //multiply frtime each time to avoid cumulative addition rounding errors; //TODO: round or floor?  do we want closest or latest?
//        if (!is_ready(numrd_pre)) //more work to do
//        if (frtime > seq.duration) break; //eof
//        {
//    const mystate = ary_wrap(wkstate[threadId], "total, sleep, count, wait, busy"); //make this atomic if another thread will monitor this thread's workload
//            const frtime_post = wkstate.frtime; //might have changed; get latest value
//            debug_state("wker render#", mystate.count); //numrd_pre);
//            ++wkstate.count;
        now = Date.now();
        wkstate.render_idle_bump(delta + now); delta = -now;
//            const frtime = fb.numfr * 50; //shim 20 fps
//        debug("wker render", {frnum, frtime, port, bkg_wake: job == WKAHEAD * NUM_PORTS, eof: frtime >= seq.duration});
        ++rendered;
        render_models(frtime, frnum, portinx); //render all models for this port
        enque(frnum, portinx);
        if (job == WKAHEAD * NUM_PORTS) wkstate.delay_ready = true; //parentPort.postMessage({pre_rendered: true}); //work-ahead queue is fully rendered; okay to start bkg loop
//debug("fbstate", wkstate[0].slice(0, 5)); //[frtime, numrd, FRTIME_NUMRD, numwr, numfr, test]
//            if (port == NUM_PORTS - 1)
//            {
//                const pclen = fb.pivot_and_compress(pixels2D, pcbuf);
//                const next_frtime = ++wkstate.numfr * fb.frtime_usec;
//                frifo.push({frtime: next_frtime, buf: pcbuf.slice(0, pclen)}); //uncompressed ~= 4 * 400 * 300 ~= 1/2 MB /frame, 5 min == 300 sec == 6K frames ~= 3 GB
//                fbstate.FRTIME_NUMRD = BigInt(next_frtime); //RPi is little endian; u64join([next_frtime, 0], isLE); //ignore excess, allow render threads to resume; atomic upd frtime + numrd
//            }
//            fbstate.numwr_bump();
//debug("fbstate", wkstate[0].slice(0, 5)); //[frtime, numrd, FRTIME_NUMRD, numwr, numfr, test]
        now = Date.now();
        wkstate.render_busy_bump(delta + now); delta = -now;
//            continue; //get more work; full throttle (no sleep)
//        debug_state("wker sleep#", mystate.sleep, milli(frtime_pre));
//        if (is_eof(frtime_pre)) break;
//        ++mystate.sleep; //this should always happen; else render threads are too slow
//        const result = await asleep(1e3);
//        if (!frtime_pre) fbstate.numfr = 1; //_bump(); //kludge: reuse for all-wkers-ready flag on first frame
//        const result = fbstate.frtime_sleep(frtime_pre); //sleep until next frame requested
//        debug("wker wake", result, mystate.sleep);
        if (frtime >= seq.duration) break; //eof; do this *after* render to ensure last frame is rendered
    }
//    srcline.bypass = false;
    now = Date.now();
//    mystate.wait += chkpt + now;
//    mystate.total += now;
    wkstate.render_total_bump(now);
    debug("wker done, %'d frames rendered".brightMagenta, rendered); //, {total_sec: milli(mystate.total), num_sleep: mystate.sleep, num_render: mystate.count, wait_sec: milli(mystate.wait), avg_wait: milli(mystate.wait / mystate.count), busy_sec: milli(mystate.busy), avg_busy: milli(mystate.busy / mystate.count)}); //{stats: mystate});
//    frifo.dump("all");
//    debug("here1");
//    await asleep(10e3); //kludge: postpone seg fault
//    debug("here2");
}


function cre_wker(entpt, shdata = {})
{
    const startup = (typeof entpt == "function")? [__filename, (module.exports[entpt.name] || whoops(entpt.name)).name]: [entpt.toString(), undefined];
//    if (!cre_wker.all)
//    {
//        const startup_notify = new Promise((resolve_startup, reject_startup) =>
//        {
//        });
//        cre_wker.all = [];
//        cre_wker.all.push(startup_notify); //caller also wait for bkg loop
//    }
//    const retval_startup = new Promise((resolve_startup, reject_startup) =>
//    {
    const quit_notify = new Promise((resolve_quit, reject_quit) =>
    {
//const worker = new wt.Worker(path.resolve(path.join(__dirname, 'consoleissue-worker.js')));
//console.log("wk-here22", JSON.stringify(shdata), whoami(), srcline());
//        const wkdata = Object.assign({/*epoch: elapsed.epoch,*/ entpt: startup[1]}, /*wker,shmbuf*/ shdata); //copy, don't alter caller's shdata obj
//        debug("cre wker", typeof entpt, Object.keys(wkdata));
//console.log("wk-here2", JSON.stringify(wkdata), whoami(), srcline());
        const wker = new Worker(startup[0], {workerData: Object.assign({entpt: startup[1]}, shdata)}); //__dirname + '/worker-pixel.js');
//         {workerData: {/*wker,*/ shmbuf, epoch: elapsed.started}})
        debug("created wker", wker.threadId, startup[0], startup[1]);
        wker
            .on("message", msg => { /*if (msg.pre_rendered)*/ console.log(msg.italic); }) //resolve_startup(); }) //debug(`msg from wker ${wker.threadId}:`, msg))
            .on("error", err => { debug(`wker ${wker.threadId} error: ${err}`.brightRed.italic); reject_quit(); }) //reject_startup(); reject_quit(); })
            .on("exit", code => { debug(`wker ${wker.threadId} exit ${code}`.brightGreen.italic); resolve_quit(code); });
//        worker.postMessage(buffer); //send shm buf
//        worker.unref();
    });
    (cre_wker.all || (cre_wker.all = [])).push(quit_notify); //allow caller to wait for all workers to finish
//    });
    return quit_notify; //retval_startup;
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

const PALETTE =
{
//dim (easier on eyes):
    OFF: 0xFF000000,
    RED: 0xFF030000,
    GREEN: 0xFF000300,
    BLUE: 0xFF000003,
    YELLOW: 0xFF010100,
    CYAN: 0xFF000101,
    MAGENTA: 0xFF010001,
    WHITE: 0xFF010101,
//bright:
    RED_FULL: 0xFFff0000,
    GREEN_FULL: 0xFF00ff00,
    BLUE_FULL: 0xFF0000ff,
    YELLOW_FULL: 0xFFffff00,
    CYAN_FULL: 0xFF00ffff,
    MAGENTA_FULL: 0xFFff00ff,
    WHITE_FULL: 0xFFffffff,
};


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
//CAUTION: portinx != port# unless all ports in use (sparse ary)
/*async*/ function render_models(frtime, frnum, portinx)
{
    const pixels = pixels2D[portinx]; //perf: avoid repeated ary refs
//TBD
//    const frnum = Math.round(frtime * 1e3 / frtime_usec); //Math.floor(frtime / 50); //TODO: round or floor?  do we want closest or latest?
//    debug("render", {frnum, frtime: milli(frtime), port});
//    await sleep(5e3);
//    pixels.fill(0x1000 + frnum * 16 + portinx); return; //if (frnum < 2) pixels1D.dump("fr#" + frnum + " portinx " + portinx); return;
//    pixels.fill(0x010101 * (frnum % 16));
//    for (let i = 0; i < pixels.length; ++i) pixels[i] = 0x010101 * (frnum % 16);
//    if (pixels[0] != 0x010101 * (frnum % 16) || pixels.length != UNIV_LEN) { pixels1D.dump(); throw `didn't set frame ${frnum} pixel2D[${portinx},0] len ${pixels.length}`.brightRed; }
//    if (frnum && !port) pixels1D.dump();
//    pixels[1 + portinx + 0] = 0;
//    pixels[1 + portinx + 1] = 0x030000; //R
//    pixels[1 + portinx + 2] = 0x000300; //G
//    pixels[1 + portinx + 3] = 0x000003; //B
//    const color = [0x030000, 0x000300, 0x000003][Math.floor(portinx / 8)];
//    pixels[1+16 + frnum] = color;
//    pixels[64+1 + frnum + 0] = 0;
//    pixels[64+1 + frnum + 1] = color
//    pixels[64+1 + frnum + 2] = 0;
//    pixels[64+1 + frnum + 3] = 0;
//    pixels[frnum] = PALETTE.BLUE;
//    pixels.fill(PALETTE.WHITE);
//    pixels[frnum % 150] = [PALETTE.RED, PALETTE.GREEN, PALETTE.BLUE][Math.floor(frnum / 150) % 3];
//    const px = zz(frnum, 20);
//    pixels[1 + px] = PALETTE.RED;
//    pixels[0 + px] = pixels[2 + px] = 0;
//    pixels[150 - frnum % 150] = PALETTE.RED;
    pixels[0] = 0; //nullpx
    if (frnum < 241) pixels[frnum] = PALETTE.WHITE;
    if (frnum == 300) pixels.fill(0);
//    if (frnum < 100) return;
//    pixels[2] = 0x020101;
//    pixels[4] = 0x010201;
//    pixels[6] = 0x010102;
//    pixels[8] = 0x000101; //pixels[12] = 0x000202;
//    pixels[9] = 0x010001; //pixels[14] = 0x020002;
//    pixels[10] = 0x010100; //pixels[16] = 0x020200;
//    pixels[18] = 0x010202;
//    pixels[20] = 0x020102;
//    pixels[22] = 0x020201;
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
//function u64split(val64, swap) //u64 => [upper u32, lower u32]
//{
////    debug(1n << 32n - 1n, 1 << 32 - 1, 0xffffffff, 0xffffffffn);
//    const retval = [Number(val64 >> 32n), Number(val64 & 0xffffffffn)]; //broken: (1n << 32n - 1n))];
//    return (swap)? retval.reverse(): retval;
//}
function u64join(vals32, swap) //[upper u32, lower u32] => u64
{
//    debug(1n << 32n - 1n, 1 << 32 - 1, 0xffffffff, 0xffffffffn);
    if (swap) vals32.reverse();
    return BigInt(vals32[0]) << 32n | BigInt(vals32[1]);
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
function X_debug(...args)
{
//    debug.depth || (debug.depth = function(depth, ...args) {
//    args.forEach((arg, inx) => console.error("isbuf?", !isUN(isUN(arg, {}).byteLength)));
//    args.forEach((arg, inx) => !isUN(isUN(arg, {}).buffer) && args.splice(inx, 1, Object.assign({}, arg, {buffer: `(buffer bytelen ${arg.buffer.byteLength})`))));
//    args.unshift(whoami());
//    const srcargs = args.filter(arg => isUN(arg, "").isSrcline); //allow nested srcline at any position
//    const realargs = args.filter(arg => !isUN(arg, "").isSrcline);
    const [valargs, srcargs] = args.reduce((partition, arg) => (partition[+isUN(arg, "").isSrcline].push(arg), partition), [[], []]);
//    valargs.push(elapsed_str(), whoami(), ...srcargs, srcline(+1)); //TODO: remove redundant file names
    return console.log(...valargs.map(arg => !isUN(isUN(arg, {}).buffer)? Object.assign({}, arg, {buffer: `(buffer bytelen ${arg.buffer.byteLength})`}): arg), elapsed_str(), whoami(), ...srcargs, srcline(+1));
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


//zig-zag:
function zz(n, max) { const [cycle, ofs] = [Math.floor(n / max), n % max]; return (cycle & 1)? max - ofs - 1: ofs; }

//show val to 3 dec places:
function milli(n) { return (n / 1e3).toFixed(3); }

//show number with commas:
function commas(n) { return n.toLocaleString(); }

//function whoami() { return "[" + ["main-", "thread-"][+!!threadId] + threadId + "]"; } //isUN(workerData)? "[main]": `wker[${workerData.wker}]`; } 
function whoami() { return "$" + threadId + "MT".charAt(+!isMainThread); }


//populate a new array:
function ary(length, cre) { return Array.from({length}, (_, inx) => cre(inx)); }


//cre ary for each undef prop:
function autoary(...args) //obj = {})
{
    if (!(this instanceof autoary)) return new autoary(...args); //ctor must be called with "new"
    return new Proxy(args[0] || {},
    {
        get: function(target, propkey, rcvr)
        {
            const retval = (propkey in target)? target[propkey]: target[propkey] = []; //target[propkey] || (target[propkey] = []);
//debug("get '%s' from %s, exists? %s, retval", propkey, srcline(+1), !!target[propkey], JSON.stringify(retval), JSON.stringify(target)); //typeof target[propkey], retval, Object.keys(target));
            return retval;
//                return target._inner[prop];
//                return Reflect.get(target._inner, propkey, rcvr);
        }
    });
}


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
//function bytelen(u32len) { return u32len * Uint32Array.BYTES_PER_ELEMENT; }
function u32inx(bytes) { return bytes / Uint32Array.BYTES_PER_ELEMENT; }
function u32bytes(u32inx) { return u32inx * Uint32Array.BYTES_PER_ELEMENT; }
function x_u32len(bytelen) { return Math.floor(bytelen / Uint32Array.BYTES_PER_ELEMENT); } //round down
function x_U32LEN(bytelen) { return Math.ceil(bytelen / Uint32Array.BYTES_PER_ELEMENT); } //round up

//reduce memory contention between threads:
//function L2pad(bytelen)
//{
//    const L2CACHELEN = 64; //RPi 2/3 reportedly have 32/64 byte cache rows; use larger size to accomodate both
//    return Math.ceil(bytelen / L2CACHELEN) * L2CACHELEN;
//}


function u32(val) { return val >>> 0; }
function hex(val, prefix = "0x") { return (val < 10)? val: /*isUN(pref, "0x")*/ prefix + u32(val).toString(16); } //force to uint32 for correct display value; leave 0..9 as-is

//function asmap(namevals) { return namevals.reduce((map, [name, val]) => Object.assign(map, {[name]: val}), {}); }
function asmap(namevals, init) { return Object.assign(init || {}, ...namevals.map(([name, val]) => ({[name]: val}))); }

function numkeys(obj) { return Object.keys(obj || {}).length; }


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