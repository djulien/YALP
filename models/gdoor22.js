#!/usr/bin/env node
//ESOL Gdoor v2.1 2022

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {PAL} = require("../incl/color-mgmt22");
const {Model, Rect, ZZ, flip} = require("../models/model22");
const {debug, TODO, srcline, replace_prop} = require("../incl/utils22");


//my_exports({gdoor: Gdoor(), Gdoor}); //NOTE: exporting singleton + ctor
my_exports({gdoor: Object.entries({L: -1, M: 0, U: +1}).map(([key, dir]) => Gdoor({name: `gdoor_${key}: HOUSE`, dir})), Gdoor}); //NOTE: exporting instances + ctor
TODO("use 2 gdoor panels instead of 3?  interleave?");


//gdoor:
//24x150/2: M2TL2R2L ZZ upper, M2BL2R2L ZZ lower
function Gdoor(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 25/100, //half of px can be @50%, 20A x 3 power supply
    order: "RGB",
    name: "Gdoor: HOUSE, prop", //"gdoor2-66x24", //"gdoor-75x24",
//    num_wired: 24 * (150 - 13 - 5)/2, //24 strips of 5m 30/m, double-spaced
    num_wired: 24/3 * 150,
//    get width() { return SQSIZE * 2, height: SQSIZE / 2; },
//    get width() { return Math.max(this.upper.W, this.middle.W, this.lower.W); }, //: 66
//    get height() { return this.lower.H + this.middle.H + this.upper.H; }, //24
//    get upper() { const parent = this; return Rect({X: 0, Y: parent.middle.topE, W: (150 - 13) / 2, H: 8}); }, //parent.width, H: 10}); }, //parent.height / 3}); },
//    get middle() { const parent = this; return Rect({X: 0, Y: parent.lower.topE, W: (150 - 13) / 2, H: 8}); }, //parent.width, H: parent.height / 3}); },
//    get lower() { const parent = this; return Rect({X: 0, Y: 0, W: (150 - 13) / 2, H: 8}); }, //parent.width, H: 10}); }, //parent.height / 3}); },
    width: 150, height: 8, //(150 - 13) / 2, height: 8,
    get numpx()
    {
        let numpx = 0;

        for (let y = 0; y < this.height; ++y)
        {
            const pad = (opts.dir || y != this.height / 2)? 6: 7;
            numpx += pad;
            for (let x = 0; x < this.width; ++x)
            {
                const ydir = (opts.dir < 0)? flip(y, this.height): (opts.dir > 0)? y: (y < this.height / 2)? (y + this.height / 2): flip(y, this.height); // % this.height;
                const xZZ = (y & 1)? x: flip(x, this.width); //horiz ZZ
                this.nodes2D[/*this.upper.X +*/ xZZ][/*this.upper.Y +*/ ydir] = numpx++;
                ++numpx;
            }
            numpx += 13 - pad;
        }

/*
/upper: L2R2LB2T ZZ
        for (let y = 0; y < this.upper.H; ++y) //upper third
            for (let x = 0; x < this.upper.W; ++x)
            {
                const xZZ = (y & 1)? x: flip(x, this.upper.W); //horiz ZZ
                this.nodes2D[this.upper.X + xZZ][this.upper.Y + y] = numpx++;
            }
//middle: L2R2L outward from middle ZZ
        for (let y = 0; y < this.middle.H; ++y) //middle
            for (let x = 0; x < this.middle.W; ++x)
            {
                const youtward = (y < this.middle.H / 2)? y + this.middle.H / 2: flip(y, this.middle.H);
                const xZZ = (y & 1)? flip(x, this.middle.W): x; //horiz ZZ
                this.nodes2D[this.middle.X + xZZ][this.middle.Y + youtward] = numpx++;
            }
        
//lower: L2R2LT2B ZZ
        for (let y = 0; y < this.lower.H; ++y) //lower half
            for (let x = 0; x < this.lower.W; ++x)
            {
                const yflip = flip(y, this.lower.H);
                const xZZ = (yflip & 1)? x: flip(x, this.lower.W); //horiz ZZ
                this.nodes2D[this.lower.X + xZZ][this.lower.Y + yflip] = numpx++;
            }
*/

        assert(numpx == this.width * this.height, `numpx ${numpx} != ${this.width * this.height}`.brightRed); //check all nodes mapped
        assert(numpx == this.num_wired, `numpx ${numpx} != #wired ${this.num_wired}`);
        return numpx;
    },
    get numpx_OLD()
    {
        let numpx = 0;
//upper: B2TL2R2L ZZ
        for (let y = this.height / 2; y < this.height; ++y) //upper half
            for (let x = 0; x < this.width; ++x)
            {
                const xZZ = !(y & 1)? x: flip(x, this.width); //horiz ZZ
                this.nodes2D[xZZ][y] = numpx++;
            }
//lower: T2BL2R2L ZZ
        for (let y = 0; y < this.height / 2; ++y) //lower half
            for (let x = 0; x < this.width; ++x)
            {
                const yflip = flip(y, this.height / 2);
                const xZZ = (yflip & 1)? x: flip(x, this.width); //horiz ZZ
                this.nodes2D[xZZ][yflip] = numpx++;
            }
                
        assert(numpx == this.width * this.height, `numpx ${numpx} != ${this.width * this.height}`.brightRed); //check all nodes mapped
        return numpx;
    },
}), opts || {}); }
if (!module.parent) setImmediate(async () => await module.exports.gdoor.unit_test()); //unit-test; run after inline init


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof