
'use strict';

var inherits = require('inherits');
/*var sprintf =*/ require('sprintf.js'); //.sprintf;
var makenew = require('my-plugins/utils/makenew');

function base(opts)
{
    if (!(this instanceof base)) return makenew(base, arguments);
//    {
//        if (opts.mono) return makenew(mono, arguments);
//        if (opts.rgb) return makenew(rgb, arguments);
//        if (opts.rgbw) return makenew(rgbw, arguments);
//    }
    this.name = "base";
    this.size = 0;
}

base.prototype.func = function(x)
{
    return sprintf("base func(%s)", x);
}


function mono(opts)
{
    if (!(this instanceof mono)) return makenew(mono, arguments);
    this.name = "mono";
    this.size = 1;
    base.apply(this, arguments);
}
inherits(mono, base);

mono.prototype.func = function(x)
{
    return sprintf("mono func(%s)", x);
}


function rgb(opts)
{
    if (!(this instanceof rgb)) return makenew(rgb, arguments);
    this.name = "rgb";
    this.size = 3;
    base.apply(this, arguments);
}
inherits(rgb, base);

rgb.prototype.func = function(x)
{
    return sprintf("rgb func(%s)", x);
}


function rgbw(opts)
{
    if (!(this instanceof rgbw)) return makenew(rgbw, arguments);
    this.name = "rgbw";
    this.size = 4;
    base.apply(this, arguments);
}
inherits(rgbw, base);

rgbw.prototype.func = function(x)
{
    return sprintf("rgbw func(%s)", x);
}


function generic(opts)
{
//    if (!(this instanceof generic))
//    {
//        if (opts.mono) return makenew(mono, arguments);
//        if (opts.rgb) return makenew(rgb, arguments);
//        if (opts.rgbw) return makenew(rgbw, arguments);
//        return makenew(generic, arguments);
//    }
    if (!opts) opts = {};
    if (opts.mono) return makenew(mono, arguments);
    if (opts.rgb) return makenew(rgb, arguments);
    if (opts.rgbw) return makenew(rgbw, arguments);
    return makenew(base, arguments);
}


var x = new generic({rgb: 1});
console.log("x", x.name, x.func());
var y = new generic({mono: 1});
console.log("y", y.name, y.func());
var z = new generic({rgbw: 1});
console.log("z", z.name, z.func());
var w = new generic();
console.log("w", w.name, w.func());


//eof
