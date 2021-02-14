#!/usr/bin/env node
// null pixels

'use strict'; //find bugs easier
const {my_exports} = require("yalp21/incl/utils");
const {model, grid, mapall} = require("./model");

//Object.assign(module.exports, {nullpx});


//null pixels:
//linear string of nodes; no need for fancy geometry
my_exports({nullpx});
function nullpx(opts)
{
    const count = (typeof opts == "object")? opts.count || 1: +opts || 1;
    return model(Object.assign({name: `null px[${count}]: NULL`}, mapall(grid(count))));
}
if (!module.parent) setImmediate(() => nullpx().csv()); //unit-test; run after inline init


//eof
