#!/usr/bin/env node
//YALP multi-core example

/* YALP port/[univ#] pinout on RPi:
YALP    func    RPi-Header  func   YALP
         3.3V     1  2       5V
^VS[--] GPIO2     3  4       5V
^HS[--] GPIO3     5  6       0V
B0[23]  GPIO4  .  7  8  .  GPIO14  G2[13]
          0V      9  10 .  GPIO15  G3[12]
G5[10]  GPIO17 . 11  12 .  GPIO18  G6[9]
R7[0]   GPIO27 . 13  14      0V
R2[5]   GPIO22 . 15  16 .  GPIO23  R3[4]
         3.3V    17  18 .  GPIO24  R4[3]
B6[17]  GPIO10 . 19  20      0V
B5[18]  GPIO9  . 21  22 .  GPIO25  R5[2]
B7[16]  GPIO11 . 23  24 F  GPIO8   B4[19]
          0V     25  26 F  GPIO7   B3[20]
CLK[--] GPIO0    27  28    GPIO1   EN[--]
B1[22]  GPIO5  F 29  30      0V
B2[21]  GPIO6  F 31  32 F  GPIO12  G0[15]
G1[14]  GPIO13 F 33  34      0V
G7[8]   GPIO19 F 35  36 F  GPIO16  G4[11]
R6[1]   GPIO26 F 37  38 F  GPIO20  R0[7]
          0V     39  40 .  GPIO21  R1[6]
NOTES:
FL      B1, B2, B3, B4         ,  G0, G1,       G4,      G7, R0,                     R6
!FL!  B0             , B5, B6, B7,       G2, G3,   G5, G6,       R1, R2, R3, R4, R5,    R7
* flicker:    5 6 7 8         12 13       16       19 20                26   
* !flicker: 4         9 10 11       14 15    17 18       21 22 23 24 25    27
^ = pull-ups
GW = Gowhoops break-out board
YALP ctlr break-out: TOP= 3(R3) 2(R2) 22(B6) 10(G2) 21(B5) 7(R7) 11(G3) 14(G6) 18(B2) 8(G0) 1(R1) 12(G4) 15(G7) 9(G1) 20(B4) 23(B7) =BOTTOM
todo: 0(R0), 4(R4), 5(R5), 6(R6), 13(G5), 16(B0), 17(B1), 19(B3)
refs:
https://www.raspberrypi.org/documentation/hardware/raspberrypi/dpi/README.md
https://pinout.xyz/
http://www.mosaic-industries.com/embedded-systems/microcontroller-projects/raspberry-pi/gpio-pin-electrical-specifications
*/

"use strict"; //find bugs + typos easier
imports();


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
/// layout => layout.js
//


//map DPI24 pins to YALP univ#:
const DPI24 =
{
    R7: 0, noGW_R6: 1, unGW_R5: 2, unGW_R4: 3, R3: 4, R2: 5, R1: 6, unGW_R0: 7,
    G7: 8, G6: 9, unGW_G5: 10, G4: 11, G3: 12, G2: 13, G1: 14, G0: 15,
    B7: 16, B6: 17, B5: 18, B4: 19, unGW_B3: 20, B2: 21, unGW_B1: 22, B0: 23,
    HSYNC: -1, VSYNC: -2, ENABLE: -3, PXCLK: -4, //not used by YALP; can be used for other purposes
};
//map GPIO pins to YALP univ#:
const GPIO =
{
    GPIO27: 0, noGW_GPIO26: 1, unGW_GPIO25: 2, unGW_GPIO24: 3, GPIO23: 4, GPIO22: 5, GPIO21: 6, unGW_GPIO20: 7,
    GPIO19: 8, GPIO18: 9, unGW_GPIO17: 10, GPIO16: 11, GPIO15: 12, GPIO14: 13, GPIO13: 14, GPIO12: 15,
    GPIO11: 16, GPIO10: 17, GPIO9: 18, GPIO8: 19, unGW_GPIO7: 20, GPIO6: 21, unGW_GPIO5: 22, GPIO4: 23,
    GPIO3: -1, GPIO2: -2, GPIO1: -3, GPIO0: -4, //not used by YALP; can be used for other purposes
};
const dev_flicker =
[
];
//map my Pi hat (GoWhoops) connectors to YALP univ#:
const myhat =
{
    0: DPI24.R3, 1: DPI24.R2, 2: DPI24.B6, 3: DPI24.G2, 4: DPI24.B5, 5: DPI24.R7, 6: DPI24.G3, 7: DPI24.G6, 8: DPI24.B2, 9: DPI24.G0, 10: DPI24.R1, 11: DPI24.G4, 12: DPI24.G7, 13: DPI24.G1, 14: DPI24.B4, 15: DPI24.B7, //top->bottom
    tree: DPI24.R3,
    fence: DPI24.R2,
    gift: DPI24.B6,
    MJBA: DPI24.G2,
    devpanel: DPI24.R1,
};


