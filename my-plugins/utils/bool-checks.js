//allow string or bool compares:
'use strict'; //helps catch errors

module.exports = //commonjs
{
    istrue: istrue,
    isfalse: isfalse,
};

function istrue(thing)
{
    return (thing === true) || (thing == 'true');
}

function isfalse(thing)
{
    return (thing === false) || (thing == 'false');
}

//eof
