//YALP formatter plug-in to expand macros in other plug-ins
'use strict';

var EXT = '.js';
var WANT_NODE = false;
var SELECTIVE = null; //use regex here to select files

var hook = require('node-hook'); //https://github.com/bahmutov/node-hook

//http://bahmutov.calepin.co/hooking-into-node-loader-for-fun-and-profit.html
hook.hook(EXT, function(src, fullpath)
{
    if (!WANT_NODE && (fullpath.indexOf('node_modules') != -1)) return src;
    if (SELECTIVE && !fullpath.match(SELECTIVE)) return src;

//    return src.replace(/(?<![A-Za-z0-9$_])global\.return(?![A-Za-z0-9$_])/, "return"); //turn hidden return into real one
    return src.replace(/([^A-Za-z0-9$_])global\.return([^A-Za-z0-9$_])/, "$1return$2"); //turn hidden return into real one
});

function unhook()
{
    hook.unhook(EXT);
}

module.exports = unhook; //commonjs

//eof