/*
const {nullpx} = require("models");
const devpanel = require("models/devpanel.js");
//which models are connected to which port:
const layout =
{
    [DPI24.R1]: [nullpx(1), devpanel()],
};
*/


//const {Tree} = require("./models/tree");
const tree = /*new Tree*/({portnum: DPI24.R3, maxbr: 0.8});
//const {Fence} = require("./models/fence");
const fence = /*new Fence*/({portnum: DPI24.R2, maxbr: 1.0});
//const {Devpanel} = require("./models/devpanel");
const devpanel = /*new Devpanel*/({portnum: -1, maxbr: 0.3});
const gift = {portnum: DPI24.B6, maxbr: 0.5};
const MJBA = {portnum: DPI24.G2, maxbr: 0.6};
fence.segs =
{
    RCandle: 5,
    RBell: 7,
    XAndel: 7,
    RK_camel: 7,
    K_camel_star: 6,
    LCandle: 4,
    RAngel: 6,

    K_camel_kneel: 7,
    MJB_star: 7,
    Shep2_kneel: 7,
    LAngel: 6,
    City: 7,
    Sheps2_star: 7,
    LShep: 6,
    LBell: 5,
    Joy: 7,
    
    pole: 25,
};


//function junk_models()
//{
//cre one dummy model per every-third port:
//const models = ary(NUM_PORTS); //list of port#s
const models = ary(MAX_PORTS, inx => // / 2, inx => // / 3, inx =>
({
//TBD
    port: inx, //* 3,
    get num_pixels() { return (this.port || 1) * 100; }, //400, //varied by port
//    brlimit: 3 * 256 * [1/2, 5/6, 1/10][inx % 3],
}));
//debug({models});
//TODO: try to group related models onto same port (to consolidate rendering logic)
//debug("models", models, new autoary());
const layout = models.reduce((byport, model) => ((byport[model.port] || (byport[model.port] = [])).push(model), byport), {}); //(byport[model.port].push(model), byport), new autoary()); //byport[model.port].push(model), new autoary());
const FIRST_PORT = 1 << (MAX_PORTS - 1); //0x800000;
const [NUM_PORTS, PORT_MASK] = [numkeys(layout), Object.keys(layout).reduce((bitmap, port) => bitmap | (FIRST_PORT >> port), 0)];
//debug(JSON.stringify({layout}));
//}


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// fx loop (repeats, could be interactive)
//

function fxloop()
{
    const retval =
    {
        runlen: 6 * 60 * 60e3, //how long bkg loop runs; 6 hr
        looplen: 25e3, //how long (big) frbufs are; msec; == 200 fr @20 FPS
    };
    Object.assign(fxloop, retval); //allow prop access by obj
    const NUMFR = Math.ceil(fxloop.looplen * 1e3 / frtime_usec);
debug("fxloop".brightMagenta, {MAX_PORTS, NUM_PORTS, PORT_MASK: hex(PORT_MASK), UNIV_LEN, padded: UNIV_PADLEN, frtime_usec, FPS, runlen: milli(fxloop.runlen), NUMFR, looplen: milli(fxloop.looplen)});
    Object.assign(global, {NUMFR}); //needed by shmem layout
}


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// seq (linear 1x)
//

