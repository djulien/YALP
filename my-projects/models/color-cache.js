//YALP color cache
//the HSV model is more accurate than the RGB model when manipulating colors, but RGB <-> HSV conversion is expensive
//this module caches generated colors to avoid the overhead of re-generating repeating colors

'use strict';

//var Color = require('tinycolor2'); //'onecolor').color;

module.exports.cache = color_cache; //common.js
var stats = module.exports.stats = {hits: 0, misses: 0, length: 0}; //NOTE: cache size == #misses unless pruning occurs

//TODO: track frequency, pruning?
//TODO: quantize?

var m_cache = {};
//var hits = 0, misses = 0;

function color_cache(key, computation)
{
    var retval = m_cache[key];
    if (retval === undefined) { retval = m_cache[key] = computation(); ++stats.misses; ++stats.length; }
    else ++stats.hits;
    return retval;
}

//eof
