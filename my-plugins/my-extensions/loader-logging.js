//YALP formatter plug-in to add "load ..." / "... loaded" logging to other plug-ins
'use strict';

var EXT = '.js';
var WANT_NODE = false;
var WANT_MEM = true;
var WANT_TIMES = false;
var WANT_COLOR = '.magenta'; //null
var SELECTIVE = null; //use regex here to select files

var hook = require('node-hook'); //https://github.com/bahmutov/node-hook
var path = require('path'); //https://nodejs.org/api/path.html
var cwd = process.cwd(); //__dirname; //save it in case it changes later
var timestamp = WANT_TIMES? 'console.timeStamp(); /*shows time in FF, adds event to timeline in Chrome*/': '';

//http://bahmutov.calepin.co/hooking-into-node-loader-for-fun-and-profit.html
hook.hook(EXT, function(src, fullpath)
{
    if (!WANT_NODE && (fullpath.indexOf('node_modules') != -1)) return src;
    if (SELECTIVE && !fullpath.match(SELECTIVE)) return src;
    var relpath = path.relative(process.cwd() /*__dirname*/, fullpath);
//    console.log("loader-logging parsing " + relpath); //fullpath);

//avoid newlines in order to keep source line#s unchanged
    return ((WANT_COLOR || WANT_MEM)? 'require("colors");': '')
        + 'var loadlog = require("' + path.relative(cwd, __filename).replace(/\.js$/, '') + '").nesting;'
        + (WANT_MEM? 'var meminfo = process.memoryUsage(); function memfmt(bytes) { var hfmt = require("human-format"); return hfmt(bytes, new hfmt.Scale({B: 0, KB: 1024, get MB() { return 1024 * this.KB; }, get GB() { return 1024 * this.MB; }, get TB() { return 1024 * this.GB; },})); }': '')
//        + 'console.log("load \'' + relpath + '\' ..."' + WANT_COLOR + ');'
        + (WANT_MEM? 'console.log(loadlog.push() + "load \'' + relpath + '\', mem: %s, %s, %s, %s ..."' + WANT_COLOR + ', memfmt(meminfo.rss), memfmt(meminfo.vsize || 0), memfmt(meminfo.heapTotal), memfmt(meminfo.heapUsed));': 'console.log("load \'' + relpath + '\' ..."' + WANT_COLOR + ');')
        + timestamp
        + src
        + timestamp
        + 'console.log(loadlog.pop() + "... loaded \'' + relpath + '\'"' + WANT_COLOR + ');';
});

function unhook()
{
    hook.unhook(EXT);
}

module.exports = unhook; //commonjs


module.exports.nesting =
{
    nesting: '',
    push: function() { var oldval = this.nesting; this.nesting += '  '; return oldval; },
    pop: function() { return this.nesting = this.nesting.substr(2); },
};

//eof