function seq()
{
    const retval =
    {
//TBD
//duration controls bkg loop + render wkers
//render_time gives wkers a head-start
        duration: /*3.5*60e3 +*/3*150*51+ 2500, //msec; == 50 fr @20 FPS
        get render_time() { return this.duration + 100; }, //: /*3.5*60e3 +*/ 4000, //how long it takes wker threads to render all frames in this seq; comment out if < duration (no work-ahead needed); set to 2x duration to pre-render entire seq in memory
    };
    Object.assign(seq, retval); //allow prop access by obj
//debug({seq});
    const NUMFR = Math.ceil(seq.duration * 1e3 / frtime_usec), WKAHEAD = Math.max(Math.ceil((seq.render_time || 0) * 1e3 / frtime_usec) - NUMFR, 0); //more accurate than FPS
debug("seq".brightMagenta, {MAX_PORTS, NUM_PORTS, PORT_MASK: hex(PORT_MASK), UNIV_LEN, padded: /*u32inx(portbytes(1))*/ UNIV_PADLEN, frtime_usec, FPS, duration: milli(seq.duration), NUMFR, playback_delay: milli(Math.max(seq.render_time || 0) - seq.duration, 0), WKAHEAD, /*full_buf: NUMFR <= WKAHEAD, circ_buf: NUMFR > WKAHEAD,*/ NUM_WKERS}); //, workerData});
    Object.assign(global, {NUMFR, WKAHEAD}); //needed by shmem layout
}
//  wkers             bkgloop
//  0..delay-1        hold
//  delay..dur-delay  0..dur


//seq(); shmem_linear(); const main = main_linear;
fxloop(); shmem_loop(); const main = main_loop;
const frtime_msec = Math.round(frtime_usec / 1e3);
const {HUE, PAL, hsv2RGB, /*HSV2RGB, HSV2hsv, RGB2rgb*/} = require("./incl/color-mgmt22.js");


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// thread control
//

setImmediate(() => isMainThread? main(): module.exports[workerData.entpt](workerData)); //worker); //allow in-line init code to finish first


async function main_loop()
{
    debug("main LOOP start".brightMagenta, fb.constructor.name);
//    pixels1D.fill(0); //start with all pixels off
    Object.entries(layout).forEach(([port, models]) => brlimit[port] = 0); //models[0].brlimit); //{ debug(port, JSON.stringify(models), (models[0] || {}).brlimit); brlimit[port] = models[0].brlimit; });
    wkstate.fill(0); //clear job control + perf stats
//debug(typeof frifo, (frifo.constructor || {}).name);
//    const frbufs_excl_wkbuf = new Uint32Array(frbufs, 0, u32inx(portbytes(Math.max(FIFOLEN, 1) * NUM_PORTS)));
    (cre_wker.all || (cre_wker.all = [])).push(fb.abkgloop(frifo, fxloop.runlen, PORT_MASK)); //also wait for bkg loop to finish
    for (let w = 0; w < NUM_WKERS; ++w) /*await*/ cre_wker(worker_loop, {frbufs, frtime_usec}); //, wkstats}); //{shmbuf}); //, NUM_WKERS); //CAUTION: wkers will start (pre-)rendering immediately; delay bkg loop until enough frbufs are queued
    const started = Date.now();
    const monitor = setInterval(progress, 1e3); progress("starting");
    debug("wait for %s wkers + bkg loop to finish", cre_wker.all.length - 1); //CAUTION: debug() changes arg to str
    await Promise.all(cre_wker.all || []); // || [work()]); //wait for wkers to finish; TODO: run on fg if !wkers?
    debug("wkers done");
    clearInterval(monitor);
    progress("main loop done".brightMagenta);
}


async function main_linear()
{
    debug("main LINEAR start".brightMagenta, fb.constructor.name);
    pixels1D.fill(0); //start with all pixels off
    Object.entries(layout).forEach(([port, models]) => brlimit[port] = models[0].brlimit); //{ debug(port, JSON.stringify(models), (models[0] || {}).brlimit); brlimit[port] = models[0].brlimit; });
    wkstate.fill(0); //clear job control + perf stats

//    const frbufs_excl_wkbuf = new Uint32Array(frbufs, 0, u32inx(portbytes(Math.max(FIFOLEN, 1) * NUM_PORTS)));
    (cre_wker.all || (cre_wker.all = [])).push(fb.abkgloop(frbufs_excl_wkbuf, seq.duration, PORT_MASK)); //also wait for bkg loop to finish
    for (let w = 0; w < NUM_WKERS; ++w) /*await*/ cre_wker(worker_linear, {frbufs, frtime_usec}); //, wkstats}); //{shmbuf}); //, NUM_WKERS); //CAUTION: wkers will start (pre-)rendering immediately; delay bkg loop until enough frbufs are queued
    const started = Date.now();
    const monitor = setInterval(progress, 1e3); progress("starting");
    debug("wait for %s wkers + bkg loop to finish", cre_wker.all.length - 1); //CAUTION: debug() changes arg to str
    await Promise.all(cre_wker.all || []); // || [work()]); //wait for wkers to finish; TODO: run on fg if !wkers?
    debug("wkers done");
    clearInterval(monitor);
    progress("main linear done".brightMagenta);
}

