'use strict';

require('colors');
require('./win-control-c');
var cfg = require('my-plugins/cmdline').debug || {};

require = function (path) //make it verbose
{
    console.log("my-extensions: loading %s".blue, path);
    return module.require(path);
}

console.log("my extensions config: ".blue, cfg);

//module.exports = function (cfg)
//{
//outer hook is executed first, inner hook is last
    require('./enforce-strict'); //help catch errors; NOTE: strict must be first stmt, so this one must be done first
    if (cfg['line-stamps'] !== false) require('./line-stamps'); //makes debug easier; NOTE: do this one first so line#s are correct
    if (cfg['loader-logging'] !== false) require('./loader-logging'); //makes debug easier
    if (cfg['no-try'] !== false) require('./no-try'); //makes finding source of errors easier
//}


//eof
