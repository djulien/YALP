#!/usr/bin/env node
//YALP layout-related
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
/// port layout
//


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


//eof