function progress(label)
{
    const {delay_count, delay_total, delay_ready, first32, last32, //} = wkstate;
        render_count, render_total, render_idle, render_busy, //} = wkstate;
        loop_count, loop_total, loop_idle, loop_pivot, loop_sync, loop_update} = wkstate;
    debug(label || "progress", {delay: `frames: ${fmt(delay_count)}, time avg/total: ${milli(delay_total / delay_count)} ${milli(delay_total)}`,
          wkers: `frames: ${fmt(render_count)}, frtime: ${milli(render_count * frtime_usec / 1e3)}, time/total: ${milli(render_total / render_count)} ${milli(render_total)}, idle avg/total: ${milli(render_idle / render_count)} ${milli(render_idle)}, busy avg/total: ${milli(render_busy / render_count)} ${milli(render_busy)}`,
          bkgloop: `frames: ${fmt(loop_count)}, frtime: ${milli(loop_count * frtime_usec / 1e3)}, time avg/total: ${milli(loop_total / loop_count)} ${milli(loop_total)}, idle avg/total: ${milli(loop_idle / loop_count)} ${milli(loop_idle)}, pivot avg/total: ${milli(loop_pivot / loop_count)} ${milli(loop_pivot)}, sync avg/total: ${milli(loop_sync / loop_count)} ${milli(loop_sync)}, upd avg/total: ${milli(loop_update / loop_count)} ${milli(loop_update)}`,
          endian: `first32: ${hex(first32)}, last32: ${hex(last32)}, ${(first32 == 0x1234567)? "BE": "LE"}`,
          raw: wkstate.slice().join(", ")});
//"delay_ready, delay_total, delay_count, loop_total, loop_count, loop_idle, loop_pivot, loop_sync, render_total, render_count, render_idle, render_busy, first32, last32";
//"delay_ready, delay_total, delay_count, loop_total, loop_count, loop_idle, loop_pivot, loop_sync, render_total, render_count, render_idle, render_busy, first32, last32";
    function fmt(n) { return n.toLocaleString(); } //add commas
}


my_exports({worker_loop});
async function worker_loop(shdata = {})
{
    const NPX = 1;
    const ANI_SPEED = 1e3; //msec
    debug("wker_loop start".brightMagenta, Object.keys(shdata));
    let now = Date.now(), delta = -now;
    wkstate.render_total_bump(-now);
//    let rendered = 0;
//debug(typeof frifo, (frifo.constructor || {}).name);
//animation logic:
//debug(PAL.RED_DIM, PAL.GREEN_DIM, PAL.BLUE_DIM);
//NO; this will skip frbufs:    for (let animtime = 0; animtime <= fxloop.looplen; animtime += 500)
//    {
//        const frinx = Math.round(animtime / frtime_msec), frtime = fxinx * frtime_msec; //choose frbuf closest to anim time
    for (let [frtime, frnum] = [0, 0]; frtime <= fxloop.looplen; frtime = ++frnum * frtime_msec)
    {
        const anim_frnum = Math.round(frtime / ANI_SPEED), anim_frtime = anim_frnum * ANI_SPEED; //choose anim frame closest to frbuf time
if (false)
        for (let portinx = 0; portinx < NUM_PORTS; ++portinx)
        {
//            const px = pixels3D[frnum][portinx]; //frbuf[portinx];
            const frbuf = pixels3D[frnum];
            const bare_port = {/*pixels1D: new UintArray32(frbuf.buffer, NPX, UNIV_LEN),*/ portnum: portinx, frbuf, portinx, NPX};
            wkstate.render_count_bump();
            pin_finder(bare_port, anim_frnum); //frbuf, portinx, anim_frnum, NPX);
        }
//if (false)
        yard(frnum, anim_frnum);
//NO: NEED EACH FRAME        break; //static frame
    }
    wkstate.delay_ready = true; //loop fully rendered; okay to start bkg loop
    now = Date.now();
    wkstate.render_total_bump(now);
    debug("wker_loop done, %d frames rendered, now start bkg loop".brightMagenta, wkstate.render_count);
}


