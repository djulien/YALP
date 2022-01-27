#!/usr/bin/env node
//ESOL gdoor2

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {Model, ZZ, flip} = require("../models/model21");
const {debug, srcline, replace_prop} = require("../incl/utils21");


my_exports({gdoor: Gdoor(), Gdoor}); //NOTE: exporting singleton + ctor


//gdoor:
//24x150/2: M2TL2R2L ZZ upper, M2BL2R2L ZZ lower
function Gdoor(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 25/100, //half of px can be @50%
    order: "RGB",
    num_wired: 24 * (150 - 13 - 5)/2, //24 strips of 5m 30/m, double-spaced
    name: "gdoor-66x24", //"gdoor-75x24",
//    get width() { return SQSIZE * 2, height: SQSIZE / 2; },
    width: 150/2 - 9, height: 24,
    get numpx()
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


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof