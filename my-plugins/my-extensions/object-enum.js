'use strict';

module.exports = add_method;

function add_method(thing, name, value)
{
    if (thing[name]) return; //already there
    Object.defineProperty(thing, name, {value: value});
    console.log("extended %s with %s".blue, thing.constructor.name, name);
}

add_method(Object.prototype, 'forEach', function(cb)
{
    for (var inx in this)
        if (inx !== 'length')
            cb(this[inx], inx, this);
});

add_method(Object.prototype, 'every', function(cb)
{
    for (var inx in this)
        if (inx !== 'length')
            if (!cb(this[inx], inx, this)) return false; //short circuit
    return true;
});

add_method(Object.prototype, 'some', function(cb)
{
    for (var inx in this)
        if (inx !== 'length')
            if (cb(this[inx], inx, this)) return true; //short circuit
    return false;
});

//eof