function RGB(R, G, B) { return rgb2RGB({R, G, B}); }

//static yard:
function yard(frnum, anim)
{
    const NPX1 = 1;

for (let port = 0; port < 24; ++port)
{
    const prop = pixels3D[frnum][port];
    const colors = [0xFF020000, 0xFF000200, 0xFF000002, 0];
    for (let node = 0; node < 40; ++node)
        prop[node] = colors[(anim + node) % colors.length];
}
return;

    const treepx = pixels3D[frnum][tree.portnum];
//treepx.fill(hsv2RGB({H: HUE.GREEN, S: 100, V: 20})); //,PAL.GREEN_DIM)); //tree
//    for (let node = 0; node < 32 * (anim % 24); ++node) treepx[node + NPX1] = 0xFF00A000; //0xFF004000;
    treepx[0] = 0; //NPX
    for (let node = 0; node < 24 * 33; ++node) treepx[NPX1 + node] = 0x005000; //0x000600; //0xFF000800;

    const giftpx = pixels3D[frnum][gift.portnum];
    for (let node = 0; node < 23 * 36; ++node) giftpx[node] = 0x000606/2; //0xFF000202;

    const MJBApx = pixels3D[frnum][MJBA.portnum];
    for (let node = 0; node < 300+300+150+600; ++node) MJBApx[node] = (node < 300)? 0x200000: (node < 600)? 0x000002: (node < 750)? 0x030300: 0; //0x010101;

//const fence = pixels3D[frnum][DPI24.R2]; //.fill(hsv2RGB(PAL.GREEN_DIM)); //tree
    const fencepx = pixels3D[frnum][fence.portnum];
//for (let node = 0; node < 2*50; ++node) fence[node] = hsv2RGB({H: ((node / 6) & 1)? HUE.BLUE: HUE.GREEN, S: 100, V: 33}); //, PAL.BLUE_DIM: PAL.GREEN_DIM);
    fencepx[0] = 0; //NPX
//if (isNaN(++yard.count)) yard.count = 1;
    const fence_nodes = Object.values(fence.segs).reduce((nodeofs, numpx, inx, all) =>
    {
        const [RED, GREEN, WHITE, OFF] = [0xFF0000A0, 0xFF00A000, 0xFF505050, 0];
        const color = (inx & 1)? 0xFF0000A0: 0xFF00A000; //hsv2RGB({H: (inx & 1)? HUE.BLUE/*==RED*/: HUE.GREEN, S: 100, V: 50}); //, PAL.BLUE_DIM: PAL.GREEN_DIM);
//console.log("fence", inx, all.length, numpx, nodeofs, srcline());
        if (inx < all.length - 1)
            for (let i = 0; i < numpx; ++i) fencepx[NPX1 + nodeofs + i] = color;
        else //pole marque
            for (let i = 0; i < numpx; ++i) fencepx[NPX1 + nodeofs + i] = [RED, GREEN, WHITE, OFF][(i + anim) % 4];
        return nodeofs + numpx;
    }, 0);
//    if (yard.count == 1) debug(fence_nodes);
}

    
//apply to bare portbuf (no model):
//function pin_finder(frbuf, portinx, anim, NPX)
function pin_finder(model, anim)
{
    const {frbuf, portinx, NPX} = model; //temp shim
    const portname = Object.keys(DPI24)[Object.values(DPI24).indexOf(portinx)] || "";
    const [color, gap] = portname.match(/(no|un)GW/)? [PAL.MAGENTA_DIM, portinx % 8]: [{R: PAL.RED_DIM, G: PAL.GREEN_DIM, B: PAL.BLUE_DIM}[portname.charAt(0)], +portname.charAt(1)];
//if (!frnum) debug(portinx, portname, color, hex(hsv2RGB(color || PAL.BLACK)), gap);
    if (!portname || !color || isNaN(gap)) throw `unknown port inx: ${portinx}`;
    const px = frbuf[portinx];
//first show legend:
//this allows other pixels to be interpreted clearly even if color order is wrong
    [PAL.BLACK, PAL.RED_DIM, PAL.GREEN_DIM, PAL.BLUE_DIM, PAL.WHITE_DIM, PAL.BLACK]
        .forEach((legend, inx) => px[(NPX || 0) + 1 + inx] = hsv2RGB(legend));
    for (let node = 0; node < 300; node += gap + 1)
         px[(NPX || 0) + 8 + node + anim % 8] = hsv2RGB(color); //pin finder
}


