//add a cached Speed property
'use strict';

module.exports = addSpeed;

function addSpeed(that, setter) //chkprop,
{
    var m_speed; //private so it can be cached across songs
    var chkprop = 'is' + typeof that;
    Object.defineProperty(that, "speed",
    {
        get: function() { return m_speed; },
        set: function(newval)
        {
            if (chkprop && !this[chkprop]) throw "This is not a '" + typeof that + "'"; //paranoid/sanity context check
            m_speed = newval;
            if (setter) setter(newval);
        },
    });
}

//eof
