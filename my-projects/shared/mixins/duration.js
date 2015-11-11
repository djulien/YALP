//add a computed/cached Duration property
'use strict';

module.exports = addDuration;

function addDuration(that, listprop) //, chkprop)
{
//    var duration_known = promisedio.Deferred;
    var m_duration; //private to prevent bad values from caller
    var chkprop = 'is' + that.constructor.name;
    Object.defineProperty(that, "duration",
    {
        get: function() //read-only, computed, cached; NOTE: not valid until playlist promise is resolved
        {
            if (chkprop && !this[chkprop]) throw "This is not a '" + chkprop.substr(2) + "'"; //paranoid/sanity context check
            if (m_duration === 0) //recalculate new value
                (this[listprop] || []).forEach(function (file, inx) { m_duration += file.duration; }); //, this); //CAUTION: need to preserve context within forEach loop
            return m_duration; //undef until recalculated
        }.bind(that),
        set: function(newval)
        {
            if (chkprop && !this[chkprop]) throw "This is not a '" + chkprop.substr(2) + "'"; //paranoid/sanity context check
            if (newval) throw "Duration is read-only"; //only allow it to be cleared
            m_duration = newval;
        }.bind(that),
        enumerable: true,
    });
}

//eof
