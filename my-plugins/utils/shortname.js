//return base name with no extension; cuts down on verbosity
'use strict';

var path = require('path');

module.exports = function(filename)
{
    return path.basename(filename, path.extname(filename));
}

//eof
