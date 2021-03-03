#!/usr/bin/env node
// dev panel

'use strict'; //find bugs easier
//const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW
const {my_exports} = require("yalp/incl/utils");
//const {TODO} = require("yalp21/incl/msgout");
const {model, grid, mapall, shmslice, ZZ, flip} = require("yalp/models");
//const {NUM_PORTS} = require("yalp");
//const {UNIV_LEN} = require("yalp21/yalp").yalp;


///////////////////////////////////////////////////////////////////////////////
////
/// Custom model: all
//

//all nodes of all ports:
//layout will assign 1 port#
//any node output will be replicated across all ports
my_exports({all});
function all(opts)
{
//    const = (typeof opts == "object")? opts.NUM_PORTS: opts;
    const {NUM_PORTS, UNIV_LEN} = opts.ctlr || opts;
    if (all.singleton) return all.singleton; //CAUTION: ignores opts
//fill single port then wedge out() to copy to all other ports:
//    const oneport = nullpx(yalp.UNIV_LEN);
    const oneport = model(Object.assign({name: `all px[${NUM_PORTS} x ${UNIV_LEN}]: ALL`}, mapall(grid(UNIV_LEN))));
    oneport.firstpx = 0; //start at first node
    oneport.svout = oneport.out;
    oneport.out = function(...args)
    {
        const retval = this.svout(...args);
        const [frbuf,] = args;
        if (this.firstpx || this.numpx != UNIV_LEN) warn("all: only %'d..%d of %'d nodes mapped", this.firstpx, this.firstpx + this.numpx, UNIV_LEN);
        for (let p = 0; p < NUM_PORTS; ++p)
            if (p != this.portnum)
                frbuf.wsnodes[p].set(frbuf.wsnodes[this.portnum]);
        return retval;
    };
//    model({name: "all ports", numpx, nodes2D});
//    return all.singleton = model({name: "all ports", numpx, nodes2D});
    return all.singleton = oneport;
}
if (!module.parent) setImmediate(() => all().csv()); //unit-test; run after inline init
//if (!module.parent) setImmediate(() => minidev().dump()); //unit-test; run after inline init


//eof