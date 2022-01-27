#!/usr/bin/env node
//YALP stand-alone prop animation

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {Model, ZZ, flip} = require("../models/model21");
const {debug, srcline, replace_prop} = require("../incl/utils21");


my_exports({mini_test: mini_test(), dev_panel: dev_panel(), dev_strip: dev_strip(), Blank}); //NOTE: exporting singletons, not ctors

//const dev_panel = new Model( //can't hoist const
function dev_panel(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 1/100, //for eye pain
    order: "RGB",
    SQSIZE: 16,
    get num_wired() { return this.SQSIZE ** 2; },
    name: "devpanel-32x8",
//    get width() { return SQSIZE * 2, height: SQSIZE / 2; },
    get width() { return replace_prop.call(this, this.SQSIZE * 2); }, get height() { return replace_prop.call(this, this.SQSIZE / 2); },
    get numpx()
    {
        let numpx = 0;
        const [W, H] = [this.width, this.height];
//debug("getting numpx", W, H, this.width, this.height, this.maxbr, this.order, srcline(+1));
//TODO: use ZZ()
//    let (y = 0; y < H; ++y)
//        let (x = 0; x < W; ++x)
//            ZZ(x, W / 2)
//    const [cycle, step] = [Math.floor(val / limit), val % limit];
//    return (cycle & 1)? flip(step, limit): step; //limit - step - 1: step;
//left: ZZ L2RB2T, right: ZZ R2LT2B
        for (let y = 0; y < H * 2; ++y) //half height
            for (let x = 0; x < W / 2; ++x) //double width
            {
                const xofs = (y < H)? 0: W / 2; //left vs. right half
                const xZZ = ((y & 1) ^ (y < H))? x: flip(x, W / 2); //horiz ZZ; top half reversed
                const yZZ = (y < H)? y: flip(y, 2 * H);
//            nodes2D[ynew][xnew] = numpx++;
//debug(x, y, numpx, this.nodes2D.length, this.nodes2D[0].length);
                this.nodes2D[xofs + xZZ][yZZ] = numpx++; //=> outnodes[pxnum]
//debug("here1");
//if (!y || !x || (y == H * 2 - 1) || (x == W / 2 - 1)) debug(`(${x}/${W / 2}, ${y}/${H * 2}) => (${xnew}, ${ynew}):`, nodes2D[xnew][ynew]); //debug edges
            }
        assert(numpx == this.SQSIZE ** 2, `numpx ${numpx} != sq^s ${this.SQSIZE ** 2}`.brightRed); //check all nodes mapped
        return numpx;
    },
}), opts || {}); }


//const dev_strip = new Model( //can't hoist const
function dev_strip(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 1/100, //70/100, //for eye pain
    order: "GRB",
    name: "devstrip-32",
    width: 32, //height: 1, //horizontal
    num_wired: 32,
    get numpx() //{ return replace_prop.call(this, () => //222); },
    {
        let numpx = 0;
        for (let x = 0; x < this.width; ++x)
            this.nodes2D[flip(x, this.width)][0] = numpx++;
        assert(numpx == 32 * 1, `numpx ${numpx} != 32`.brightRed);
        return numpx;
    },
}), opts || {}); }


function mini_test(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 1/100, //for eye pain
    order: "RGB",
    width: 4, height: 3,
    num_wired: 12,
    name: "mini-test-4x3",
    get numpx()
    {
        let numpx = 0;
        const [W, H] = [this.width, this.height];
//debug("getting numpx", W, H, this.width, this.height, this.maxbr, this.order, srcline(+1));
        for (let xy = 0; xy < W * H; ++xy)
            this.nodes2D[ZZ(xy, W)][ZZ.cycle] = numpx++; //=> outnodes[pxnum]
        assert(numpx == 3 * 4, `numpx ${numpx} != ${3 * 4}`.brightRed); //check all nodes mapped
        return numpx;
    },
}), opts || {}); }


//blank canvas:
//mainly for RLE debug
function Blank(opts) { return Object.assign(new Model(
{
//    maxbr: 1/100, //for eye pain
    order: "RGB",
    name: "blank",
    width: (opts || {}).width || 16,
    height: (opts || {}).height || 16,
    get num_wired() { return this.width * this.height; },
    get numpx()
    {
//broken        this.mapall();
        let numpx = 0;
        for (let x = 0; x < this.width; ++x)
            for (let y = 0; y < this.height; ++y)
                this.nodes2D[x][y] = numpx++;
        return numpx; //this.width * this.height;
    },
}), opts || {}); }


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof