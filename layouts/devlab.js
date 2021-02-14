#!/usr/bin/env node
//YALP custom/example: dev lab layout
//Copyright (c) 2020 - 2021 Don Julien
//Can be used for non-commercial purposes.
//
//History:
//ver 1.21.1  DJ  rework model ctor, rework layout sttr

'use strict'; //find bugs easier
//require('colors').enabled = true; //for console output (all threads)
//require("magic-globals"); //__file, __line, __stack, __func, etc
const {strict_obj, isdef, throwx, rpt2csv, shortname, my_exports} = require("yalp21/incl/utils");
const {debug, txtout, TODO} = require("yalp21/incl/msgout");
const {NUM_PORTS} = require("yalp21");
debug.max_arg_len = 500;


/////////////////////////////////////////////////////////////////////////////////
////
/// Custom layout: my dev lab
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
(flicker stops with a full 5V @first pixel)
* flicker:    5 6 7 8         12 13       16       19 20                26   
* !flicker: 4         9 10 11       14 15    17 18       21 22 23 24 25    27
pu = pull-ups
GW = Gowhoops break-out board
YALP ctlr break-out: TOP= 3(R3) 2(R2) 22(B6) 10(G2) 21(B5) 7(R7) 11(G3) 14(G6) 18(B2) 8(G0) 1(R1) 12(G4) 15(G7) 9(G1) 20(B4) 23(B7) =BOTTOM
*/


//dpi24 ports + my aliases:
const ports = `
//primary port names:
    R0,R1,R2,R3,R4,R5,R6,R7, //red pins 0-7 = ports 0-7
    G0,G1,G2,G3,G4,G5,G6,G7, //green pins 0-7 = ports 8-15
    B0,B1,B2,B3,B4,B5,B6,B7, //blue pins 0-7 = ports 16-23
//aliases:
    IC1 = 9, IC2 = 18,
    GLOBES = 8, //GLOBES = 23,
    LHCOL = 11, //COLS = G3,
    TREE = 3, //MTREE = R3,
    STAR = 20,
    GIFT = 2, //GIFT_FACE = R2,
    BOW = 15, //GIFT_TOP = B6,
    SHEP1 = 1, SHEP3 = 14, SHEP24 = 10,
    K1 = 21, K23 = 12, //K3 = R4,
    ANGEL = 7,
    MJB = 23, //MJB = 8,
    FENCE = 22,
    DEVPORT = R0, //reserve port# 0 for dev/debug
//TODO? ALL=??,
//refmt above for lookups:
    `.replace(/\/\/[^\n]*/g, "") //strip comments
    .replace(/^\s+|\s+$/g, "") //strip leading/trailing whitespace
    .split(/\s*,\s*/)
    .filter(name => name) //drop blank entries
    .map(item => item.split(/\s*=\s*/)) //parse aliases
    .reduce((retval, [name, valstr]) => Object.assign(retval, //convert ary to dict + expand aliases
    {
//        debug: debug(name, valstr, !isNaN(valstr), isdef(valstr), retval.auto),
        [name]: !isNaN(valstr)? +valstr: //use numeric value as-is
                isdef(valstr)? retval[valstr]: //alias for another (existing) value
                retval.auto++, //assign next available; CAUTION: must use prefix++ to pass range check
    }), strict_obj(
        Object.defineProperty({}, "auto", {value: 0, writable: true}),
        port => (port >= 0 && port < NUM_PORTS)? port: throwx(`port# ${port} out of range 0..${NUM_PORTS}`)));
//my_exports(ports, "ports");
//debug("ports", ports);


//import models used by this layout:
const {devpanel} = require("yalp21/models/devpanel");
//const {nullpx} = require("yalp21/models/nullpx");
//const ic = new model({w: 151, h: 10, port: [R0, R1], });
//model({name: "nullpx-globe", w: 1, port: B0, });
//const globes = Array.from({length: 4}).map((_, inx) => new model({name: `gl${inx + 1}`, w: 6*3, h: 1+12+1, port: B0});
//const tree = new model({name: "tree", w: 2*12, h: 33, port: B2});

//+ helpers:
const {RGSWAP, GBR2RGB} = require("yalp21/incl/colors");
const {nullpx} = require("yalp21/models/model");

const BLACK = 0xFF000000;


