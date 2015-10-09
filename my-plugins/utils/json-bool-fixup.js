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

var DEBUG = false;

var traverse = require('traverse');

module.exports = function(obj)
{
    traverse(obj).forEach(function (val) //NOTE: this == node in obj
    {
        if ((typeof val === 'string') && val.match(/^ *[0-9]+ *$/)) //might as well do ints also
        {
            this.update(1 * val);
            if (DEBUG) console.log("json-bool-fixup: turned %s into int %d".yellow, this.path.join('.'), 1 * val);
            return;
        }
        if ((val !== 'true') && (val !== 'false')) return;
        this.update(val === 'true');
        if (DEBUG) console.log("json-bool-fixup: turned %s into bool %d".yellow, this.path.join('.'), val === 'true');
    });
    return obj;
}

//eof
