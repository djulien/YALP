#!/usr/bin/env node
// YALP model functions/base class + helper functions

//a model has 3 purposes:
//- define virtual grid size (fx target)
//- map virtual grid to physical nodes (h/w mapping)
//- indirectly, determine how effects look (ie, rectangular vs. radial geometry)
//first 2 above are done by returning a 2D grid holding physical node#s (or placeholders for null px)
//all fx should work for all models (although some might not look as good)
//multple models can be mapped to same physical nodes, allowing different results from same effect or props to operate in unison (ie, whole-house effects)


'use strict'; //find bugs easier

//null pixels:
//linear string of nodes; no need for fancy geometry
/*
my_exports({nullpx});
function nullpx(opts)
{
//    return model(`nullpx[${count}]: NULLPX`, () => mapall(grid(count)));
//    const {nodes2D, width: W, height: H} = grid(SQSIZE * 2, SQSIZE / 2); //hacked panel
    const count = isobj(opts)? opts.count || 1: +opts || 1;
    return model(Object.assign({name: `null px[${count}]: NULL`}, mapall(grid(count))));
}
*/

my_exports({Model, Grid, ZZ, flip}); //tree: tree()});

//class Model
function Model(opts) //ctor; function allows hoist (class does not)
{
    if (!(this instanceof Model)) return new Model(opts);
}


//class Grid
function Grid(w, h) //ctor; function allows hoist (class does not)
{
    if (!(this instanceof Grid)) return new Grid(w, h);
}


//zig-zag:
function ZZ(val, limit)
{
    const [cycle, ofs] = [Math.floor(val / limit), val % limit];
    return (cycle & 1)? val % limit: flip(val, limit);
}


//TODO: clamp?
function flip(val, limit) { return limit - val - 1; }


/////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// misc helpers:
//


function isobj(thing, objval)
{
//    const answer1 = (typeof thing == 'object' && thing !== null);
    const retval = (thing === Object(thing)); //from https://stackoverflow.com/questions/8511281/check-if-a-value-is-an-object-in-javascript
//    if (answer1 != answer2) throw `disagree: ${answer1} ${answer2}${srcline()}`.brightRed;
    return (objval === undefined)? retval: //return true/false
        retval? defunc(objval): defunc(thing); //return alternate value depending on obj or not
}


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof