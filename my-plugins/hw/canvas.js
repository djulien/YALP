//main hardware abstraction for graphics functions/effects
'use strict';

module.exports = Canvas; //commonjs; returns new canvas object to caller

//var YALP = YALP || {}; //namespace
///*YALP.*/ Canvas = function(path, name) //ctor
//YALP.Canvas.prototype.load = function()

function Canvas(opts) //ctor/factory
{
    if (!(this instanceof Canvas)) return new Canvas(opts); //make "new" optional; make sure "this" is set
    opts = Object.assign({'3D': true, refresh: 50}, opts);

//basic geometry:
    var need_buf = false;
    var m_width = 0, m_height = 0, m_buf = null;
    Object.defineProperty(this, "width",
    {
        get: function () { return m_width; },
        set: function (newval)
        {
            if (newval == m_width) return;
            if (newval < 0) throw "Invalid canvas width: " + newval;
            need_buf = true;
            m_width = newval;
        },
    });
    Object.defineProperty(this, "height",
    {
        get: function () { return m_height; },
        set: function (newval)
        {
            if (newval == m_height) return;
            if (newval < 0) throw "Invalid canvas height: " + newval;
            need_buf = true;
            m_height = newval;
        },
    });
    Object.defineProperty(this, "buffer",
    {
        get: function () { return m_buf; },
        set: function (newval)
        {
            if (newval != height) need_buf = true; height = newval; },
    });

    this.
}

//eof
