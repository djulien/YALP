//add a cached Volume property
'use strict';

module.exports = addVolume;

function addVolume(that, setter) //chkprop,
{
    var m_volume; //private so it can be cached across songs
    var chkprop = 'is' + typeof that;
    Object.defineProperty(that, "volume",
    {
        get: function() { return m_volume; },
        set: function(newval)
        {
            if (chkprop && !this[chkprop]) throw "This is not a '" + typeof that + "'"; //paranoid/sanity context check
            m_volume = newval;
            if (setter) setter(newval);
        },
    });
}

//eof
