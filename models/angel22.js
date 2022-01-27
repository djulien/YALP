#!/usr/bin/env node
//ESOL angel
//this is a great example of why YALP was created
//try to find other software that will handle this model :P
//note the HTML-like structure to the props: .body, .head, ...

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {Model, Rect, ZZ, flip} = require("../models/model21");
const {debug, TODO, srcline, commas, objcopy, replace_prop} = require("../incl/utils21");


my_exports({angel: angel()}); //NOTE: exporting singleton, not ctor


//const obj =
//{
//  X: 1,
//  Y: this.X + 4,
//};
//debug(obj);
//process.exit();

//angel:
//body 8x22, r wing 6x24, r hair 8+7+8, r halo 7, trumpet 4x10, l halo 7, l hair 8+7+8, l wing 6x24
TODO("use ZZ()");
function angel(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 65/100, //for single 20A supply
    order: "RGB",
    name: "angel: NAT",
    NEEDS_REPAIR: +true,
    get num_wired() { return 564-this.NEEDS_REPAIR * this.body.H; }, //#px as wired
//NOTE: "left", "right" when viewed from *behind* angel
    L2R: +1, R2L: -1, //LED string direction
//    width: 4, height: 3,
    get wingL() { return Rect({X: 0, Y: 0, W: 6, H: 24, dir: this.L2R}); }, //144 px
    get body() { return Rect({NEEDS_REPAIR: 1, realX: this.wingL.rightE, get X() { return this.realX + this.NEEDS_REPAIR; }, Y: 0, realW: 8, get W() { return this.realW-this.NEEDS_REPAIR; }, H: 22}); }, //176 px
    get wingR() { return Rect(objcopy(this.wingL, {X: this.body.rightE, dir: this.R2L})); },
    get hair() { return Rect({X: this.body.realX, Y: this.body.topE, W: this.body.realW, H: 8}); }, //2 sides rect; NOTE: irregular lengths; 46 px
    hairlen: [8, 7, 8, 0, 0, 8, 7, 8], get hairpx() { return this.hairlen.reduce((total, strand) => total + strand, 0); }, //: 46,
//        retval.hair = {x: wingW, y: bodyH, w: allW - 2 * wingW, h: hairH}); //CAUTION: gaps
//    get hairgap() { return Rect({W: this.hairW - 6, X: this.hair.X + 3, Y: this.hair.Y, H: this.hair.H}); },
    get halo() { return Rect({W: 2*7, X: this.width / 2 - 7, H: 1, Y: this.hair.topE}); }, //x 2 sides rect; 14 px
    get trumpet() { return Rect({C: 4, L: 10, get W() { return this.L; }, get H() { return this.C; }, X: this.width / 2 - 10 / 2, Y: this.halo.topE}); }, //cylinder; map to horizontal @top of texture; 40 px
    get width() { return this.wingR.rightE; }, //Math.max(this.wingR.rightE, this.hair.rightE, this.halo.rightE, this.trumpet.rightE); }, //this.wing.W + this.body.W + this.wing.W; }, //L2R; avoid recursion; //20
    get height() { return this.trumpet.topE; }, //this.body.H + this.hair.H + this.halo.H + this.trumpet.C; }, //parts are mapped B2T; //35
    get numpx() //CAUTION: do not rearrance code (affects string order)
    {
        let numpx = 0;
debug("body", this.body);
//debug("wings", this.wingL, this.wingR);
debug("hair", this.hair);
//debug("halo", this.halo);
//debug("trumpet", this.trumpet);
//        const [W, H] = [this.width, this.height];
//debug("getting numpx", W, H, this.width, this.height, this.maxbr, this.order, srcline(+1));
//        for (let xy = 0; xy < W * H; ++xy)
//            this.nodes2D[ZZ(xy, W)][ZZ.cycle] = numpx++; //=> outnodes[pxnum]
//        assert(numpx == 3 * 4, `numpx ${numpx} != ${3 * 4}`.brightRed); //check all nodes mapped

//body L2RT2B2T ZZ
//        retval.body = {x: wingW, y: 0, w: bodyW, h: bodyH};
        for (let x = 0; x < this.body.W; ++x)
            for (let y = 0; y < this.body.H; ++y)
            {
                const yZZ = !(x & 1)? flip(y, this.body.H): y;
                this.nodes2D[this.body.X + x][this.body.Y + yZZ] = numpx++;
//if (!y || !x || (y == H - 1) || (x == W - 1)) debug(`(${x}/${W}, ${y}/${H}) => (${x}, ${yflip}):`, nodes2D[x][yflip]); //debug edges
            }
//debug("body", numpx, this.body.numpx); //, body);

//right wing L2RT2B2T ZZ
//        retval.wings = [null, {x: wingW + bodyW, y: 0, w: wingW, h: wingH, dir: -1}]; //R2L
        for (let x = 0; x < this.wingR.W; ++x)
            for (let y = 0; y < this.wingR.H; ++y)
            {
                const yZZ = !(x & 1)? flip(y, this.wingR.H): y;
                this.nodes2D[this.wingR.X + x][this.wingR.Y + yZZ] = numpx++;
            }
//debug("wingR", numpx, this.wingR.numpx); //, wingR);

//right hair R2LB2T2B ZZ
//left hair L2RT2B2T ZZ
//CAUTION: can't combine hairL + hairR because of string order
//        for (let x = 0; x < this.hair.W; ++x)
//            debug(x, this.hair.W, x == this.hair.W / 2);
        let hair_found = -numpx;
        for (let x = 0; x < this.hair.W; ++x)
            for (let y = 0; y < this.hairlen[x]; ++y)
            {
//nope                if (x == this.hair.W / 2 && !y) halo.call(this); //nested
                if (!y && x && !this.hairlen[x - 1]) { hair_found += numpx; halo.call(this); hair_found -= numpx; } //nested
//                if (x >= this.hairgap.X && x < this.hairgap.rightE) break; //no nodes
                const yZZ = (x & 1)? flip(y, this.hair.H): y;
//                if ((x & 1) && !yZZ) continue; //no node here
                this.nodes2D[this.hair.X + x][this.hair.Y + yZZ] = numpx++;
            }
        hair_found += numpx;
//debug("hair", numpx, this.hair.numpx, hair_found); //, hair);
//debug("hairgap", this.hairgap.numpx); //, hair);

//right halo R2L
//left halo R2L
//CAUTION: can't combine halo halves because of string order
        function halo()
        {
//            const started = numpx;
//      retval.halo = {x: allW / 2 - haloW, y: bodyH + hairH, w: 2 * haloW, h: 1};
            for (let x = 0; x < this.halo.W; ++x)
            {
                if (x == this.halo.W / 2) trumpet.call(this); //nested
                this.nodes2D[/*xcenter - flip(x, this.halo.W)*/ this.halo.rightE - x - 1][this.halo.Y] = numpx++;
            }
//debug("halo", numpx - started, this.halo.numpx); //, halo);
        }

//trumpet B2F2BCW ZZ
//      retval.trumpet = {x: (allW - trumpetL) / 2, y: bodyH + hairH + haloH, w: trumpetL, h: trumpetC};
        function trumpet()
        {
//            const started = numpx;
            for (let y = 0; y < this.trumpet.C; ++y)
                for (let x = 0; x < this.trumpet.L; ++x)
                {
                    const xZZ = (y & 1)? flip(x, this.trumpet.L): x;
                    this.nodes2D[this.trumpet.X + xZZ][this.trumpet.Y + y] = numpx++;
                }
//debug("trumpet", numpx - started, this.trumpet.numpx); //, trumpet);
        }

//left wing L2RT2B2T ZZ
//NOTE: can't combine hairL + hairR because of string order
//        retval.wings[0] = {x: 0, y: 0, w: wingW, h: wingH, dir: +1}; //L2R
        for (let x = 0; x < this.wingL.W; ++x)
            for (let y = 0; y < this.wingL.H; ++y)
            {
                const yZZ = !(x & 1)? flip(y, this.wingL.H): y;
                this.nodes2D[this.wingL.X + x][this.wingL.Y + yZZ] = numpx++;
            }
//debug("wingL", numpx, this.wingL.numpx); //, wingL);

//        assert(this.hair.numpx - this.hairgap.numpx == this.hairpx, `hair ${this.hair.numpx} - hairgap ${this.hairgap.numpx} != ${this.hairpx}`);
        const num_expected = this.body.numpx + this.wingL.numpx + this.wingR.numpx + hair_found /*this.hair.numpx - this.hairgap.numpx*/ + this.halo.numpx + this.trumpet.numpx;
        assert(numpx == num_expected, `numpx ${numpx} != expected body ${this.body.numpx} + wings ${this.wingL.numpx} ${this.wingR.numpx} + hair ${hair_found} + halo ${this.halo.numpx} + trumpet ${this.trumpet.numpx} = ${commas(num_expected)}`); //check all nodes mapped; //- hairgap ${this.hairgap.numpx}
//      assert(numpx == 564, `numpx ${numpx} != expected 664`); //check all nodes mapped
//debugger;
      return numpx;
    },
    trim_wings: function(setpx)
    {
        const OFF = 0;
        if (!setpx) setpx = function(x, y, h) { this.nodes2D[x].fill(OFF, y, y + h); };
        const corners =
        [
            [0, -4], [1, -2+1], /*...,*/ [-3, -1], [-2, -2], [-1, -4], //upper corners
            [0, 4], [1, 3], [2, 2-1], /*[3, 1], ...,*/ [-2, 2], [-1, 4], //lower corners
        ];
        for (const wing of [this.wingL, this.wingR])
            for (const [x, ytrim] of corners)
            {
TODO("check dir");
                const xwrap = (wing.W + x) % wing.W, xflip = (wing.dir < 0)? flip(xwrap, wing.W): xwrap;
//debug("xofs", xofs, "xflip", xflip, "+", xofs + xflip, ytrim);
                if (ytrim < 0) setpx.call(this, wing.X + xwrap, wing.topE + ytrim, wing.topE - 1); //this.nodes2D[wing.X + xflip].fill(BLACK, wing.topE + ytrim, wing.Y + wing.H); //use BLUE_dim for debug
                else setpx.call(this, wing.X + xflip, wing.Y, wing.Y + ytrim); //this.nodes2D[wing.X + xflip].fill(BLACK, wing.Y, wing.Y + ytrim); //use CYAN_dim for debug
            }
    },
}), opts || {}); }
TODO("write protect px? => nullpx");


/////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// module:
//


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }


//CLI/unit test (debug):
//to validate use https://www.rapidtables.com/convert/color/rgb-to-hsv.html
// or https://www.rapidtables.com/convert/color/hsv-to-rgb.html
if (!module.parent)
{
    console.log(`Use "npm test" rather than running index.js directly.`.brightCyan, srcline());
    console.log("exports:".brightBlue, Object.entries(module.exports)
        .map(([key, val]) => `${key} = ${fmt(val, {truncate: 50, base: key.match(/mask|map/i)? 16: 10})} (${fmt.typeof})`), srcline());
    console.log("unit tests:".brightCyan, srcline());
    const angel = new Angel();
    console.log("angel", {width: angel.width, height: angel.height, numpx: angel.numpx});
    angel.fill(0);
    angel.fill(1, angel.wingL); //, px => px | 0x100);
    angel.fill(2, angel.wingR); //, px => px | 0x100);
    angel.fill(3, angel.body); //, px => px | 0x200);
    angel.fill(4, angel.hair); //, px => px | 0x400);
    angel.fill(5, angel.halo); //, px => px | 0x800);
    angel.fill(6, angel.trumpet); //, px => px | 0x1000);
    angel.emit(angel.name + "-paint");
}


//eof