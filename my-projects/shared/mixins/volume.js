//add a cached Volume property
'use strict';

module.exports = addVolume;

function addVolume(that, setter) //chkprop,
{
    var m_volume; //private so it can be cached across songs
    var chkprop = 'is' + that.constructor.name;
    Object.defineProperty(that, "volume",
    {
        get: function() { return m_volume; },
        set: function(newval)
        {
            if (chkprop && !this[chkprop]) throw "This is not a '" + chkprop.substr(2) + "'"; //paranoid/sanity context check
            m_volume = newval;
            if (setter) setter(newval);
        }.bind(that),
        enumerable: true,
    });
}

//eof
