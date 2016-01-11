
'use strict';

const path = module.exports = require('path'), old_relative = path.relative;
path.relative = function relative_ary(from, to)
{
    if (Array.isArray(to))
    {
        var retval = [];
        to.forEach(function ary_enum(filename) { retval.push(old_relative(from, filename)); });
        return retval;
    }
    return old_relative.apply(null, arguments);
}

//eof
