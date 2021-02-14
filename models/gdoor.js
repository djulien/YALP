#!/usr/bin/env node
// RGB tree - not really a "mega"tree :P

'use strict'; //find bugs easier
const model = require("./model");
const {ZZ, flip} = require("./incl/utils");

Object.assign(module.exports, {gdoor});


//48x16 garage door grid:
//RIP ;'(
//gdoor (RIP):
//2x24x16: L2RB2T right, R2LT2B left
function OLD_xy_gdoor(x, y)
{
//	if (ISDEV) return xy_smpanel(Math.floor(x * 32/48), 8-1 - Math.floor(y * 8/16));
//	if (ISDEV) return (y < 8)? xy_smpanel(x, 8-1 - y): xy_smpanel(x + 16, 16-1 - y);
	const W = 48, H = 16;
//    const NUMPX = 2 * W2 * H;
	var which;
	if ((x < 0) || (x >= W) || (y < 0) || (y >= H)) which = W * H; //eof
	else if (x < W/2) //left
	{
		which = W * H - W * (y >> 1);
		which += (y & 1)? -W/2-1 - x: x - W/2;
	}
	else //if (x < W) //right
	{
		which = W/2 * H - W * (y >> 1);
		which += (y & 1)? -W + x - W/2: W/2-1 - x;
	}
//	console.log("(%d, %d) => '%d", x, y, which);
	which += NULLPX; //skip null pixel(s)
	return which;
}
//if (!module.parent) setImmediate(() => rgbtree().dump()); //unit-test; run after inline init


//eof