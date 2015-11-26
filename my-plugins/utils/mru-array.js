//Mru Array with histogram

'use strict';

var inherits = require('inherits');
var makenew = require('my-plugins/utils/makenew');

module.exports = MruArray;


function MruArray(opts) //{limit, bucketsize}
{
    if (!(this instanceof MruArray)) return makenew(MruArray, arguments);
    this.init(opts);
//no    this.length = m_opts.length || 0; //doesn't make sense to have define empty entries for stats
    Array.call(this); //, m_opts.length);
}
inherits(MruArray, Array);


MruArray.prototype.bucket = function(value)
{
    var retval = this.opts.bucketsize * Math.ceil(Math.abs(value) / this.opts.bucketsize); //round away from 0 for + and -
    return (value < 0)? -retval: retval; //restore sign
}


MruArray.prototype.init = function(opts)
{
    this.opts = (typeof opts === 'number')? {limit: opts}: opts || {};
    if (!('bucketsize' in this.opts)) this.opts.bucketsize = 10;
    if (!('limit' in this.opts)) this.opts.limit = null;

//    this.count = 0;
    this.sum = 0; //mru
    this.sum_all = 0;
    this.length_all = 0;
//    this.mru = [];
    this.histogram = {};
}


MruArray.prototype.push = function(newval)
{
    if (this.opts.limit !== null) while (this.length >= this.opts.limit) this.pop();
    Array.prototype.push.call(this, newval);
    this.sum += Math.abs(newval); //update running total; use abs() so total is not misleading if some values < 0
    this.sum_all += Math.abs(newval);
    ++this.length_all;
//    console.log("typeof histo ", newval, this.bucket(newval), typeof this.histogram[this.bucket(newval)] );
//    console.log("typeof histo ", isNaN(++this.histogram[this.bucket(newval)]) );
    if (isNaN(++this.histogram[this.bucket(newval)])) this.histogram[this.bucket(newval)] = 1; //CAUTION: typeof NaN == 'number', so just check NaN
}


MruArray.prototype.pop = function()
{
    var was_empty = (this.length < 1);
    var oldval = Array.prototype.pop.call(this);
    if (!was_empty)
    {
        --this.histogram[this.bucket(oldval)];
        this.sum -= Math.abs(oldval);
    }
    return oldval;
}


//not needed:
//MruArray.prototype.splice = function(start_ofs, count, newvals)
//{
//    Array.prototype.splice.apply(this, arguments).forEach(function(pruned)
//    {
//        this.sum -= pruned; //update running total
//        --this.histogram[this.bucket(pruned)];
//    }.bind(this));
//    if (arguments.length > 2); //TODO
//}


//these are not needed/implemented for MRU:
MruArray.prototype.splice = function() { throw "MruArray.splice not implemented"; }
MruArray.prototype.shift = function() { throw "MruArray.shift not implemented"; }
MruArray.prototype.unshift = function() { throw "MruArray.unshift not implemented"; }


//eof
