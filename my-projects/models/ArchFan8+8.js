'use strict';

var chpool = require('./chpool');
    function alloc(ofs, dims, stride, model)
    {
        this.models.push(model);
        var numch = 1;
        dims.forEach(function (axis) { numch *= axis; });
        var retval = new ndarray(this.chpool, dims, stride, ofs);
        this.used = Math.max(ofs + numch, this.used);
        return retval;
    }

var ArchFan = require('my-plugins/models'); //generic model + fx
//var fx = require('my-plugins/fx/common');

module.exports = ArchFan;

var num_arches = 0;

function ArchFan(opts)
{
    if (!(this instanceof ArchFan)) return new ArchFan(opts); //set "this"
    opts = Object.assign(
    {
        name: "AF#" + ++num_arches,
        startch: chpool.used,
        cache: path.join(__dirname, "fx_cache.cache"),
    }, opts);

    this.cache =
    {
        get: function(frame)
    };
    this.chvals = chpool.alloc(opts.startch, [2, 8], 0, this);
    this.get = function(frame, af, seg)
    {
        this.cache.read(frame);
        return this.chvals.get(af, seg);
    };
    this.set = function(frame, af, seg, val)
    {
        this.cache.read(frame);
        this.chvals.set(af, seg, val);
        this.cache.dirty = true;
    }
}


ArchFan.fx.all = function(color)
{
    for (var seg = 0; seg < 8; ++seg)
    {
        this.set(0, seg, color);
        this.set(1, seg, color);
    }
    return this; //allow chains
}

ArchFan.fx.wipe1 = function(opts)
{
    for (var
}

//eof
