#!/usr/bin/env node
// gift - face (grid), side, top, bow

'use strict'; //find bugs easier
const {model, ZZ, flip, remap} = require("./model");
const {log, TODO} = require("../incl/utils");
//const {ZZ, flip, remap} = require("./incl/utils");

Object.assign(module.exports, {gift_face, gift_side, gift_top, bow});


const giftH = 36;
const ribbonW = 5; //enough for text ;)

TODO("composite ribbon (incl face)?");


//gift:
function gift_face(opts)
{
    return model("gift-face: GIFT", () =>
    {
        const {nodes2D, width: W, height: H} = grid(23, giftH);
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
        assert(numpx == 23 * giftH); //check all nodes mapped
        return {numpx, nodes2D};
    });
}
if (!module.parent) setImmediate(() => gift_face().dump()); //unit-test; run after inline init



//easter egg: width 5 can show scrolling text ;)
function gift_side(opts)
{
TODO("make gift side extension of face and/or top ribbon (radial)?");
    return model("gift-side: GIFT", () =>
    {
        const {nodes2D, width: W, height: H} = grid(ribbonW, giftH); //gift_face.height);
        let numpx = 0;
//R2LT2B2T ZZ
        for (let x = 0; x < W; ++x)
            for (let y = 0; y < H; ++y)
            {
                const xflip = flip(x, W); //W - x - 1;
                const yflip = (x & 1)? flip(y, H): y; //H - y - 1: y;
TODO("use ZZ()?")
                nodes2D[xflip][yflip] = numpx++;
//if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
            }
        assert(numpx == ribbonW * 36); //check all nodes mapped
        return {numpx, nodes2D};
    });
}
if (!module.parent) setImmediate(() => gift_side().dump()); //unit-test; run after inline init


function gift_top(opts)
{
    return model("gift-top: GIFT", () =>
    {
        const DIRECTION = {S: 1, W: 2, E: 3}; //, N: 4};
        const {nodes2D, width: W, height: H} = grid(direction.length * ribbonW, Math.floor(giftH / 2)); //gift_face.height / 2);
        let numpx = 0;
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
//radial from center, ZZ
        for (let r = 0; r < H; ++r)
            for (const [key, val] of Object.entries(DIRECTION))
                for (let x = 0; x < 5; ++x)
                {
                    const yflip = (x & 1)? flip(r, H): r; //H - r - 1: r;
                    nodes2D[x + val * 5][yflip] = ([x + val * 5, yflip].toString() in virtpx)? "(adjacent)": numpx++;
//if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
                }
        remap(nodes2D, virtpx);
        assert(numpx == ribbonW * (36 + 14), `numpx ${numpx} != ${(36 + 14) * ribbonW}`); //check all nodes mapped
        return {numpx, nodes2D};
    });
}
if (!module.parent) setImmediate(() => gift_top().dump()); //unit-test; run after inline init


//bow:
//easter eggs: heart, and width 5 can show scrolling text ;)
function bow(opts)
{
    return model("bow: GIFT", () =>
    {
        const {nodes2D, width: W, height: H} = grid(30 + 30 + 20, ribbonW);
        let numpx = 0;
        const skip = {[[30 + 30, 2]]: 2}; //whoops, I can't count :P
//F2BL2R2L ZZ
        for (let y = 0; y < H; ++y)
            for (let x = 0; x < W; ++x)
            {
                const xflip = (y & 1)? flip(x, W): x; //W - x - 1;
                if ([xflip, y].toString() in skip) numpx += skip[[xflip, y]];
                nodes2D[xflip][y] = numpx++;
    //if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
            }
        assert(numpx == (30 + 30 + 20) * ribbonW + 2); //check all nodes mapped or skipped
        return {numpx, nodes2D};
    });
}
if (!module.parent) setImmediate(() => bow().dump()); //unit-test; run after inline init

//eof