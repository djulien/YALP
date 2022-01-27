#!/usr/bin/env node
//ESOL tree

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {Model, ZZ, flip} = require("../models/model21");
const {debug, TODO, srcline, replace_prop} = require("../incl/utils21");


my_exports({tree: Tree(), Tree}); //NOTE: exporting singleton + ctor

//240 deg M-tree:
TODO("make span configurable");
function Tree(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 75/100, //for dual 20A supply
    order: "RGB",
//    color:  {H: HUE.GREEN, V: 60},
    name: "M-tree 240: MTREE",
    num_wired: 792,
    width: 2 * 12, //#branches
    height: 33,
    get numpx()
    {
        let numpx = 0;
//R2LB2T2B ZZ
        for (let x = 0; x < this.width; ++x)
            for (let y = 0; y < this.height; ++y)
            {
                const xflip = flip(x, this.width); //W - x - 1;
                const yflip = (x & 1)? flip(y, this.height): y; //H - y - 1: y;
                this.nodes2D[xflip][yflip] = numpx++;
            }
        assert(numpx == this.width * this.height); //check all nodes mapped
        return numpx;
    },
}), opts || {}); }


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof