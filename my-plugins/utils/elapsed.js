'use strict'; //helps catch errors

var timescale = require('./time-scale');
//var hfmt = require('human-format');

//example based on https://github.com/julien-f/human-format
//var timeScale = new hfmt.Scale(
//{
//    msec: 0,
//    sec: 1000,
//    get min() { return 60 * this.sec; },
//    get hr() { return 60 * this.min; },
//    get day() { return 24 * this.hr; },
//    get mon() { return (365.24 / 12) * this.day; }, //NOTE: approx
//});


//elapsed(); //set time base to now

module.exports = Elapsed; //commonjs

function Elapsed(reset) //factory
{
    if (!(this instanceof Elapsed)) return new Elapsed(reset);
    this.now = function()
    {
        return (new Date()).getTime() - (this.start || reset || 0); //TODO: use process.hrtime (nsec)?
    }
    this.start = /*reset ||*/ this.now(); //set time base
    this.scaled = function(msec)
    {
        return timescale(msec || this.now());
    }
//    return (when || now) - elapsed.start; //msec
}
//Object.defineProperty(Elapsed.prototype, "now",
//{
//    get: function() { return (new Date()).getTime(); }}, //TODO: use process.hrtime (nsec)?
//});

//eof
