//expose exported items to global object
//idea from https://github.com/shelljs/shelljs/blob/master/global.js and others
'use strict';

module.exports = global.make_global = function(parent)
{
    for (var prop in parent)
    {
        if (parent.hasOwnProperty(prop)) global[prop] = parent[prop];
    }
}

//eof
