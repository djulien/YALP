//return base name with no extension; cuts down on verbosity
'use strict';

var path = require('path');

module.exports = function(filename)
{
    for (;;)
    {
        var retval = path.basename(filename, path.extname(filename));
        if (retval != "index") return retval;
        filename = path.dirname(filename); //use parent folder name; basename was not descriptive enough
    }
}

//eof
