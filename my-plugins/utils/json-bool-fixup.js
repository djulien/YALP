//convert bool strings to actual bool values
//this avoids having to do something like this:
//function istrue(thing)
//{
//    return (thing === true) || (thing == 'true');
//}
//function isfalse(thing)
//{
//    return (thing === false) || (thing == 'false');
//}


var traverse = require('traverse');

module.exports = function(obj)
{
    traverse(obj).forEach(function (val)
    {
        if ((val !== 'true') && (val !== 'false')) return;
        this.update(val === 'true');
        console.log("json-bool-fixup: turned %s into bool %d".yellow, this.path.join('.'), val === 'true');
    });
    return obj;
}

//eof
