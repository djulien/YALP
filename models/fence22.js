#!/usr/bin/env node
//ESOL silhouette fence 2021

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {PAL} = require("../incl/color-mgmt22");
const {Model, Rect, ZZ, flip} = require("../models/model22");
const {debug, TODO, srcline, replace_prop} = require("../incl/utils22");


//my_exports({mary: NatFig("Mary: NAT"), joseph: Natfig("Joseph: NAT"), Natfig}); //NOTE: exporting instances + ctor
my_exports({fence: Fence(), Fence}); //NOTE: exporting instances + ctor

//silhouette fence:
function Fence(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 25/100, //4A supply (12V)
    order: "RGB",
    name: "Fence: YARD, prop",
    num_wired: 2*50 +26, //2 5m strips for fence + ~ 1/2 for pole; 3 LED/pixel (12V)
//TODO: make sub-models?
    segments: //R2L
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

        pole: 25, //neighborhood contest add-on
    },
    get width() { return Object.values(this.segments).reduce((total, w) => total + w, 0); },
    height: 1,
    draw: function() //default texture
    {
        Object.values(this.segments).reduce((X, W, inx) => (this.fill((inx & 1)? PAL.RED.dim(25): PAL.GREEN.dim(25), Rect({X, W, Y: 0, H: 1})), X + W), 0);
    },
    get numpx() //CAUTION: nodes must be in wiring order
    {
        let numpx = 0;

//segments R2L
//        debug(this.nodes2D.length);
//        debug(this.nodes2D[0].length);
        const parent = this;
        Object.values(this.segments).reduce((X, W) => (/*debug({X, W, width: this.width}),*/ Array.from({length: W}, (_, x) => this.nodes2D[flip(X + x, parent.width)][0] = numpx++), X + W), 0);

        assert(numpx == this.width); //check all nodes mapped
        assert(numpx == this.num_wired);
        return numpx;
    },
}), opts || {}); }
if (!module.parent) setImmediate(async () => await module.exports.fence.unit_test()); //unit-test; run after inline init

//wisemen[0].csv();
//run();


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof