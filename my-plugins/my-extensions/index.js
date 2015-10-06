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

module.exports = true; //dummy ret val in case caller needs a real value

//module.exports = function (cfg)
//{
//outer hook is executed first, inner hook is last
    require('./enforce-strict'); //help catch errors; NOTE: strict must be first stmt, so this one must be done first
//    require('./expand-macros'); //macro expansions
//    require('./line-numbers'); //makes finding debug, console, or other stmts easier
    if (cfg['line-stamps'] !== false) require('./line-stamps'); //makes debug easier; NOTE: do this one first so line#s are correct
    if (cfg['loader-logging'] !== false) require('./loader-logging'); //makes debug easier
    if (cfg['no-try'] !== false) require('./no-try'); //makes finding source of errors easier
//}


console.log("called from ".blue, module.parent.filename);
//delete module.parent.require.cache[module.parent.require.resolve(module.parent.filename)]; //remove caller from cache (force reload)
//require(module.parent.filename); //re-include caller with language extensions turned on

//eof
