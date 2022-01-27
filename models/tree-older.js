#!/usr/bin/env node
// RGB tree - not really a "mega"tree :P

'use strict'; //find bugs easier
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW
const {Model, Grid, ZZ, flip} = require("../models");
//const {ZZ, flip} = require("./incl/utils");

//Object.assign(module.exports, {rgbtree});
//my_exports({Tree}); //tree: tree()});


class Tree extends Model
{
    #OPTS =
    {
        name: "RGB-tree 240: MTREE",
        deg: 240,
    };
    constructor(opts)
    {
        super(Object.assign(#OPTS, opts || {}));
        const {nodes2D, width: W, height: H} = new Grid(2 * 12, 33-1);
        let numpx = 0;
//R2LB2T2B ZZ
        for (let x = 0; x < W; ++x)
            for (let y = 0; y < H; ++y)
            {
                const xflip = flip(x, W); //W - x - 1;
                const yflip = (x & 1)? flip(y, H): y; //H - y - 1: y;
//TODO("use ZZ()?")
                nodes2D[xflip][yflip] = numpx++;
//if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
            }
        assert(numpx == 2 * 12 * (33-1)); //check all nodes mapped
//        return {numpx, nodes2D};
        Object.assign(this, {numpx, nodes2D});
    }
};
my_exports({Tree}); //tree: tree()});
if (!module.parent) setImmediate(() => new Tree().csv()); //unit-test; run after inline init


//240 deg RGB-tree:
function OLD_rgbtree(opts)
{
    return model("RGB-tree 240: MTREE", () =>
    {
        const {nodes2D, width: W, height: H} = grid(2 * 12, 33);
        let numpx = 0;
//R2LB2T2B ZZ
        for (let x = 0; x < W; ++x)
            for (let y = 0; y < H; ++y)
            {
                const xflip = flip(x, W); //W - x - 1;
                const yflip = (x & 1)? flip(y, H): y; //H - y - 1: y;
TODO("use ZZ()?")
                nodes2D[xflip][yflip] = numpx++;
//if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
            }
        assert(numpx == 2 * 12 * 33); //check all nodes mapped
        return {numpx, nodes2D};
    });
}
//if (!module.parent) setImmediate(() => rgbtree().dump()); //unit-test; run after inline init


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof