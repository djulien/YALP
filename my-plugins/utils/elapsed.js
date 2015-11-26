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

function Elapsed(reset) //factory/ctor
{
    if (!(this instanceof Elapsed)) return new Elapsed(reset);
//    this.now = function()
//    {
//        return (new Date()).getTime() - (this.start || reset || 0); //TODO: use process.hrtime (nsec)?
//    }
    this.started = reset || 0; //#msec elapsed already; caller can back-date using < 0, or skip ahead using > 0
    Object.defineProperty(this, "now", //relative to start time
    {
        get: function() { return (new Date()).getTime() - this.started; }, //(m_start || reset || 0); }, //TODO: use process.hrtime (nsec)?
        enumerable: true,
    });
    this.started = /*reset ||*/ this.now; //set time base
    this.scaled = function(msec)
    {
        return timescale(msec || this.now);
    }
    this.pause = function()
    {
        if (this.paused) return;
        this.paused = this.now;
    }
    this.resume = function()
    {
        if (!this.paused) return;
        m_start += this.now - this.paused;
        this.paused = null;
    }
//    return (when || now) - elapsed.start; //msec
}
//Object.defineProperty(Elapsed.prototype, "now",
//{
//    get: function() { return (new Date()).getTime(); }}, //TODO: use process.hrtime (nsec)?
//    enumerable: true,
//});

//eof
