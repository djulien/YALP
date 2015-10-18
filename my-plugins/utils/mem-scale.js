'use strict'; //helps catch errors

var hfmt = require('human-format');

//example based on https://github.com/julien-f/human-format
var memScale = new hfmt.Scale(
{
    B: 1,
    KB: 1024,
    get MB() { return 1024 * this.KB; },
    get GB() { return 1024 * this.MB; },
    get TB() { return 1024 * this.GB; },
});


module.exports = function (bytes) //commonjs
{
    return hfmt(bytes, {scale: memScale });
}

//eof