//assign controller ports/nodes to models:
//"prop" := model + port/nodes + rgswap + phys h/w of course
//use ports.* consts to catch invalid port#s
//debugger;
//NOTE: bullets are always WS2811 (no rgswap)
//NOTE: set max br for prop here, then use full br in fx
const used_ports =
[
//dev props:
//TODO: allow connect to any port?
//    {model: minidev, port: [ports.IC1, ports.IC2, ports.IC3]},
//    {model: nullpx(1), port: ports.R0},
    {model: devpanel, port: ports.DEVPORT, RGSWAP, MAXBR: 1/10, init: BLACK}, //go eacy on the eyes :P
//    {model: nullpx(1), port: ports.DEVPORT},
//show props (other layouts):
//    IC1 = 9, IC2 = 18,
//    GLOBES = 8, //GLOBES = 23,
//    LHCOL = 11, //COLS = G3,
//    TREE = 3, //MTREE = R3,
//    STAR = 20,
//    GIFT = 2, //GIFT_FACE = R2,
//    BOW = 15, //GIFT_TOP = B6,
//    SHEP1 = 1, SHEP3 = 14, SHEP24 = 10,
//    K1 = 21, K23 = 12, //K3 = R4,
//    ANGEL = 7,
//    MJB = 23, //MJB = 8,
//    FENCE = 22,
//    {model: nullpx(1), port: ports.R0},
//    {model: ic, port: [ports.IC1, ports.IC2, ports.IC3]},
//    {model: mtree, port: ports.MTREE},
//    {model: gift_face, port: ports.GIFT_FACE},
//    {model: gift_top, port: ports.GIFT_TOP},
//    {model: globes[0], port: ports.GLOBES},
//    {model: globes[1], port: ports.GLOBES},
//    {model: globes[2], port: ports.GLOBES},
//    {model: globes[3], port: ports.GLOBES},
//    {model: ic.segments[0], port: ports.IC1},
//    {model: ic.segments[1], port: ports.IC2},
//    {model: ic.segments[2], port: ports.IC3},
//assign nodes/ports to models:
].reduce((retval, {model, port: portnum, init, RGSWAP, MAXBR}) =>
{
//debugger;
    if (typeof model == "function") model = model({RGSWAP, MAXBR}); //instantiate model
    if (!model.numpx) throwx(`model '${model.name}' has no physical nodes?`);
    const usedport = retval[portnum] || (retval[portnum] = {});
    model.portnum = portnum;
    if (!isdef(model.firstpx)) model.firstpx = usedport.pxused || 0; //auto-allocate nodes to model
    usedport.pxused = Math.max(usedport.pxused || 0, model.firstpx + model.numpx); //track nodes used, allow overlap
//    this.nodes1D = new Uint32Array(numpx);
    if (init) model.fill(init);
    (usedport.models || (usedport.models = [])).push(model);
    return retval;
}, {});
my_exports({layout: used_ports});
//my_exports({used_ports});
debug("used ports", Object.keys(used_ports)); //, used_ports);


//CLI/test:
//show layout info + generate .csv
if (!module.parent)
{
    const rpt = Object.entries(used_ports)
        .sort(([lport, linfo], [rport, rinfo]) => lport - rport)
        .map(([portnum, portinfo]) => portinfo.models
            .sort((lmodel, rmodel) => lmodel.firstpx + lmodel.numpx - (rmodel.firstpx + rmodel.numpx))
            .map((model, inx, all) => (
            {
                '#': inx + "/" + all.length,
                port: portnum,
                model: model.name,
                'w x h': model.width + " x " + model.height,
                first: model.firstpx,
                '#nodes': model.numpx,
                usec: model.numpx * 30,
                rgswap: (model.RGSWAP || {}).name || "-",
                maxbr: model.MAXBR || "-",
                maxA: model.maxA, //(60 * (model.MAXBR || 3 * 255) / (3 * 255)) * model.numpx / 1e3,
            }))
            .concat( //port summary line
            {
                '#': "",
                port: portnum,
                model: "(subtotal)",
                'w x h': "",
//                first: portinfo.models.reduce((result, model) => Math.min(result, model.firstpx), 1e9),
                first: Math.min(...portinfo.models.map(model => model.firstpx)),
//                get '#nodes'() { return portinfo.models.reduce((result, model) => Math.max(result, model.firstpx + model.numpx), 0) - this.first; },
                get '#nodes'() { return Math.max(...portinfo.models.map(model => model.firstpx + model.numpx)) - this.first; },
                get usec() { return this['#nodes'] * 30; },
                rgswap: "",
                maxbr: "",
                maxA: portinfo.models.reduce((total, model) => total + model.maxA, 0),
            }))
        .flat();
//    txtout("dev lab layout:");
//tODO    const colw = Object.
//    rpt.forEach((line, inx) => txtout(Object.entries(line), inx));
    rpt2csv(shortname(__file) + "-layout.csv", rpt);
}


//eof