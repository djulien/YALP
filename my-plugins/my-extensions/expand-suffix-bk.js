//YALP formatter plug-in to expand K, M suffix
'use strict';

var EXT = '.js';
var WANT_NODE = false;
var SELECTIVE = null; // /plugins\/misc\/server/; //use regex here to select files

var hook = require('node-hook'); //https://github.com/bahmutov/node-hook
var path = require('path'); //https://nodejs.org/api/path.html

//http://bahmutov.calepin.co/hooking-into-node-loader-for-fun-and-profit.html
hook.hook(EXT, function(src, fullpath)
{
    if (!WANT_NODE && (fullpath.indexOf('node_modules') != -1)) return src;
    if (SELECTIVE && !fullpath.match(SELECTIVE)) return src;
    var relpath = path.relative(/*__dirname*/ process.cwd(), fullpath);

    var newsrc = src.replace(/[0-9]+[KM]/g, function(str)
    {
        var strlen = str.length;
        return str.substr(0, strlen - 1) * 1024 * ((str.substr(strlen - 1) == "M")? 1024: 1);
    });
    console.log("expanding suffix from " + relpath + ", changed? " + (newsrc != src));
    return newsrc;
});

function unhook()
{
    hook.unhook(EXT);
}

module.exports = unhook; //commonjs

//eof
