#!/usr/bin/env node
//ESOL Star v 2.0  2020
//TODO: Mega-star

"use strict"; //find bugs + typos easier
//imports(); //hoist
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW; don't use in big loops!
const {PAL} = require("../incl/color-mgmt22");
const {Model, Rect, ZZ, flip} = require("../models/model22");
const {debug, TODO, srcline, replace_prop} = require("../incl/utils22");


//my_exports({mary: NatFig("Mary: NAT"), joseph: Natfig("Joseph: NAT"), Natfig}); //NOTE: exporting instances + ctor
my_exports({star: Star(), Star}); //NOTE: exporting instances + ctor
TODO("use other star projections?  should center be in middle? (depends on fx)");

//star:
//~ radial 9 main spokes, each 2-4 wide, 11-14 long
function Star(opts) { return Object.assign(/*{}, opts || {},*/ new Model(
{
    maxbr: 100/100, //20A supply
    order: "RGB",
    name: "Star: NAT, prop",
    num_wired: 2*150 - 2, //~ 2 5m strips
//map radial top-down view of spokes to X ofs (CW):
    spikes: Object.defineProperties(
    { //enumerable:
//TODO: use other projections?  should center be in middle? (depends on fx)
        center: Rect({X: 0, Y: 0, W: 3, H: 14}),
        get S() { const parent = this; return Rect({X: parent.center.rightE, Y: 0, W: parent.fb.W, H: parent.fb.L}); },
        get SW() { const parent = this; return Rect({X: parent.S.rightE, Y: 0, W: parent.diag.W, H: parent.diag.L}); },
        get W() { const parent = this; return Rect({X: parent.SW.rightE, Y: 0, W: parent.lr.W, H: parent.lr.L}); },
        get NW() { const parent = this; return Rect({X: parent.W.rightE, Y: 0, W: parent.diag.W, H: parent.diag.L}); },
        get N() { const parent = this; return Rect({X: parent.NW.rightE, Y: 0, W: parent.fb.W, H: parent.fb.L}); },
        get NE() { const parent = this; return Rect({X: parent.N.rightE, Y: 0, W: parent.diag.W, H: parent.diag.L}); },
        get E() { const parent = this; return Rect({X: parent.NE.rightE, Y: 0, W: parent.lr.W, H: parent.lr.L}); },
        get SE() { const parent = this; return Rect({X: parent.E.rightE, Y: 0, W: parent.diag.W, H: parent.diag.L}); },
    }, { // !enumerable:
//        get all() { return this.SE + diagW; },
        lr: {value: {W: 3, L: 12}}, //left, right
        fb: {value: {W: 4, L: 12}}, //front, back
        diag: {value: {W: 2, L: 11}},
    }),
    get width() { return Object.values(this.spikes).reduce((total, submodel) => total + submodel.W, 0); }, //25
    get height() { return Object.values(this.spikes).reduce((total, submodel) => Math.max(total, submodel.H), 0); }, //14
    draw: function() //default texture
    {
        this.fill(PAL.OFF);
//        Object.values(this.spikes).forEach(
        [this.spikes.center, this.spikes.N, this.spikes.S, this.spikes.E, this.spikes.W].forEach(submodel => this.fill(PAL.WARM_WHITE.dim(80), submodel));
        [this.spikes.NW, this.spikes.SW, this.spikes.NE, this.spikes.SE].forEach(submodel => this.fill(PAL.COOL_WHITE.dim(60), submodel));
    },
    get numpx() //CAUTION: nodes must be in wiring order
    {
        let numpx = 0;

//TODO: reorder spikes L2R?
//spikes L2RB2T (CW center outward) mostly ZZ
//center (upright) spike:
        for (let x = 0; x < this.spikes.center.W; ++x)
            for (let y = 0; y < this.spikes.center.H; ++y)
            {
                const yZZ = (x & 1)? flip(y, this.spikes.center.H): y;
                this.nodes2D[this.spikes.center.X + x][this.spikes.center.Y + yZZ] = numpx++;
            }
//debug(numpx);

//S/N (front/back) spikes:
        [this.spikes.S, this.spikes.N].forEach(spike =>
        {
            for (let x = 0; x < spike.W; ++x)
                for (let y = 0; y < spike.H; ++y)
                {
                    const yZZ = (x & 1)? flip(y, spike.H): y;
                    this.nodes2D[spike.X + x][spike.Y + yZZ] = numpx++;
                }
        });
//debug(numpx);

//W/E (left/right) spikes:
        [this.spikes.W, this.spikes.E].forEach(spike =>
        {
            for (let x = 0; x < spike.W; ++x)
                for (let y = 0; y < spike.H; ++y)
                {
                    const yZZ = (x & 1)? flip(y, spike.H): y;
                    this.nodes2D[spike.X + x][spike.Y + yZZ] = numpx++;
                }
        });
//debug(numpx);

//SW/NW/NE/SE (diag) spikes:
        [this.spikes.SW, this.spikes.NW, this.spikes.NE, this.spikes.SE].forEach(spike =>
        {
            for (let x = 0; x < spike.W; ++x)
                for (let y = 0; y < spike.H; ++y)
                {
                    const yZZ = (x & 1)? flip(y, spike.H): y;
                    this.nodes2D[spike.X + x][spike.Y + yZZ] = numpx++;
                }
        });
//debug(numpx);

        assert(numpx == Object.values(this.spikes).reduce((total, spike) => total + spike.W * spike.H, 0), `numpx ${numpx} != center ${this.spikes.center.area} + 2 N/S ${this.spikes.N.area} + 2 W/E ${this.spikes.W.area} + 4 diag ${this.spikes.SW.area} = ${Object.values(this.spikes).reduce((total, spike) => total + spike.W * spike.H, 0)}`); //check all nodes mapped
        assert(numpx == this.num_wired, `numpx ${numpx} != num_wired ${this.num_wired}`);
        return numpx;
    },
}), opts || {}); }
if (!module.parent) setImmediate(async () => await module.exports.star.unit_test()); //unit-test; run after inline init

//wisemen[0].csv();
//run();


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof