//YALP formatter plug-in to disable try/catch in other plug-ins (for easier debug)
'use strict';

var EXT = '.js';
var WANT_NODE = false;
var SELECTIVE = /plugins\/misc\/server/; //use regex here to select files

var hook = require('node-hook'); //https://github.com/bahmutov/node-hook
var path = require('path'); //https://nodejs.org/api/path.html

//http://bahmutov.calepin.co/hooking-into-node-loader-for-fun-and-profit.html
hook.hook(EXT, function(src, fullpath)
{
    if (!WANT_NODE && (fullpath.indexOf('node_modules') != -1)) return src;
    if (SELECTIVE && !fullpath.match(SELECTIVE)) return src;
    var relpath = path.relative(__dirname, fullpath);

//    return src.replaceAll(/(?<![A-Za-z0-9$_])try(?>![A-Za-z0-9$_])/, "/*try*/").replaceAll(/(?<![A-Za-z0-9$_])catch(?>![A-Za-z0-9$_])/, "function no_catch");
//    var newsrc = src.replace(/\Btry\B/g, "/*try*/").replace(/\Bcatch\B/g, "function no_catch"); //http://stackoverflow.com/questions/22999999/negative-lookbehind-regex-in-javascript
//    var newsrc = src.replace(/(?![A-Za-z0-9$_])try(?![A-Za-z0-9$_])/g, "/*try*/").replace(/(?![A-Za-z0-9$_])catch(?![A-Za-z0-9$_])/g, "function no_catch"); //http://stackoverflow.com/questions/7376238/javascript-regex-look-behind-alternative
    var newsrc = src.replace(/([^A-Za-z0-9$_])try([^A-Za-z0-9$_])/g, "$1/*try*/$2").replace(/([^A-Za-z0-9$_])catch([^A-Za-z0-9$_])/g, "$1function no_catch$2");
    console.log("removing try/catch from " + relpath + ", changed? " + (newsrc != src));
    return newsrc;
});

function unhook()
{
    hook.unhook(EXT);
}

module.exports = unhook; //commonjs

//eof
