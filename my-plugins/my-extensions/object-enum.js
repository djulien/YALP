'use strict';

require('colors');

module.exports.add_method = add_method;
module.exports.classname = classname;

function classname(thing) { return thing.constructor.name; }

function add_method(thing, name, value)
{
    if (thing[name]) return; //already there
    Object.defineProperty(thing, name, {value: value});
    console.log("extended %s with %s".blue, classname(thing), name);
//    console.log("thing is %j", Object.prototype.toString.call(thing));
//    console.log("isproto? %s", thing.isPrototypeOf(classname(thing)), thing.prototype? "has proto": "no proto");
}

add_method(Object.prototype, 'forEach', function forEach(cb)
{
    for (var inx in this)
        if (inx !== 'length')
            cb(this[inx], inx, this);
});

add_method(Object.prototype, 'every', function every(cb)
{
    for (var inx in this)
        if (inx !== 'length')
            if (!cb(this[inx], inx, this)) return false; //short circuit
    return true;
});

add_method(Object.prototype, 'some', function some(cb)
{
    for (var inx in this)
        if (inx !== 'length')
            if (cb(this[inx], inx, this)) return true; //short circuit
    return false;
});

//eof
