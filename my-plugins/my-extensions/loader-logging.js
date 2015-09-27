//YALP formatter plug-in to add "load ..." / "... loaded" logging to other plug-ins
'use strict';

var EXT = '.js';
var WANT_NODE = false;
var WANT_TIMES = false;
var WANT_COLOR = '.magenta'; //null
var SELECTIVE = null; //use regex here to select files

var hook = require('node-hook'); //https://github.com/bahmutov/node-hook
var path = require('path'); //https://nodejs.org/api/path.html
var timestamp = WANT_TIMES? 'console.timeStamp(); //shows time in FF, adds event to timeline in Chrome\n': '';

//http://bahmutov.calepin.co/hooking-into-node-loader-for-fun-and-profit.html
hook.hook(EXT, function(src, fullpath)
{
    if (!WANT_NODE && (fullpath.indexOf('node_modules') != -1)) return src;
    if (SELECTIVE && !fullpath.match(SELECTIVE)) return src;
    var relpath = path.relative(__dirname, fullpath);
//    console.log("loader-logging parsing " + relpath); //fullpath);

    return (WANT_COLOR? 'require("colors");\n': '')
        + 'console.log("load \'' + relpath + '\' ..."' + WANT_COLOR + ');\n'
        + timestamp
        + src
        + timestamp
        + 'console.log("... loaded \'' + relpath + '\'"' + WANT_COLOR + ');\n';
});

function unhook()
{
    hook.unhook(EXT);
}

module.exports = unhook; //commonjs

//eof
