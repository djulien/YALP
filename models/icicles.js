#!/usr/bin/env node
// RGB icicles

'use strict'; //find bugs easier
const model = require("./model");
const {ZZ, flip} = require("./incl/utils");

Object.assign(module.exports, {icicles});


//RGB icicles:
//NOTE: spans ports; split into multiple segments; could be a single universe @20 FPS
function icicles(opts)
{
//    return [model(), model()];
    return model("icicles: IC", () => //(x, y) =>
    {
//    const W = (7 + (1) + 26) + 30 + (1) + 30 + (17 + (1) + 7) + (2) + 10 + (1) + 24, H = 10, NUMPX = 
        const COLTYPES = { REAL: 1, VIRT: 2, SEG: 1000};
        const coltypes = //151 real + 6 virt = 157 total cols = 1570 nodes
        [
            [+7, -1, +26], [+30], //garage left (2 segments)
//        [-1 -COLTYPES.SEG], //gap for timing/spacing, seg split
//        [+30], [+17, -1, +7], //garage right (2 segments)
//        [-2 -COLTYPES.SEG], //gap for timing/spacing, seg split
            [-1], //gap for timing/spacing
            [+30],
            [-1 -COLTYPES.SEG], //gap for timing/spacing, seg split
            [+17, -1, +7], //garage right (2 segments)
            [-2], //gap for timing/spacing
            [10, -1, +24], //porch
//        [-2], //gap
//        [30], //bay
        ].flat().map((w) => Array.from({length: Math.abs(w) % COLTYPES.SEG}).map((x) => (w > 0)? COLTYPES.REAL: (w > -COLTYPES.SEG)? COLTYPES.VIRT: COLTYPES.SEG)).flat();
//    const W = cols.length, H = 10, VIRTPX = W * H, REALPX = cols.filter((col) => col > 0).length * H;
        const {nodes2D, width: W, height: H} = grid(coltypes.length, 10);
//	if ((x < 0) || (x >= W) || (y < 0) || (y >= H)) [xyofs, ic.W, ic.H] = [W * H, W, H]; //eof; give caller dimension info
//    else xyofs = x * H + h;
//R2LT2B
        const segs = [];
//debug(typeof nodes2D);
//debug(coltypes); //.slice(50));
        segs.newseg = function() { this.push({numpx: 0, nodes2D: []}); }
        segs.newseg();
//debug(Object.entries(cols.reverse()));
//    for (let [x, coltype] of Object.entries(coltypes.reverse()))
        /*Object.entries*/(coltypes.reverse()) //CAUTION: strung R2L T2B
            .forEach((coltype, x, all) =>
            {
//debug_limit(4, "before", coltype, x, coltype == COLTYPES.REAL, (coltype == COLTYPES.SEG) && (all[x - 1] != COLTYPES.SEG), segs.length, segs.top.numpx, segs.top.nodes2D.length);
                if (coltype == COLTYPES.REAL)
                {
                    for (let y = 0; y < H; ++y)
                        nodes2D[W - x - 1][H - y - 1] = segs.top.numpx++;
                    segs.top.nodes2D.unshift(nodes2D[W - x - 1]); //CAUTION: R2L; also, shmary
                }
                else if ((coltype == COLTYPES.SEG) && (all[x - 1] != COLTYPES.SEG)) segs.newseg();
//debug_limit(4, "after", segs.length, segs.top.numpx, segs.top.nodes2D.length);
            });
        if (segs.length > 1) segs.unshift({numpx: 0, nodes2D}); //nodes2D.forEach((col) => coll.fill(UNMAPPED)); }
//debug(segs.length);
//debug(typeof nodes2D);
//debug(typeof segs[0].nodes2D);
//debug(segs.top);
//kludge: can't do I/O across ports; clear h/w map for composite model; CAUTION: shm
        assert(segs.reduce((total, seg) => total + seg.numpx, 0) == 151 * 10); //all nodes mapped
        return (segs.length == 1)? segs.top: segs; //{numpx, nodes2D};
    }); //.split(2);
}
//const x = 5, y = -5, M = 3, N = -3; debug(x % M, x % N, y % M, y % N); process.exit();
//ic.nodes2D = ic.nodes1D = ic.hwmap = null; debug(ic); process.exit();
if (!module.parent) setImmediate(() => icicles().dump()); //unit-test; run after inline init


//eof