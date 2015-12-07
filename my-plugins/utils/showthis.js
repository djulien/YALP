
'use strict';

module.exports = showthis;

//debug:
function showthis(desc)
{
    var buf = '';
    for (var i in this)
        buf += ', ' + (this.hasOwnProperty(i)? i: '(' + i + ')');
    console.log(this.constructor.name + " " + (desc || "this") + " has props: " + buf.substr(2));
}

//eof