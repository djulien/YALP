//return name/location of caller
'use strict';

var callsite = require('callsite');
var sprintf = require('sprintf-js').sprintf;
var shortname = require('my-plugins/utils/shortname');

module.exports = function caller(depth)
{
    var retval = '??';
    if (!depth) depth = 0;
    callsite().every(function(stack, inx)
    {
        if (stack.getFileName().indexOf("node_modules") != -1) return true;
        if (stack.getFileName() == __filename) return true;
        if (!depth--) return true;
//        console.log('stk[%d]: %s@%s:%d'.blue, inx, stack.getFunctionName() || 'anonymous', relpath(stack.getFileName()), stack.getLineNumber());
        retval = sprintf('stk[%d]: %s@%s:%d', inx, stack.getFunctionName() || '(anonymous)', shortname(stack.getFileName()), stack.getLineNumber());
        return false;
    });
    return retval;
}

//eof
