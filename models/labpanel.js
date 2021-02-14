#!/usr/bin/env node
// RGB tree - not really a "mega"tree :P

'use strict'; //find bugs easier
const model = require("./model");
const {ZZ, flip} = require("./incl/utils");

Object.assign(module.exports, {rgbtree});


//lab gift panel:
//16x16: B2TR2L
function labpanel(opts)
{
    return model("lab gift panel: LAB", () => //(x, y) =>
    {
        const {nodes2D, width: W, height: H} = grid(16, 16);
        let numpx = 0;
//ZZ R2LB2T
        for (let x = 0; x < W; ++x)
            for (let y = 0; y < H; ++y)
                nodes2D[W - x - 1][(x & 1)? H - y - 1: y] = numpx++;
        return {numpx, nodes2D};
    });
}
if (!module.parent) setImmediate(() => labpanel().dump()); //unit-test; run after inline init


//junk:
function OLD_xy_gifr_lab(x, y)
{
	const W = 16, H = 16;
	if ((x < 0) || (x >= W) || (y < 0) || (y >= H)) return W * H + NULLPX; //eof
	var which = W * H - 2 * H * (x >> 1);
	which += (x & 1)? -H-1 - y: y - H;
//	console.log("(%d, %d) => '%d", x, y, which);
	which += NULLPX; //skip null pixel(s)
	return which;
}


//eof