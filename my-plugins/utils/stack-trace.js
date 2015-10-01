//TODO: replace this with require('callsite')


module.exports = function (depth)
{
//console.log("stack", (new Error()).stack);
    var retval = (new Error()).stack.split(/\n\s*at /); //http://stackoverflow.com/questions/591857/how-can-i-get-a-javascript-stack-trace-when-i-throw-an-exception; by default skip over self
//    retval.splice(depth || 3);
//console.log("retval", typeof(retval), retval);
    if (typeof depth !== 'undefined') retval = [retval[Math.min(depth + 2, retval.length - 1)]]; //skip self levels
//    else retval.splice(2); //drop self
//console.log("retval", typeof(retval), retval);
    retval.forEach(function(stkfr, inx)
    {
        if (!stkfr) return;
        retval[inx] = (stkfr + '')
            .replace(/http:.*[\/\\]/, "") //cut down on verbosity
            .replace(/^.*\/(.+\/)/, "$1") //drop grandparent dir, leave parent for easier tracking
            .replace(/\.js/i, "") //cut down on verbosity
            .replace(/:[0-9]+\)?$/, ""); //don't need char ofs
//        return true; //continue;
    });
    return retval.join('\n');
}

//eof
