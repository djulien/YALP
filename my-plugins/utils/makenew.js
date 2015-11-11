'use strict';

var makenew = module.exports = function(type, args)
{
//    if (this instanceof type) return;
    return new (type.bind.apply(type, [null].concat(Array.from(args))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
}

//eof
