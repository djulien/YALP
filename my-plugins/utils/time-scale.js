'use strict'; //helps catch errors

var hfmt = require('human-format');

//example based on https://github.com/julien-f/human-format
var timeScale = new hfmt.Scale(
{
    msec: 1,
    sec: 1000,
    get min() { return 60 * this.sec; },
    get hr() { return 60 * this.min; },
    get day() { return 24 * this.hr; },
    get mon() { return (365.24 / 12) * this.day; }, //NOTE: approx
});


module.exports = function (msec) //commonjs
{
    return hfmt(msec, {scale: timeScale, decimals: (msec < 60000)? 3: 2, });
}

//eof
