'use strict'; //helps catch errors

//var timescale = require('./timescale');
var hfmt = require('human-format');

//example based on https://github.com/julien-f/human-format
var timeScale = new hfmt.Scale(
{
    msec: 0,
    sec: 1000,
    get min() { return 60 * this.sec; },
    get hr() { return 60 * this.min; },
    get day() { return 24 * this.hr; },
    get mon() { return (365.24 / 12) * this.day; }, //NOTE: approx
});


elapsed(); //set time base
module.exports = elapsed; //commonjs
elapsed.toString = function ()
{
    return hfmt(elapsed(), {scale: timeScale });
}

function elapsed()
{
    var now = (new Date()).getTime(); //TODO: use process.hrtime (nsec)?
    if (!elapsed.start) elapsed.start = now; //set time base (static var)
    return now - elapsed.start; //msec
}

//eof