my_exports({worker_linear});
async function worker_linear(shdata = {})
{
    debug("wker_linear start".brightMagenta, Object.keys(shdata));
    let now = Date.now(), delta = -now;
    wkstate.render_total_bump(-now);
    
    let rendered = 0;
    for (;;)
    {
        const job = wkstate.render_count_bump(), [frnum, portinx] = [Math.floor(job / NUM_PORTS), job % NUM_PORTS];
        const frtime = Math.round(frnum * frtime_usec / 1e3); //multiply frtime each time to avoid cumulative addition rounding errors; //TODO: round or floor?  do we want closest or latest?
        now = Date.now();
        wkstate.render_idle_bump(delta + now); delta = -now;
        ++rendered;
        render_models(frtime, frnum, portinx); //render all models for this port
        frifo.enque(frnum, portinx);
        if (job == WKAHEAD * NUM_PORTS) wkstate.delay_ready = true; //parentPort.postMessage({pre_rendered: true}); //work-ahead queue is fully rendered; okay to start bkg loop
        now = Date.now();
        wkstate.render_busy_bump(delta + now); delta = -now;
        if (frtime >= seq.duration) break; //eof; do this *after* render to ensure last frame is rendered
    }
    now = Date.now();
    wkstate.render_total_bump(now);
    debug("wker_linear done, %'d frames rendered".brightMagenta, rendered); //, {total_sec: milli(mystate.total), num_sleep: mystate.sleep, num_render: mystate.count, wait_sec: milli(mystate.wait), avg_wait: milli(mystate.wait / mystate.count), busy_sec: milli(mystate.busy), avg_busy: milli(mystate.busy / mystate.count)}); //{stats: mystate});
}


//render models:
//render all models for a port (related models tend to be grouped by port)
//CAUTION: portinx != port# unless all ports in use (sparse ary)
/*async*/ function render_models(frtime, frnum, portinx)
{
    const pixels = pixels2D[portinx]; //perf: avoid repeated ary refs
//TBD
    pixels[0] = 0; //nullpx
    if (frnum < 241) pixels[frnum] = hsv2RGB(PAL.WHITE_DIM);
//    if (frnum == 300) pixels.fill(0);    
}


function cre_wker(entpt, shdata = {})
{
    const startup = (typeof entpt == "function")? [__filename, (module.exports[entpt.name] || whoops(entpt.name)).name]: [entpt.toString(), undefined];
    const quit_notify = new Promise((resolve_quit, reject_quit) =>
    {
        const wker = new Worker(startup[0], {workerData: Object.assign({entpt: startup[1]}, shdata)}); //__dirname + '/worker-pixel.js');
        debug("created wker", wker.threadId, startup[0], startup[1]);
        wker
            .on("message", msg => { /*if (msg.pre_rendered)*/ console.log(msg.italic); }) //resolve_startup(); }) //debug(`msg from wker ${wker.threadId}:`, msg))
            .on("error", err => { debug(`wker ${wker.threadId} error: ${err}`.brightRed.italic); reject_quit(); }) //reject_startup(); reject_quit(); })
            .on("exit", code => { debug(`wker ${wker.threadId} exit ${code}`.brightGreen.italic); resolve_quit(code); });
    });
    (cre_wker.all || (cre_wker.all = [])).push(quit_notify); //allow caller to wait for all workers to finish
    return quit_notify; //retval_startup;
    function whoops(name) { throw `worker func '${name}' must be exported`.brightRed; }
}


