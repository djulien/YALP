#!/usr/bin/env node
//ESOL shepherds

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {PAL} = require("../incl/color-mgmt22");
const {Model, Rect, ZZ, flip} = require("../models/model22");
const {debug, TODO, srcline, replace_prop} = require("../incl/utils22");


my_exports({shepherds: Array.from({length: 4}).map((_, inx) => Shepherd({name: `shepherd_${inx}: NAT`})), Shepherd}); //NOTE: exporting instances + ctor

//shepherds:
TODO("fix self-refs/parent refs within obj lit, rect += center getter");
function Shepherd(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 40/100, //for 2-up on 20A supply
    order: "RGB",
    name: "shepherds",
    num_wired: 12*22 + 4*18 + 2*16/2 + 2*5 + 3*6, //380
//    get body() { return /*this.replace_prop*/(Rect({W: 12, H: 22, get X() { return (opts || {}).caneL? this.cane.W: 0; }, Y: 0})); },
    get body() { const parent = this; return /*this.replace_prop*/(Rect({W: 12, H: 22, get X() { return parent.centerX(this.W); }, Y: 0})); }, //Math.max(0, (this.W - parent.hood.W) / 2 (opts || {}).caneL? this.cane.W: 0; }, Y: 0})); },
//    hood_front: Rect({W: 18, H: 4, X: 0, Y: this.body.topE}),
//    hood_back: Rect(
//const [hdbkW, hdbkH] = [5, 8]; //some skipped
    get hood()
    {
        const parent = this;
//        console.log("hood");
        return /*this.replace_prop*/(Rect(
        {
            widths: [18, 18, 18, 18], //, 6, 5, 6, 5, 6], //omit back to hood, to be consistent with other Nat. figures
            get numpx() { return this.widths.reduce((numpx, w) => numpx + w, 0); },
            get W() {return Math.max(...this.widths)}, //18
            get H() { return this.widths.length; }, //4
//            get X() { return parent.body.X + parent.body.centerX(this.W); },
            get X() { return parent.centerX(this.W); },
            Y: parent.body.topE,
        }));
    },
//    face: Rect({W: 6, H: 2, get X() { return (18 - this.W) / 2; }, Y: /*this.head.Y*/20}), //face absent
    get cane()
    {
        const parent = this;
//        console.log("cane");
        return /*this.replace_prop*/(Rect(
        {
            W: 2,
            H: 16, //CAUTION: lower half is virtual overlay on body
            get X() { return (opts || {}).caneL? parent.body.X - this.W: parent.body.rightE; },
            get Y() { return parent.body.topE - this.H; }, //align top edge with body to avoid hood
        }));
    },
//    get width() { return /*this.replace_prop*/(Math.max(this.hood.W, this.body.W + this.cane.W)); }, //18
//kludge: horiz layout is messy with cane; just leave space on *both* sides to simplify
    get width() { return /*this.replace_prop*/(Math.max(this.hood.W, this.body.W + 2 * this.cane.W)); }, //) + Math.max(this.hood.W / 2, (this.body.W / 2 + this.cane.W))); },
    get height() { return /*this.replace_prop*/(this.body.H + this.hood.H); }, //26
//    get center() { return Math.trunc(this.width / 2); },
    draw: function() //default texture
    {
        this.fill(PAL.OFF);
        this.fill(PAL.WARM_WHITE.dim(20), this.body);
        this.fill(PAL.WARM_WHITE.dim(30), this.hood);
        this.fill(PAL.YELLOW.dim(30), this.cane);
    },
    get numpx() //CAUTION: nodes must be in wiring order; don't use "this.numpx" below! (inf recursion)
    {
        let numpx = 0;
        assert(!(this.width & 1), "width not even");
//debug(this.width, this.height, this.hood.W, this.body.W);

//body 12x22 L2RT2B2T ZZ  L2RB2T2B?
        for (let x = 0; x < this.body.W; ++x)
            for (let y = 0; y < this.body.H; ++y)
            {
                const yZZ = !(x & 1)? flip(y, this.body.H): y;
//debug({x, y, yZZ, bodyx: this.body.X, bodyy: this.body.Y, nodex: this.body.X + x, nodey: this.body.Y + yZZ, nodesW: this.nodes2D.length, nodesH: this.nodes2D[0].length});
                this.nodes2D[this.body.X + x][this.body.Y + yZZ] = numpx++;
            }
//debug(numpx);

//cane hook is 2x8 but lower half is virtual (body overlay)
        for (let x = 0; x < this.cane.W; ++x)
            for (let y = 0; y < this.cane.H; ++y)
            {
                const yZZ = !(x & 1)? flip(y, this.cane.H): y;
//debug({x, y, yZZ, canex: this.cane.X, caney: this.cane.Y, addpx: (y < this.cane.H / 2), bodyx: this.body.X, bodyh: this.body.H, caneh: this.cane.H, remapx: this.body.X + x, remapy: this.body.H - this.cane.H + yZZ});
                this.nodes2D[this.cane.X + x][this.cane.Y + yZZ] = (yZZ >= this.cane.H / 2)? numpx++: this.nodes2D[this.body.X + x][this.body.H - this.cane.H + yZZ];
            }

//head F2BL2R2L ZZ
//        retval.head = {x: (W - headW) / 2, y: bodyH, w: headW, h: headH};
//        retval.face = {x: (W - faceW) / 2, y: bodyH, w: faceW, h: faceH};
//        const facepad = Math.trunc((this.head.W - this.face.W) / 2);
//        for (let y = 0; y < this.head.H; ++y)
//            for (let x = 0; x < this.head.W; ++x)
//            {
//                if (y < this.face.H && x >= facepad && x < this.head.W - facepad) continue; //skip face
//debug({x, y, faceH: this.face.H, headW: this.head.W, faceW: this.face.W, facepad, skip0: y < this.faceH, skip1: x >= facepad, skip2: x < this.head.W - facepad, skip: y < this.faceH && x >= facepad && x < this.head.W - facepad, facepad});
//                const xZZ = !(y & 1)? flip(x, this.head.W): x;
//                this.nodes2D[this.head.X + xZZ][this.head.Y + y] = numpx++;
//            }
//debug(numpx);
        
//hood 4x18 R2R2RF2B ZZ front; skip 5 x 7.5 back of head, 2 * 5 + 3 * 6
        for (let y = 0; y < this.hood.H; ++y)
            for (let x = 0; x < this.hood.W; ++x)
            {
                const xZZ = !(y & 1)? flip(x, this.hood.W): x;
//debug({x, y, xZZ, hoodx: this.hood.X, hoody: this.hood.Y});
                this.nodes2D[this.hood.X + xZZ][this.hood.Y + y] = numpx++;
            }
        const [cane_lower, hood_back] = [this.cane.W * this.cane.H / 2, 2*5 + 3*6];
        numpx += hood_back; //wired but won't be used
        
        assert(numpx == this.body.W * this.body.H + this.hood.W * this.hood.H + hood_back + cane_lower, `numpx ${numpx} != body ${this.body.area} + hood ${this.hood.area} + hood back ${hood_back} + cane lower ${cane_lower} = ${this.body.W * this.body.H + this.hood.W * this.hood.H + hood_back + cane_lower}`); //check all nodes mapped
//        assert(numpx == 2 * 150); //should be 300 (2 5m strips)
        assert(numpx == this.num_wired); //should be 380 (~2.5 5m strips)
        return numpx;
    },
}), opts || {}); }
if (!module.parent) setImmediate(async () => { const model = module.exports.shepherds[0]; model.draw(); await model.emit(model.name + "-paint"); }); //unit-test; run after inline init


//wisemen[0].csv();
//run();


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof