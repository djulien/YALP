#!/usr/bin/env node
// RGB globles - replace AngelBells, ArchFans

'use strict'; //find bugs easier
const {model, ZZ, flip, remap} = require("./model");

Object.assign(module.exports, {globe});


//globe ornaments:
//replaces AngelBells, ArchFans
//NOTE: multiple grid px map to same physical LED (at top/bottom)
//TODO: model.clone() instead of repeating ctor?
function globe(opts)
//s = Array.from({length: 4}).map((prop, inx) => 
{
    return model(`globes_${inx}: GLOBES`, () =>
    {
        const {nodes2D, width: W, height: H} = grid(18, 14);
        const virtpx = //virt px map to alternate px; NOTE: some map fwd, some map back
        {
            [[1, 0]]: [0, 0], [[1, 13]]: [0, 13], [[2, 0]]: [1, 0], [[2, 13]]: [1, 13], //first seg virt px
            [[3, 13]]: [4, 13], [[4, 0]]: [3, 0], [[5, 0]]: [4, 0], [[5, 13]]: [4, 13], //second seg
            [[6, 0]]: [7, 0], [[7, 13]]: [6, 13], [[8, 0]]: [7, 0], [[8, 13]]: [7, 13],
            [[10, 0]]: [9, 0], [[10, 13]]: [9, 13], [[11, 0]]: [10, 0], [[11, 13]]: [10, 13],
            [[12, 13]]: [13, 13], [[13, 0]]: [12, 0], [[14, 0]]: [13, 0], [[14, 13]]: [13, 13],
            [[15, 0]]: [16, 0], [[16, 13]]: [15, 13], [[17, 0]]: [16, 0], [[17, 13]]: [16, 13],
            [[18, 13]]: [19, 13], [[19, 0]]: [18, 0], [[20, 0]]: [19, 0], [[20, 13]]: [19, 13],
        };
//L2RT2B2T ZZ with repeating px @ top + bottom
        let numpx = 0;
        for (let x = 0; x < W; ++x)
            for (let y = 0; y < H; ++y)
            {
                const yflip = !(x & 1)? flip(y, H): y; //H - y - 1: y;
                nodes2D[x][yflip] = ([x, yflip].toString() in virtpx)? "(adjacent)": numpx++;
//if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
            }
        remap(nodes2D, virtpx);
    assert(numpx == 18 * 14 - virtpx.length); //228); //check all nodes mapped
    return {numpx, nodes2D};

//    function xy(x, y) { return x * H + y; } //generate unique key for (x, y) pairs
}));
//const globes = Array.from({length: 4}).map((item) => globe.
//const dict = {[[1, 0]]: [0, 0], [[2, 0]]: [1, 0]}; debug(dict, [1, 2].toString()); process.exit();
if (!module.parent) setImmediate(() => globe().dump()); //unit-test; run after inline init


//eof