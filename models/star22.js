#!/usr/bin/env node
//ESOL Star v 2.0  2020
//TODO: Mega-star

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {PAL} = require("../incl/color-mgmt22");
const {Model, Rect, ZZ, flip} = require("../models/model22");
const {debug, TODO, srcline, replace_prop} = require("../incl/utils22");


//my_exports({mary: NatFig("Mary: NAT"), joseph: Natfig("Joseph: NAT"), Natfig}); //NOTE: exporting instances + ctor
my_exports({star: Star(), Star}); //NOTE: exporting instances + ctor

//star:
//~ radial 9 main spokes, each 2-4 wide, 11-14 long
function Star(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 100/100, //1-up on 20A supply
    order: "RGB",
    name: "Star: NAT, env",
    num_wired: 2*150, //2 5m strips
//map radial top-down view of spokes to X ofs (CW):
    spikes:
    {
        center: Rect({X: 0, Y: 0, get H() { return this.L; }, W: 3, L: 14}),
        get S() { const parent = this; return Rect({X: parent.center.rightE, Y: 0, W: parent.fb.W}); },
        get SW() { const parent = this; return Rect({X: parent.S.rightE, W: parent,.S + fbW; },
        get W() { return this.SW + diagW; },
        get NW() { return this.W + lrW; },
        get N() { return this.NW + diagW; },
        get NE() { return this.N + fbW; },
        get E() { return this.NE + diagW; },
        get SE() { return this.E + lrW; },
        get all() { return this.SE + diagW; },

        lr: {W: 3, L: 12}, //left, right
        fb: {W: 4, L: 12}, //front, back
        diag: {W: 2, L: 11},
        
    };

    
    get body() { const full = this; return Rect({W: 12, H: 18, get X() { return full.centerX(this.W); }, Y: 0}); },
//    get hood() { const full = this; return Rect({W: 22, H: 4, get X() { return (full.centerX(this.W); }, Y: body.topE}); }, //NOTE: front half is only 18
//    face_trim: Rect({W: 2, H: 4}),
//    face: Rect({W: 6, H: 2, get X() { return (18 - this.W) / 2; }, Y: /*this.head.Y*/20}), //face absent
//    face: Rect({W: 6, H: 2, get X() { return (18 - this.W) / 2; }, Y: /*this.head.Y*/20}), //face absent
    get hood() //NOTE: front half is only 18
    {
        const full = this;
        return Rect(
        {
            widths: [22-4, 22-4, 22, 22],
            get numpx() { return this.widths.reduce((numpx, w) => numpx + w, 0); },
            get W() {return Math.max(...this.widths)}, //22
            get H() { return this.widths.length; }, //4
            get X() { return full.centerX(this.W); },
            get lefts() { return this.widths.map(w => full.centerX(w)); },
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