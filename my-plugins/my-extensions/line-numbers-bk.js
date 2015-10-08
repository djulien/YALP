//YALP formatter plug-in to replace "__linenum" with actual line#
'use strict';

var EXT = '.js';
var WANT_NODE = false;
var SELECTIVE = null; //use regex here to select files

var hook = require('node-hook'); //https://github.com/bahmutov/node-hook
var path = require('path'); //https://nodejs.org/api/path.html

//http://bahmutov.calepin.co/hooking-into-node-loader-for-fun-and-profit.html
hook.hook(EXT, function(src, fullpath)
{
    if (!WANT_NODE && (fullpath.indexOf('node_modules') != -1)) return src;
    if (SELECTIVE && !fullpath.match(SELECTIVE)) return src;
    var relpath = path.relative(/*__dirname*/ process.cwd(), fullpath);
//    console.log("loader-logging parsing " + relpath); //fullpath);

    var lines = src.split('\n');
    lines.forEach(function (line, inx)
    {
        lines[inx] = line.replace(/(?<![A-Za-z0-9$_])__linenum(?![A-Za-z0-9$_])/, inx + 1); //TODO: look-behind
    });
    return lines.join('\n');
});

function unhook()
{
    hook.unhook(EXT);
}

module.exports = unhook; //commonjs

//eof
