#!/usr/bin/env node
//ESOL wisemen

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {PAL} = require("../incl/color-mgmt21");
const {Model, Rect, ZZ, flip} = require("../models/model21");
const {debug, TODO, srcline, replace_prop} = require("../incl/utils21");


my_exports({wisemen: Array.from({length: 3}).map((_, inx) => Wiseman({name: `wisemen_${inx}: NAT`})), Wiseman}); //NOTE: exporting instances + ctor

//wisemen:
TODO("fix self-refs/parent refs within obj lit, rect += center getter");
function Wiseman(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 50/100, //for 2-up on 20A supply
    order: "RGB",
    name: "tbd",
    num_wired: 2 * 150, //2 5m strips
//    width: 4, height: 3,
//    body: Rect({W: 12, H: 20, get X() { return (18 - this.W) / 2; }, Y: 0}),
    get body() { const parent = this; return Rect({W: 12, H: 20, get X() { return parent.centerX(this.W); }, Y: 0}); },
//    head: Rect({W: 18, H: 4, get X() { return (18 - this.W) / 2; }, Y: /*this.body.topE*/20}),
    get head() { const parent = this; return Rect({W: 18, H: 4, get X() { return parent.centerX(this.W); }, Y: this.body.topE}); },
//    face: Rect({W: 6, H: 2, get X() { return (18 - this.W) / 2; }, Y: /*this.head.Y*/20}), //face absent
    get face() { const parent = this; return Rect({W: 6, H: 2, get X() { return parent.centerX(this.W); }, Y: this.head.Y}); }, //face absent
    get width() { return Math.max(this.head.W, this.body.W); }, //18
    get height() { return this.body.H + this.head.H; }, //24
//    get center() { return Math.trunc(this.width / 2); },
    draw: function() //default texture
    {
        this.fill(PAL.OFF);
        this.fill(PAL.MAGENTA.dim(50), this.body);
        this.fill(PAL.GOLD.dim(50), this.head);
    },
    get numpx() //CAUTION: nodes must be in wiring order
    {
        let numpx = 0;
        assert(!(this.width & 1), "width not even");

//body L2RT2B2T ZZ
//        retval.body = {x: (W - bodyW) / 2, y: 0, w: bodyW, h: bodyH};
        for (let x = 0; x < this.body.W; ++x)
            for (let y = 0; y < this.body.H; ++y)
            {
                const yZZ = !(x & 1)? flip(y, this.body.H): y;
                this.nodes2D[this.body.X + x][this.body.Y + yZZ] = numpx++;
            }
//debug(numpx);

//head F2BL2R2L ZZ
//        retval.head = {x: (W - headW) / 2, y: bodyH, w: headW, h: headH};
//        retval.face = {x: (W - faceW) / 2, y: bodyH, w: faceW, h: faceH};
        const facepad = Math.trunc((this.head.W - this.face.W) / 2);
        for (let y = 0; y < this.head.H; ++y)
            for (let x = 0; x < this.head.W; ++x)
            {
                if (y < this.face.H && x >= facepad && x < this.head.W - facepad) continue; //skip face
//debug({x, y, faceH: this.face.H, headW: this.head.W, faceW: this.face.W, facepad, skip0: y < this.faceH, skip1: x >= facepad, skip2: x < this.head.W - facepad, skip: y < this.faceH && x >= facepad && x < this.head.W - facepad, facepad});
                const xZZ = !(y & 1)? flip(x, this.head.W): x;
                this.nodes2D[this.head.X + xZZ][this.head.Y + y] = numpx++;
            }
//debug(numpx);
        
        assert(numpx == this.body.W * this.body.H + this.head.W * this.head.H - this.face.W * this.face.H, `numpx ${numpx} != body w ${this.body.W} * h ${this.body.H} + head = w ${this.head.W} * h ${this.head.H} - face w ${this.face.W} * h ${this.face.H} = ${this.body.W * this.body.H + this.head.W * this.head.H - this.face.W * this.face.H}`); //check all nodes mapped
//        assert(numpx == 2 * 150); //should be 300 (2 5m strips)
        assert(numpx == this.num_wired); //should be 300 (2 5m strips)
        return numpx;
    },
}), opts || {}); }
if (!module.parent) setImmediate(async () => await module.exports.wisemen[0].unit_test()); //unit-test; run after inline init

//wisemen[0].csv();
//run();


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof