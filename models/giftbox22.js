#!/usr/bin/env node
//ESOL gift box

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {PAL} = require("../incl/color-mgmt22");
const {Model, Rect, ZZ, flip} = require("../models/model22");
const {debug, TODO, srcline, replace_prop} = require("../incl/utils22");


my_exports({giftbox: Giftbox(), Giftbox}); //NOTE: exporting singleton + ctor

//giftbox
//23x36 front + 5x36 side + 2.5x36 top: B2T2BR2L ZZ front + size, L2R2LF2B + F2B2FL2R ZZ top
function Giftbox(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 50/100, //2/3 up on 20A power supply
    order: "GRB",
    name: "Giftbox: YARD, prop",
//    num_wired: 24 * (150 - 13 - 5)/2, //24 strips of 5m 30/m, double-spaced
    num_wired: (23 + 5 + 5) * 36 + 5 * 14,
    get width() { return Math.max(this.side.W + this.front.W, this.top.W); },
    get height() { return this.front.H + this.top.H; }, //36x55,
    get top() { const parent = this; return Rect({get X() { return parent.centerX(this.W); }, Y: parent.front.topE, get W() { return Math.max(this.Whoriz, this.Wvert); }, get H() { return this.Hvert + this.Hhoriz; }, Whoriz: parent.front.H, Wvert: 5, Hhoriz: 5, Hvert: 14, }); },
    get front() { const parent = this; return Rect({X: /*parent.centerX(this.W)*/ Math.ceil((36 - 23) / 2), Y: 0, W: 23, H: 36}); }, //TODO: fix recursion
    get side() { const parent = this; return Rect({get X() { return parent.front.X - this.W; }, Y: 0, W: 5, get H() { return parent.front.H; }}); }, //need getter on H to avoid recursion
    draw: function() //default texture
    {
        this.fill(PAL.MAGENTA.dim(20));
    },
    get numpx()
    {
        let numpx = 0;
//debug(this.width, this.height);
//front: B2T2BR2L ZZ
//debug(this.front);
        for (let x = 0; x < this.front.W; ++x)
            for (let y = 0; y < this.front.H; ++y)
            {
                const xflip = flip(x, this.front.W);
                const yZZ = (xflip & 1)? flip(y, this.front.H): y;
                this.nodes2D[this.front.X + xflip][this.front.Y + yZZ] = numpx++;
            }
//side: T2B2TF2B ZZ
//debug(this.side);
        for (let x = 0; x < this.side.W; ++x)
            for (let y = 0; y < this.side.H; ++y)
            {
                const xflip = flip(x, this.side.W);
                const yZZ = !(xflip & 1)? flip(y, this.side.H): y;
                this.nodes2D[this.side.X + xflip][this.side.Y + yZZ] = numpx++;
            }
//top: F2B2FL2R + L2R2LB2F ZZ
//debug(this.top);
        for (let x = 0; x < this.top.Wvert; ++x)
            for (let y = 0; y < this.top.Hvert; ++y)
            {
                const yZZ = (x & 1)? flip(y, this.top.Hvert): y;
                this.nodes2D[this.top.X + this.top.centerX(this.top.Wvert) + x][this.top.Y + yZZ] = numpx++;
            }
        for (let y = 0; y < this.top.Hhoriz; ++y)
            for (let x = 0; x < this.top.Whoriz; ++x)
            {
                const yflip = flip(y, this.top.Hhoriz);
                const xZZ = (yflip & 1)? flip(x, this.top.Whoriz): x;
                this.nodes2D[this.top.X + xZZ][this.top.Y + this.top.Hvert + yflip] = numpx++;
            }
                
        assert(numpx == this.front.numpx + this.side.numpx + this.top.Whoriz * this.top.Hhoriz + this.top.Wvert * this.top.Hvert, `numpx ${numpx} != front ${this.front.area} + side ${this.side.area} + top horiz ${this.top.Whoriz}x${this.top.Hhoriz} = ${this.top.Whoriz * this.top.Hhoriz} + top vert ${this.top.Wvert}x${this.top.Hvert} = ${this.top.Wvert * this.top.Hvert} = ${this.front.numpx + this.side.numpx + this.top.Whoriz * this.top.Hhoriz + this.top.Wvert * this.top.Hvert}`.brightRed); //check all nodes mapped
        assert(numpx == this.num_wired, `numpx ${numpx} != #wired ${this.num_wired}`);
        return numpx;
    },
    get numpx_OLD()
    {
        let numpx = 0;
//upper: B2TL2R2L ZZ
        for (let y = this.height / 2; y < this.height; ++y) //upper half
            for (let x = 0; x < this.width; ++x)
            {
                const xZZ = !(y & 1)? x: flip(x, this.width); //horiz ZZ
                this.nodes2D[xZZ][y] = numpx++;
            }
//lower: T2BL2R2L ZZ
        for (let y = 0; y < this.height / 2; ++y) //lower half
            for (let x = 0; x < this.width; ++x)
            {
                const yflip = flip(y, this.height / 2);
                const xZZ = (yflip & 1)? x: flip(x, this.width); //horiz ZZ
                this.nodes2D[xZZ][yflip] = numpx++;
            }
                
        assert(numpx == this.width * this.height, `numpx ${numpx} != ${this.width * this.height}`.brightRed); //check all nodes mapped
        return numpx;
    },
}), opts || {}); }
if (!module.parent) setImmediate(async () => await module.exports.giftbox.unit_test()); //unit-test; run after inline init


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof