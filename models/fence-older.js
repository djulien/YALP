#!/usr/bin/env node
// dev panel

'use strict'; //find bugs easier
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW
//const {my_exports} = require("yalp/incl/utils");
//const {TODO} = require("yalp/incl/msgout");
//const {model, grid, shmslice, ZZ, flip} = require("./model");
const {Model, Grid, /*ZZ, flip*/} = require("./model");
//const {ZZ, flip} = require("./incl/utils");
const (debug} = require("../index.js");


//Object.assign(module.exports, {rgbtree});
my_exports({Fence}); //tree: tree()});
//my_exports({fence: fence()});


class Fence extends Model
{
    const OPTS =
    {
        name: "12V fence: YARD",
//        deg: 240,
    };
//virt px (grps):
    const px =
    {
        RCandle: 5,
        RBell: 6,
        XAndel: 7,
        RK_camel: 7,
        K_camel_star: 6,
        LCandle: 4,
        RAngel: 6,

        K_camel_kneel: 7,
        MJB_star: 7,
        Shep2_kneel: 7,
        LAngel: 6,
        City: 7,
        Sheps2_star: 7,
        LShep: 6,
        LBell: 5,
        Joy: 7,
    };
    constructor(opts)
    {
        super(Object.assign(OPTS, opts || {});
        const {nodes1D, width: W, height: H} = new Grid(2 * 50, 1);
//        let numpx = 0;
//    const numpx = Object.values(px).reduce((numpx, more) => numpx + more, 0);
//    if (numpx != 2*50) throw `fence wrong #pixels: ${numpx} should be ${2 * 50}`.brightRed;
        const numpx = Object.entries(px).reduce((startpx, [name, count], inx) =>
        {
            Object.defineProperties(this,
            {
                [inx]: //array-like access to segs
                {
                    get() { return nodes1D[startpx]; }, //first px rep entire grp
                    set(newval) { debug("fence[%d] fill %d..%d", inx, startpx, startpx + count); nodes1D.fill(newval, startpx, startpx + count); },
                    enumerable: true,
                },
                [name]: //access by seg name also
                {
                    get() { return this[inx]; },
                    set(newval) { this[inx] = newval; },
                    enumerable: true,
                },
            });
//            numpx += count;
            return startpx + count;
        }, 0);
        assert(numpx == 2 * 50); //check all nodes mapped
//        return {numpx, nodes2D};
        Object.assign(this, {numpx, nodes1D, width: numkeys(px), height: 1});
    }
};
if (!module.parent) setImmediate(() => new Fence().csv()); //unit-test; run after inline init


const X_fence =
function OLX_fence()
{
    const px = fence.px =
    {
        RCandle: 5,
        RBell: 6,
        XAndel: 7,
        RK_camel: 7,
        K_camel_star: 6,
        LCandle: 4,
        RAngel: 6,

        K_camel_kneel: 7,
        MJB_star: 7,
        Shep2_kneel: 7,
        LAngel: 6,
        City: 7,
        Sheps2_star: 7,
        LShep: 6,
        LBell: 5,
        Joy: 7,
    };
    const numpx = Object.values(px).reduce((numpx, more) => numpx + more, 0);
    if (numpx != 2*50) throw `fence wrong #pixels: ${numpx} should be ${2 * 50}`.brightRed;
    return fence; //Object.assign(fencepx, retval);
}


function numkeys(obj) { return Object.keys(obj || {}).length; }

function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }


