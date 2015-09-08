'use strict';
//YALP formatter plug-in to add "load ..." / "... loaded" logging to other plug-ins

var hook = require('node-hook'); //https://github.com/bahmutov/node-hook
var path = require('path'); //https://nodejs.org/api/path.html

//http://bahmutov.calepin.co/hooking-into-node-loader-for-fun-and-profit.html
hook.hook('.js', function(src, fullpath)
{
    var relpath = path.relative(__dirname, fullpath);
    return 'console.log("load \'' + relpath + '\' ...");\n'
        + src
        + 'console.log("... loaded \'' + relpath + '\'");\n';
});

function unhook()
{
    hook.unhook('.js');
}

module.exports = unhook; //commonjs

//eof
