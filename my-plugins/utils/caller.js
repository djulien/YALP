//return name/location of caller
'use strict';

var callsite = require('callsite');
var sprintf = require('sprintf-js').sprintf;
var shortname = require('my-plugins/utils/shortname');

module.exports.stack = function(depth)
{
    return callsite()[depth].getFileName();
}

module.exports.caller = function(depth)
{
    var retval = '';
    var want_all = !depth;
    var abbreviated = (depth < 0);
    if (abbreviated) depth = -depth;
    callsite().every(function(stack, inx)
    {
        if (!want_all)
        {
            if (stack.getFileName().indexOf("node_modules") != -1) return true;
            if (stack.getFileName() == __filename) return true;
            if (depth--) return true;
        }
//        console.log('stk[%d]: %s@%s:%d'.blue, inx, stack.getFunctionName() || 'anonymous', relpath(stack.getFileName()), stack.getLineNumber());
        var caller = sprintf('@%s:%d', shortname(stack.getFileName()), stack.getLineNumber());
        if (!abbreviated) caller = sprintf('stk[%d]: %s', inx, stack.getFunctionName() || '(anonymous)') + caller;
        if (!want_all) retval = caller;
        else retval += '\n' + caller;
        return want_all; //false;
    });
    return retval || '??';
}

//eof
