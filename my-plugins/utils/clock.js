//plug-in to provide a consistent time base and hide implementation
'use strict';

module.exports.Now = Now;
module.exports.elapsed = elapsed;
module.exports.asString = asString;
module.exports.addNow = addNow;


function Now()
{
    if (global.v8debug) module.exports.Now.asString(); //allow latest time to be seen more easily in node inspector
//https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now
    return Date.now? Date.now(): (new Date()).getTime(); //poly fill < ECMA-262 5th edition; TODO: use process.hrtime (nsec)?
}

function elapsed(when)
{
    return (when || module.exports.Now()) - started;
}

/*module.exports.*/ Now.asString = function(when)
{
    var local2utc = when? new Date(when): new Date(); //optional param
    local2utc.setTime(local2utc.getTime() - local2utc.getTimezoneOffset() * 60000);
//    console.log("local utc ", local2utc.toISOString());
    return module.exports.Now.latest = local2utc.toISOString().substr(11, 12);
}

function asString(msec)
{
//    console.log("utc as str ", msec);
    var local2utc = (typeof msec !== 'undefined')? new Date(msec): new Date(); //default to now; optional param
//    local2utc.setTime(local2utc.getTime() - local2utc.getTimezoneOffset() * 60000); //make it display as-is
//    console.log("local utc ", msec, local2utc.toISOString());
    return module.exports.asString.latest = local2utc.toISOString().substr(11, 12).replace(/^(00:)+/, '');
}

/*module.exports.*/ elapsed.asString = function(msec)
{
//    console.log("elapsed ", msec, module.exports.Now.asString(msec), module.exports.elapsed(), module.exports.Now.asString(module.exports.elapsed()));
    module.exports.Now.asString(msec || module.exports.elapsed());
}

//add method to an object:
function addNow(that, name)
{
//    this.getTime = function() //check current time from a consistent place;
    Object.defineProperty(that, name || "now", //read-only
    {
        get: function() { return module.exports.Now(); },
        enumerable: true,
    });
}

var started = module.exports.Now();

//eof