//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// helpers
//


//async sleep:
function asleep(delay = 1e3) { return new Promise(resolve => setTimeout(resolve, delay)); } //isUN(delay, 1e3))); }
//async function sleep(delay_msec) { return new Promise(resolve => setTimeout(resolve, delay_msec || 1e3)); }


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


//length conversions:
//function bytelen(u32len) { return u32len * Uint32Array.BYTES_PER_ELEMENT; }
function u32inx(bytes) { return bytes / Uint32Array.BYTES_PER_ELEMENT; }
function u32bytes(u32inx) { return u32inx * Uint32Array.BYTES_PER_ELEMENT; }
function x_u32len(bytelen) { return Math.floor(bytelen / Uint32Array.BYTES_PER_ELEMENT); } //round down
function x_U32LEN(bytelen) { return Math.ceil(bytelen / Uint32Array.BYTES_PER_ELEMENT); } //round up

function u32(val) { return val >>> 0; }
function hex(val, prefix = "0x") { return (val < 10)? val: /*isUN(pref, "0x")*/ prefix + u32(val).toString(16); } //force to uint32 for correct display value; leave 0..9 as-is

//function asmap(namevals) { return namevals.reduce((map, [name, val]) => Object.assign(map, {[name]: val}), {}); }
function asmap(namevals, init) { return Object.assign(init || {}, ...namevals.map(([name, val]) => ({[name]: val}))); }

function numkeys(obj) { return Object.keys(obj || {}).length; }


//function my_export(entpt) { Object.assign(module.exports, {[entpt.name]: entpt}); }
function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }


//put these down here to reduce clutter above and allow hoist:
function imports()
{
    require('colors').enabled = true; //for console output (all threads)
    const {isMainThread, threadId, workerData, Worker_bk, parentPort} = require('worker_threads');
    Object.assign(global, {isMainThread, threadId, workerData, parentPort});
    
//    const {debug} = require("./incl/utils21");
//    Object.assign(global, {debug});

    const /*addon*/{MAX_PORTS, UNIV_LEN, UNIV_PADLEN, frtime_usec: frtime_usec_from_api, FPS, /*FB,*/ brlimit, stats, statsdir, /*'FB.abkgloop': abkgloop,*/ fb, addr, debug, srcline, elapsed, isUN, Worker} = require("./index.js"); //.options({shmbuf()}); //require('bindings')('yalp-addon'); //.options({fbnum: 1}); //FB object
    Object.assign(global, {MAX_PORTS, UNIV_LEN, UNIV_PADLEN, frtime_usec_from_api, FPS, brlimit, stats, statsdir, fb, addr, debug, srcline, elapsed, isUN, Worker});
    const frtime_usec = isMainThread? frtime_usec_from_api: workerData.frtime_usec; //kludge: need to make timing calculations consistent
    const NUM_WKERS = 1; //Math.max(require("os").cpus().length - 1, 1); //1 thread per core, leave one core free for parent thread
    Object.assign(global, {frtime_usec, NUM_WKERS});
}


//eof
//////////////////////////////////////////////////////////////////////////////////////////////////
////
/// shared memory
//


//debug(workerData);
//frame buffer fifo:
//frifo has 1 frbuf for each wkahead + 1 working frbuf for render (bkg loop !allowed to use last one)
//each frbuf = #ports * univlen (padded for L2 cache)
//uses shared memory to avoid serialization overhead between threads

