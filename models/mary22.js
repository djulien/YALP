#!/usr/bin/env node
//ESOL Mary + Joseph

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {PAL} = require("../incl/color-mgmt22");
const {Model, Rect, ZZ, flip} = require("../models/model22");
const {debug, TODO, srcline, replace_prop} = require("../incl/utils22");


//my_exports({mary: NatFig("Mary: NAT"), joseph: Natfig("Joseph: NAT"), Natfig}); //NOTE: exporting instances + ctor
my_exports({mary: Mary(), Mary}); //NOTE: exporting instances + ctor

//Mary:
function Mary(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 50/100, //for 2-up on 20A supply
    order: "RGB",
    name: "Mary: NAT, figure",
    num_wired: 2*150-4, //2 5m strips - cut off a few :(
    get body() { const parent = this; return Rect({W: 12, H: 18, get X() { return parent.centerX(this.W); }, Y: 0}); },
//    get hood() { const full = this; return Rect({W: 22, H: 4, get X() { return (full.centerX(this.W); }, Y: body.topE}); }, //NOTE: front half is only 18
//    face_trim: Rect({W: 2, H: 4}),
//    face: Rect({W: 6, H: 2, get X() { return (18 - this.W) / 2; }, Y: /*this.head.Y*/20}), //face absent
//    face: Rect({W: 6, H: 2, get X() { return (18 - this.W) / 2; }, Y: /*this.head.Y*/20}), //face absent
    get hood() //NOTE: front half is only 18
    {
        const parent = this;
        return Rect(
        {
            widths: [22-4, 22-4, 22, 22],
            get numpx() { return this.widths.reduce((numpx, w) => numpx + w, 0); },
            get W() {return Math.max(...this.widths)}, //22
            get H() { return this.widths.length; }, //4
            get X() { return parent.centerX(this.W); },
            get lefts() { return this.widths.map(w => parent.centerX(w)); },
            Y: this.body.topE,
        });
    },
    get width() { return Math.max(this.body.W, this.hood.W); }, //22
    get height() { return this.body.H + this.hood.H; }, //22
    draw: function() //default texture
    {
        this.fill(PAL.OFF);
        this.fill(PAL.RED.dim(50), this.body);
        this.fill(PAL.WARM_WHITE.dim(50), this.hood);
    },
    get numpx() //CAUTION: nodes must be in wiring order
    {
        let numpx = 0;
        assert(!(this.width & 1), "width not even");

//body L2RT2B2T ZZ
//        retval.body = {x: (W - bodyW) / 2, y: 0, w: bodyW, h: bodyH};
        for (let x = 0; x < this.body.W; ++x)
            for (let y = 0; y < this.body.H; ++y)
            {
                const yZZ = !(x & 1)? flip(y, this.body.H): y;
                this.nodes2D[this.body.X + x][this.body.Y + yZZ] = numpx++;
            }

//hood F2BL2R2L ZZ
//        retval.hood = {x: (W - hoodW) / 2, y: bodyH, w: hoodW, h: hoodH};
        for (let y = 0; y < this.hood.H; ++y)
            for (let x = 0; x < this.hood.widths[y]; ++x)
            {
//                if (y < 2 && (x < 2 || x >= this.hood.W - 2)) continue; //kludge: front is shorter
                const xZZ = !(y & 1)? flip(x, this.hood.widths[y]): x;
                this.nodes2D[this.hood.lefts[y] + xZZ][this.hood.Y + y] = numpx++;
            }

        assert(numpx == this.body.numpx + this.hood.numpx, `numpx ${numpx} != body ${this.body.area} + hood ${this.hood.area} = ${this.body.numpx + this.hood.numpx}`); //check all nodes mapped
        return numpx;
    },
}), opts || {}); }
if (!module.parent) setImmediate(async () => await module.exports.mary.unit_test()); //unit-test; run after inline init

//wisemen[0].csv();
//run();


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof