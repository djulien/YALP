'use strict';
//YALP formatter plug-in to add src line stamps to all debug + console.log statements
//using Error.stack is complicated due to nested calls, so use this instead

var hook = require('node-hook'); //https://github.com/bahmutov/node-hook
var path = require('path'); //https://nodejs.org/api/path.html
var falafel = require('falafel'); //https://github.com/airportyh/falafel_fun/
//var fs = require('fs');

//http://bahmutov.calepin.co/hooking-into-node-loader-for-fun-and-profit.html
hook.hook('.js', function(src, fullpath)
{
//    var filename = process.argv[2];
//    var code = fs.readFileSync(filename) + '';
    var filename = path.basename(fullpath, path.extname(fullpath));
    console.log("parsing " + filename);
//    return src.replaceAll(/(?<![A-Za-z0-9$_])console\.log\(/, "console.log('@" + filename + ":" + 0 + "', ");
//http://tobyho.com/2013/12/20/falafel-source-rewriting-magicial-assert/
    src = falafel(src, function(node)
    {
        if (!isConsoleLog(node)) return;
        node.update('console.log(new Date() + ": " + ' + node.arguments.map(function(arg){ return arg.source(); }).join(', ') + ')');
    });
    return src;
});

//from http://tobyho.com/2013/12/20/falafel-source-rewriting-magicial-assert/
function isConsoleLog(node)
{
    return (node.type === 'CallExpression') &&
        (node.callee.type === 'MemberExpression') &&
        (node.callee.object.type === 'Identifier') &&
        (node.callee.object.name === 'console') &&
        (node.callee.property.type === 'Identifier') &&
        (node.callee.property.name === 'log');
}

function unhook()
{
    hook.unhook('.js');
}

module.exports = unhook; //commonjs

//eof