function old()
{
///////////////////////////////////////////////////////////////////////////////
////
/// Custom model: my devpanel
//


//small dev/test panel (16x16 hacked):
//2x16x8: L2RB2T left, R2LT2B right
//32x8 in memory: [col 0: 8 rows B2T], [col 1: 8 rows B2T], [col 2: 8 rows B2T], ..., [col 31: 8 rows B2T]
//const devpanel = new model({name: "devpanel", w: 32, h: 8, port: 0});
//const devpanel = model("dev panel: DEV", () => //(x, y) =>
my_exports({devpanel}); //(), "devpanel"); //instance, not ctor
function devpanel(opts)
{
    if (devpanel.singleton) return devpanel.singleton; //CAUTION: ignores opts
    const SQSIZE = 16;
    const {nodes2D, width: W, height: H} = grid(SQSIZE * 2, SQSIZE / 2); //hacked panel
    let numpx = 0;
//left: ZZ L2RB2T, right: ZZ R2LT2B
    for (let y = 0; y < H * 2; ++y) //half height
        for (let x = 0; x < W / 2; ++x) //double width
        {
            const xofs = (y < H)? 0: W / 2; //left vs. right half
            const xZZ = ((y & 1) ^ (y < H))? x: flip(x, W / 2); //horiz ZZ; top half reversed
            const yZZ = (y < H)? y: flip(y, 2 * H);
//            nodes2D[ynew][xnew] = numpx++;
            nodes2D[xofs + xZZ][yZZ] = numpx++; //=> outnodes[pxnum]
//if (!y || !x || (y == H * 2 - 1) || (x == W / 2 - 1)) debug(`(${x}/${W / 2}, ${y}/${H * 2}) => (${xnew}, ${ynew}):`, nodes2D[xnew][ynew]); //debug edges
        }
    assert(numpx == SQSIZE ** 2); //check all nodes mapped
//mini dev/test panel:
//submodel test
//        const nodes2D = devpanel.nodes2D;
//        const [totalW, H] = [4, 2], W = Math.floor(totalW / 3);
    const [subW, subH] = [4, 2], partW = Math.floor(subW / 3);
TODO("fix this");
//    return model("mini dev: DEV", () =>
    const mini =
    [
//        {/*numpx: 0,*/ nodes2D}, //composite model, no nodes assigned
        {/*numpx: partW * subH,*/ nodes2D: nodes2D.slice(3, 3 + partW).map((col) => shmslice(col, 3, 3 + subH))}, //left seg
        {/*numpx: partW * subH,*/ nodes2D: nodes2D.slice(10, 10 + partW).map((col) => shmslice(col, 5, 5 + subH))}, //middle seg
        {/*numpx: (subW - 2 * partW) * subH,*/ nodes2D: nodes2D.slice(20, 20 + subW - 2 * partW).map((col) => shmslice(col, 1, 1 + subH))}, //right seg
    ];
    return devpanel.singleton = model({name: "dev panel: DEV", numpx, nodes2D});
}
if (!module.parent) setImmediate(() => devpanel().csv()); //unit-test; run after inline init
//if (!module.parent) setImmediate(() => minidev().dump()); //unit-test; run after inline init


//dummy model test for grid/hwmap:
function tinygrid(opts)
{
    return model("tiny: DEV", () =>
    {
        const SQSIZE = 4;
        const {nodes2D, width: W, height: H} = grid(SQSIZE * 2, SQSIZE / 2); //hacked panel
        let numpx = 0;
//left: ZZ L2RB2T, right: ZZ R2LT2B
        for (let y = 0; y < H * 2; ++y) //half height
            for (let x = 0; x < W / 2; ++x) //double width
            {
                const xofs = (y < H)? 0: W / 2; //left vs. right half
                const xnew = (((y & 1) ^ (y < H))? x: W / 2 - x - 1) + xofs; //horiz ZZ; top half reversed
                const ynew = (y < H)? y: 2 * H - y - 1;
//            nodes2D[ynew][xnew] = numpx++;
        nodes2D[xnew][ynew] = numpx++; //=> outnodes[pxnum]
//debug(`(${x}/${W / 2}, ${y}/${H * 2}) => (${xnew}, ${ynew}):`, nodes2D[xnew][ynew]);
            }
        assert(numpx == SQSIZE ** 2); //check all nodes mapped
        return {numpx, nodes2D};
    });
}
//tinygrid.dump("", "%'d, "); process.exit();
//if (!module.parent) setImmediate(() => tinygrid().csv()); //unit-test; run after inline init


//junk:
function OLD_xy_panel_dev(x, y)
{
	const W = 32, H = 8, VIRTPX = W * H, REALPX = W * H;
//    const col = x % 32;
//    return (col < 16)? col + y * 32: 240 + col - y * 32;
	var xyofs;
	if ((x < 0) || (x >= W) || (y < 0) || (y >= H)) xyofs = {W, H, VIRTPX, REALPX}; //devpanel.VIRTPX || Object.assign(devpanel, {W, H, VIRTPX, REALPX}).VIRTPX; //eof; give caller dimension info
	else if (x < W/2) //left
	{
		xyofs = W * (y >> 1); //top left of 16x2 block
		xyofs += (y & 1)? W-1 - x: x;
	}
	else //right
	{
		xyofs = W * H - W * (y >> 1); //bottom right of 16x2 block
		xyofs += (y & 1)? -x - 1: x - W;
	}
//	console.log("(%d, %d) => '%d", x, y, which);
//	which += NULLPX; //skip null pixel(s)
	return xyofs;
}
}

//eof
