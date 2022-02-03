#!/usr/bin/env node
//ESOL snowglobes

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {PAL} = require("../incl/color-mgmt22");
const {Model, Rect, ZZ, flip} = require("../models/model22");
const {debug, TODO, srcline, replace_prop} = require("../incl/utils22");


my_exports({snowglobes: Array.from({length: 3}).map((_, inx) => Snowglobe({name: `snglobe_${inx}: HOUSE`})), Snowglobe}); //NOTE: exporting instances + ctor

//snowglobe:
function Snowglobe(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 65/100, //for 2-up on 20A supply
    order: "RGB",
    name: "Snowglobe: HOUSE, prop",
    num_wired: 228, //~2.25 100ct strings
//    width: 4, height: 3,
//    body: Rect({W: 12, H: 20, get X() { return (18 - this.W) / 2; }, Y: 0}),
    get body() { const parent = this; return Rect({W: 12, H: 20, get X() { return parent.centerX(this.W); }, Y: 0}); },
//    head: Rect({W: 18, H: 4, get X() { return (18 - this.W) / 2; }, Y: /*this.body.topE*/20}),
    get head() { const parent = this; return Rect({W: 18, H: 4, get X() { return parent.centerX(this.W); }, Y: this.body.topE}); },
//    face: Rect({W: 6, H: 2, get X() { return (18 - this.W) / 2; }, Y: /*this.head.Y*/20}), //face absent
    get face() { const parent = this; return Rect({W: 6, H: 2, get X() { return parent.centerX(this.W); }, Y: this.head.Y}); }, //face absent
    width: 6 * 3, //18
    height: 4 * 3 + 2, //14
    draw: function() //default texture
    {
        this.fill(PAL.MAGENTA.dim(50));
    },
    get numpx() //CAUTION: nodes must be in wiring order
    {
        let numpx = 0;

//    const virtpx = //virt px map to alternate px; NOTE: some map fwd, some map back
//    {
//        [[1, 0]]: [0, 0], [[1, 13]]: [0, 13], [[2, 0]]: [1, 0], [[2, 13]]: [1, 13], //first seg virt px
//        [[3, 13]]: [4, 13], [[4, 0]]: [3, 0], [[5, 0]]: [4, 0], [[5, 13]]: [4, 13], //second seg
//        [[6, 0]]: [7, 0], [[7, 13]]: [6, 13], [[8, 0]]: [7, 0], [[8, 13]]: [7, 13],
//        [[10, 0]]: [9, 0], [[10, 13]]: [9, 13], [[11, 0]]: [10, 0], [[11, 13]]: [10, 13],
//        [[12, 13]]: [13, 13], [[13, 0]]: [12, 0], [[14, 0]]: [13, 0], [[14, 13]]: [13, 13],
//        [[15, 0]]: [16, 0], [[16, 13]]: [15, 13], [[17, 0]]: [16, 0], [[17, 13]]: [16, 13],
//    };
//    const toppx = [0, 3, 6+1, 9, 12+1, 15]; //which colum#ns to grab extra px at top
//    const bottompx = [0, 3+1, 6, 9+1, 12, 15+1]; //which colum#ns to grab extra px at top
        const extrapx =
        {
            0: [0, 3+1, 6, 9+1, 12, 15+1], //colum#ns to grab extra px at top
            [-1]: [0, 3, 6+1, 9, 12+1, 15], //colum#ns to grab extra px at top
        };

//R2LT2B2T ZZ with repeating px @ top + bottom
        for (let x = 0; x < this.width; ++x)
        {
            const xflip = flip(x, this.width);
            const xgrp = xflip - xflip % 3;
//        if (toppx.includes(x))
//        {
//            const yflip = !(x & 1)? flip(0, H): 0;
//            nodes2D[xgrp + 0][yflip] = nodes2D[xgrp + 1][yflip] = nodes2D[xgrp + 2][yflip] = numpx++;
//        }
            for (let y = 0; y < this.height; ++y)
            {
                const yZZ = (xflip & 1)? flip(y, this.height): y;
                const ywrap = (yZZ < this.height / 2)? yZZ: yZZ - this.height;
                if (extrapx[ywrap])
                    if (!extrapx[ywrap].includes(x)) continue; //don't assign top/bottom node yet
                    else /*nodes2D[xgrp + 0][yflip] =*/ this.nodes2D[xgrp + 1][yZZ] = /*nodes2D[xgrp + 2][yflip] =*/ numpx++; //assign middle px only
                else this.nodes2D[xflip][yZZ] = numpx++; //([x, yflip].toString() in virtpx)? "(adjacent)": numpx++;
//if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
            }
//debugger;
//        if (bottompx.includes(x))
//        {
//            const yflip = !(x & 1)? flip(H - 1, H): H - 1;
//            nodes2D[xgrp + 0][yflip] = nodes2D[xgrp + 1][yflip] = nodes2D[xgrp + 2][yflip] = numpx++;
//        }
        }
//    remap(nodes2D, virtpx);
        assert(numpx == 18 * 14 - 6 * 2 * 2, `numpx ${numpx} != ${18 * 14 - 6 * 2 * 2}`); //228); //check all nodes mapped
        assert(numpx == this.num_wired, `numpx ${numpx} != #wired ${this.num_wired}`);
        return numpx;
    },
}), opts || {}); }
if (!module.parent) setImmediate(async () => await module.exports.snowglobes[0].unit_test()); //unit-test; run after inline init

//wisemen[0].csv();
//run();


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof