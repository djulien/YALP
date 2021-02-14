#!/usr/bin/env node
// shepherds

'use strict'; //find bugs easier
const model = require("./model");
const {ZZ, flip} = require("./incl/utils");

Object.assign(module.exports, {shepherd});


const [bodyW, bodyH] = [12, 22];
const [hoodW, hoodD] = [18, 4];
const [hdbkW, hdbkH] = [5, 8]; //some skipped
const [staffW, staffH] = [2, 8];


//body is 12x22 grid L2RB2T2B ZZ
//hood is 4x18 R2R2RF2B ZZ front + 5 x 7.5 back of head
//staff hook is 2x8 but base is virtualized from body
function shepherd(opts)
{
    return model("shepherd 3.0: SHEP, NAT", () =>
    {
        const {nodes2D, width: W, height: H} = grid(12 + 2, 22 + 12); //map cane parallel to body, hood above body
        let numpx = 0;
        for (let x = 0; x < ; ++x)
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
if (!module.parent) setImmediate(() => shep().dump()); //unit-test; run after inline init


//eof