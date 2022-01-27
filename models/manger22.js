#!/usr/bin/env node
//ESOL Mary + Joseph + Baby in cradle

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {PAL} = require("../incl/color-mgmt22");
const {Model, Rect, ZZ, flip} = require("../models/model22");
const {debug, TODO, srcline, replace_prop} = require("../incl/utils22");


my_exports({manger: Manger(), Manger}); //NOTE: exporting instances + ctor

//manger:
function Manger(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 100/100, //ok for 2-up on 20A supply
    order: "RGB",
    name: "Manger: NAT",
    get num_wired() { return 150 + this.FUD; }, //1 5m strip
    FUD: -2, //TODO: fix this
    get basket() { const full = this; return Rect({W: 20, H: 5, X: 0, get Y() { return full.legs.topE; }}); }, //CAUTION: need getter to resolve recursion
    get legs() { const full = this; return Rect({W: full.basket.W, thick: 4, H: 6, X: full.basket.X, Y: 0}); },
    get gap() {  const full = this; return Rect({W: full.basket.W - 2 * full.legs.thick, H: full.legs.H, get X() { return full.legs.centerX(this.W); }, Y: this.legs.Y}); },
    get width() { return this.basket.W; }, //20
    get height() { return this.basket.H + this.legs.H; }, //11
    draw: function() //default texture
    {
        this.fill(PAL.OFF);
        this.fill(PAL.BROWN.dim(80), this.legs);
        this.fill(PAL.WARM_WHITE.dim(80), this.basket);
    },
    get numpx() //CAUTION: nodes must be in wiring order
    {
        let numpx = 0;

//basket B2TL2R2LB ZZ
//debug("basket", this.basket);
//let check = -numpx;
        for (let y = 0; y < this.basket.H; ++y)
            for (let x = 0; x < this.basket.W; ++x)
            {
                const xZZ = !(y & 1)? flip(x, this.basket.W): x;
                this.nodes2D[this.basket.X + xZZ][this.basket.Y + y] = numpx++;
            }
//check += numpx; debug(check);

//legs R2LT2B2T ZZ
//debug("legs", this.legs);
//debug("gap", this.gap);
//let check = -numpx;
//debug(this.gap.hits({x: 4, y: 0}), this.gap.rightE, this.gap.left);
//hits: { value: function(xy) { return xy.x >= this.left && xy.x < this.rightE && xy.y >= this.bottom && xy.y < this.topE; }, },
        for (let x = 0; x < this.legs.W; ++x)
            for (let y = 0; y < this.legs.H; ++y)
            {
//                if (x >= this.legs.thick && x < this.legs.W - this.legs.thick) continue; //skip gap
                if (this.gap.hits({x, y})) continue;
                const xZZ = !(y & 1)? flip(x, this.legs.W): x;
//debug({x, y, xZZ, W: this.legs.W, H: this.legs.H, gap: this.gap.W});
                this.nodes2D[this.legs.X + xZZ][this.legs.Y + y] = numpx++;
            }
//check += numpx; debug(check);
        
        assert(numpx == this.basket.numpx + this.legs.numpx - this.gap.numpx, `numpx ${numpx} != basket ${this.basket.area} + legs ${this.legs.area} - gap ${this.gap.area} = ${this.basket.numpx + this.legs.numpx - this.gap.numpx}`); //check all nodes mapped
        return numpx;
    },
}), opts || {}); }
if (!module.parent) setImmediate(async () => await module.exports.manger.unit_test()); //unit-test; run after inline init

//wisemen[0].csv();
//run();


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof