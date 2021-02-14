#!/usr/bin/env node
// angel

'use strict'; //find bugs easier
const model = require("./model");
const {ZZ, flip} = require("./incl/utils");

Object.assign(module.exports, {angel});


const [bodyW, bodyH] = [8, 22]; //L2RT2B2T ZZ
const [wingsW, wingsH] = [6, 25]; //L2RT2B2T ZZ
const [hairW, hairH] = [3, 8]; //L2RT2B2T ZZ; NOTE: uneven length (some skipped)
const [haloW, haloH] = [8 + 8, 1];
const [trumpetW, trumpetL] = [4, 12]; //CWB2F2B ZZ


function angel(opts)
{
    return model("angel 2.0", () =>
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
if (!module.parent) setImmediate(() => rgbtree().dump()); //unit-test; run after inline init


//eof