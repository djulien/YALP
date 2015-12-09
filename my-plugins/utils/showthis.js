
'use strict';

module.exports = showthis;

//debug:
function showthis(desc)
{
    var buf = '';
    for (var i in this)
    {
        buf += ', ' + (this.hasOwnProperty(i)? i: '(' + i + ')');
        if (typeof this[i] == 'number') buf += ' = #' + hex8(this[i]);
        else if (typeof this[i] != 'function') buf += ' = ' + this[i];
    }
    console.log(this.constructor.name + " " + (desc || "this") + " has props: " + buf.substr(2));
}

function hex8(val) { return ('00000000' + (val >>> 0).toString(16)).slice(-8); }

//eof
