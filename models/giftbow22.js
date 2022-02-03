#!/usr/bin/env node
//ESOL bow

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {PAL} = require("../incl/color-mgmt22");
const {Model, Rect, ZZ, flip} = require("../models/model22");
const {debug, TODO, srcline, replace_prop} = require("../incl/utils22");


//my_exports({mary: NatFig("Mary: NAT"), joseph: Natfig("Joseph: NAT"), Natfig}); //NOTE: exporting instances + ctor
my_exports({bow: Bow(), Bow}); //NOTE: exporting instances + ctor

//bow:
function Bow(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 75/100, //for 20A supply
    order: "RGB",
    name: "Bow: YARD, prop",
    WHOOPS: 2, //ended up with a couple extra pixels in middle row of prop :(
    get num_wired() { return 5 * 80 + this.WHOOPS; },
    get loop() { const parent = this; return Rect({X: 0, Y: 0, W: 60, H: parent.height}); },
    get tail() { const parent = this; return Rect({X: parent.loop.rightE, Y: parent.loop.Y, W: 20 /*+ parent.WHOOPS*/, H: parent.height}); },
    get width() { return this.loop.W + this.tail.W; },
    height: 5,
    draw: function() //default texture
    {
        this.fill(PAL.MAGENTA.dim(20));
    },
    get numpx() //CAUTION: nodes must be in wiring order
    {
        let numpx = 0;

//loop L2R2LF2B ZZ
//        retval.body = {x: (W - bodyW) / 2, y: 0, w: bodyW, h: bodyH};
        for (let y = 0; y < this.loop.H; ++y)
        {
//            for (let x = 0, xshorten = (y != 2)? this.WHOOPS: 0; x < this.loop.W - xshorten; ++x)
            for (let x = 0; x < this.loop.W; ++x)
            {
                const xZZ = !(y & 1)? flip(x, this.loop.W): x; // - xshorten): x);
//                if (xZZ > 1 || y == 2) 
                this.nodes2D[this.loop.X + xZZ][this.loop.Y + y] = numpx++;
            }
            if (y == 2) numpx += this.WHOOPS;
        }

//tail L2R2LB2F ZZ
//        retval.hood = {x: (W - hoodW) / 2, y: bodyH, w: hoodW, h: hoodH};
        for (let y = 0; y < this.tail.H; ++y)
            for (let x = 0; x < this.tail.W; ++x)
            {
                const yflip =  flip(y, this.tail.H);
                const xZZ = (y & 1)? flip(x, this.tail.W): x;
                this.nodes2D[this.tail.X + xZZ][this.tail.Y + yflip] = numpx++;
            }

        assert(numpx == this.loop.numpx + this.tail.numpx + this.WHOOPS, `numpx ${numpx} != loop ${this.loop.area} + tail ${this.tail.area} + ${this.WHOOPS} = ${this.loop.numpx + this.tail.numpx + this.WHOOPS}`); //check all nodes mapped
        assert(numpx == this.num_wired);
        return numpx;
    },
}), opts || {}); }
if (!module.parent) setImmediate(async () => await module.exports.bow.unit_test()); //unit-test; run after inline init

//wisemen[0].csv();
//run();


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof