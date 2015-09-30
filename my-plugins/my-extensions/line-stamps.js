//YALP formatter plug-in to add src line stamps to all debug + console.log statements
//using Error.stack is complicated due to nested calls, so use this instead
'use strict';

var EXT = '.js';
var SELECTIVE = null; //use regex here to select files
var WANT_NODE = true; //false; //CAUTION: slower perf when true
var WANT_COLOR = true;

var hook = require('node-hook'); //https://github.com/bahmutov/node-hook
var path = require('path'); //https://nodejs.org/api/path.html
var falafel = require('falafel'); //https://github.com/airportyh/falafel_fun/
//var fs = require('fs');

//http://bahmutov.calepin.co/hooking-into-node-loader-for-fun-and-profit.html
hook.hook(EXT, function(src, fullpath)
{
    if (!WANT_NODE && (fullpath.indexOf('node_modules') != -1)) return src;
    if (SELECTIVE && !fullpath.match(SELECTIVE)) return src;
//    var filename = process.argv[2];
//    var code = fs.readFileSync(filename) + '';
    var filename = path.basename(fullpath, path.extname(fullpath));
    if (filename == "index") filename = path.join(path.basename(path.dirname(fullpath)), filename); //show one level of parent for common names
//    console.log("line-stamps parsing " + filename); //fullpath);
//    return src.replaceAll(/(?<![A-Za-z0-9$_])console\.log\(/, "console.log('@" + filename + ":" + 0 + "', ");
//http://tobyho.com/2013/12/20/falafel-source-rewriting-magicial-assert/
//if (filename == "first") console.log("src in:\n", src);
//    try {
    var auto_strict = false;
    var src = falafel({source: src, ecmaVersion: 6, locations: true}, function(node) //https://github.com/substack/node-falafel/issues/37
    {
        auto_strict = auto_strict || isAutoStrict(node);
        if (!isConsoleLog(node)) return;
//        console.log("FOUND ", node.arguments);
//        console.log("old: " + node.source());
//        node.arguments.forEach(function(val, inx) { console.log("arg[%d/%d]: %s", inx, node.arguments.length, val.source()); });
        var srcline = node.loc.start.line; //https://github.com/marijnh/acorn
        if (auto_strict) --srcline; //kludge: compensate for auto-generated line
        var msg_color = WANT_COLOR? '.gray': '';
        if (WANT_COLOR) node.arguments.forEach(function (arg) //try to match color
        {
            arg.source().replace(/\.(black|red|green|yellow|blue|magenta|cyan|white|gr[ae]y)/, function(which) { return msg_color = which; })
//            console.log("color ", color, arg.source());
        });
        var newsrc = 'console.log(' + node.arguments.map(function(arg){ return arg.source(); }).join(', ') + (node.arguments.length? ', ': '') + '"@' + filename + ':' + srcline + '"' + msg_color + ')';
        node.update(newsrc);
//        console.log("new: " + newsrc);
//        console.log("verify: " + node.source());
    });
    if (typeof src === "object") src = src.toString(); //require() module manager wants a string
//if (filename == "first") console.log("src out:\n", src);
//    if (src2 !== src) console.log(filename + " changed! " + (typeof src) + " " + (typeof src2));
    return WANT_COLOR? 'require("colors");\n' + src: src;
//    } catch (exc) { console.log("falafel exc: " + exc + " in " + fullpath); throw exc; }
});

//from http://tobyho.com/2013/12/20/falafel-source-rewriting-magicial-assert/
function isConsoleLog(node, debug)
{
//    var ntce = (node.type === 'CallExpression'), nctme = ntce? (node.callee.type === 'MemberExpression'): null;
//    if (debug)
//        console.log("node %s, callee %s, obj %s, %s, prop %s, %s? %d", node.type, ntce? node.callee.type: "-", nctme? node.callee.object.type: "-", nctme? node.callee.object.name: "-", nctme? node.callee.property.type: "-", nctme? node.callee.property.name: "-", inner(node));
//    return inner(node);
//function inner(node){
    return (node.type === 'CallExpression') &&
        (node.callee.type === 'MemberExpression') &&
        (node.callee.object.type === 'Identifier') &&
        ((node.callee.object.name === 'console') || (node.callee.object.name === 'debug')) && //stamp custom debug lines as well
        (node.callee.property.type === 'Identifier') &&
        (node.callee.property.name === 'log');
//}
}

function isAutoStrict(node)
{
    return false; //TODO: look for \'use strict\';//generated\n'
}

function unhook()
{
    hook.unhook(EXT);
}

module.exports = unhook; //commonjs

//eof
