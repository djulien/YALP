
'use strict';

var inherits = require('inherits');
var makenew = require('my-plugins/utils/makenew');
var models = require('my-projects/models/model'); //generic models
var Rect2D = models.Rect2D;

var allinst = [];
var IcicleBank = module.exports = function(opts)
{
    if (!(this instanceof IcicleBank)) return makenew(IcicleBank, arguments);
    opts = (typeof opts !== 'object')? {param: opts}: opts || {};
    var args = Array.from(arguments); args[0] = opts;
    Rect2D.apply(this, args);

//    if (!IcicleBank.all) IcicleBank.all = [];
    allinst.push(this);
}
inherits(IcicleBank, Rect2D);


//composite model:
IcicleBank.all = function(opts)
{
    if (!(this instanceof IcicleBank.all)) return makenew(IcicleBank.all, arguments);
    opts = (typeof opts !== 'object')? {param: opts}: opts || {};
    var m_maxch = 0;
    opts.startch = opts.chpool.numch;
    allinst.forEach(function(icbank, inx)
    {
        if (icbank.startch < opts.startch) opts.startch = icbank.startch;
        if (icbank.startch + icbank.numch > m_maxch) m_maxch = icbank.startch + icbank.numch;
    });
    opts.numch = m_maxch - opts.startch;
    var args = Array.from(arguments); args[0] = opts;
    Rect2D.apply(this, args);

    this.xy2node = function(x, y) //overide with custom node order
    {
        return this.nodeofs(this.R2L(x) * opts.h + this.B2T(y));
    }
}
inherits(IcicleBank.all, Rect2D);


//eof