//frbufs arranged for fx loop (could be interactive):
//no working frbuf needed, workers render directly to cur frbuf in loop
//3D frbuf to allow time-based fx pre-render: [frinx][portinx][nodeinx]
function shmem_loop()
{
    const FIFOLEN = NUMFR; //defined by fx loop
    const frbufs = isMainThread? new SharedArrayBuffer(portbytes(FIFOLEN * NUM_PORTS)): workerData.frbufs;
    const frifo = new Uint32Array(frbufs); //each frame buf consists of NUM_PORTS port bufs, each port buf consists of UNIV_LEN (padded) u32 values
//    const frbufs_excl_wkbuf = frifo; //no exclusion
//debug(typeof frifo, (frifo.constructor || {}).name);
    const pixels3D = ary(NUMFR, frinx => ary(NUM_PORTS, portinx => new Uint32Array(frbufs, portbytes(frinx * NUM_PORTS + portinx), UNIV_LEN)));
    frifo.get_next = function(frinx, portinx)
    {
        if (!frinx) return; //no need to copy first time
        const [to, from_begin, from_end] = [frinx % FIFOLEN * NUM_PORTS + portinx, (frinx - 1) % FIFOLEN * NUM_PORTS + portinx, (frinx - 1) % FIFOLEN * NUM_PORTS + portinx + 1].map(ofs => u32inx(portbytes(ofs)));
//debug(to, from_begin, from_end);
        this.copyWithin(to, from_begin, from_end); //propagate prev frbuf to new frbuf to preserve pixels
    }
    const wkstate = ary_wrap(stats, statsdir, "want_atomic"); //TODO: is this needed?
    Object.assign(global, {frbufs, frifo, pixels3D, wkstate});
    
    function portbytes(port) { return port * u32bytes(UNIV_PADLEN); } //padded to reduce cache contention between threads
}


//arrange frbufs in linear sequence:
//render might loop if frbufs too short, but bkg loop is intended to be 1x only
function shmem_linear()
{
    const FIFOLEN = NUMFR; //wrong: WKAHEAD; //defined by seq
    const frbufs = isMainThread? new SharedArrayBuffer(portbytes((FIFOLEN + 1) * NUM_PORTS)): workerData.frbufs;
//const frifo = ary(WKAHEAD + 1, frbuf => new Uint32Array(frbufs, u32len(portofs32(frbuf * NUMPORTS)), portofs32(NUM_PORTS))));
    const frbufs_excl_wkbuf = new Uint32Array(frbufs, 0, u32inx(portbytes(Math.max(FIFOLEN, 1) * NUM_PORTS)));
//debug(typeof frbufs_excl_wkbuf, (frbufs_excl_wkbuf.constructor || {}).name);
    const frifo = new Uint32Array(frbufs); //, 0, u32inx(portbytes(Math.max(WKAHEAD, 1) * NUM_PORTS))); //each frame buf consists of NUM_PORTS port bufs, each port buf consists of UNIV_LEN (padded) u32 values; exclude working copy @end
debug("frifo", {bytes: frifo.byteLength, len32: frifo.length, portbufs: frifo.byteLength / portbytes(1), frbufs: frifo.byteLength / portbytes(NUM_PORTS), wkbuf_ofs: u32inx(portbytes(FIFOLEN * NUM_PORTS)), addr: hex(fb.addr(frifo))});

//last frbuf used as working copy for pixel rendering:
//working copy becomes last frbuf
    const pixels1D = new Uint32Array(frbufs, portbytes(FIFOLEN * NUM_PORTS)); //1 frbuf at end for rendering
//debug(pixels1D.length, pixels1D.byteLength);
    const pixels2D = ary(NUM_PORTS, portinx => new Uint32Array(frbufs, portbytes(FIFOLEN * NUM_PORTS + portinx), UNIV_LEN)); //pixels1D.buffer, port 
debug("here2");
    frifo.enque = function(frnum, portinx)
    {
        if (!FIFOLEN) return; //just pass working copy to bkg loop (not a good idea?)
        const [to, from_begin, from_end] = [frnum % FIFOLEN * NUM_PORTS + portinx, FIFOLEN * NUM_PORTS + portinx, FIFOLEN * NUM_PORTS + portinx + 1].map(ofs => u32inx(portbytes(ofs)));
        this.copyWithin(to, from_begin, from_end); //place rendered port pixels into frifo; wrap (circular fifo)
    }
    function portbytes(port) { return port * u32bytes(UNIV_PADLEN); } //L2pad(u32bytes(UNIV_LEN)); } //padded to reduce cache contention between threads
//renderer thread data:
    const wkstate = ary_wrap(/*new Int32Array(stats.buffer)*/ stats, statsdir, "want_atomic"); //atomics req int array !uint array; //"frtime, numrd, numfr, total, count, wait, busy");

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
    Object.assign(global, {frbufs, frbufs_excl_wkbuf, frifo, pixels1D, pixels2D, wkstate});
}

//eof
