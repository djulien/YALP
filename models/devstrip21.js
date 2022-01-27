#!/usr/bin/env node
//YALP stand-alone prop animation

"use strict"; //find bugs + typos easier
imports(); //hoist


const dev_strip32 = new Model(
{
    maxbr: 0.7,
    order: "GRB",
    width: 32, //height: 1, //horizontal
    get numpx() //{ return replace_prop.call(this, () => //222); },
    {
        let numpx = 0;
        for (let x = 0; x < this.width; ++x)
            this.nodes2D[flip(x, this.width)][0] = numpx++;
        assert(numpx == 32 * 1, `numpx ${numpx} != 32`.brightRed);
        return numpx;
    },
});


//eof