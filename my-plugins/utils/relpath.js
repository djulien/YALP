//return path relative to app dir (cwd); cuts down on verbosity
'use strict';

var path = require('path');
var cwd = process.cwd(); //__dirname; //save it in case it changes later

module.exports = function(abspath, basedir)
{
    return path.relative(basedir || cwd, abspath);
}

//eof