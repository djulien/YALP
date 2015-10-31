//plug-in to provide a consistent time base and hide implementation
'use strict';

module.exports.Now = function()
{
    if (global.v8debug) module.exports.Now.asString(); //allow latest time to be seen more easily in node inspector
//https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now
    return Date.now? Date.now(): (new Date()).getTime(); //poly fill < ECMA-262 5th edition; TODO: use process.hrtime (nsec)?
}

module.exports.elapsed = function(when)
{
    return (when || module.exports.Now()) - started;
}

module.exports.Now.asString = function(when)
{
    var local2utc = when? new Date(when): new Date(); //optional param
    local2utc.setTime(local2utc.getTime() - local2utc.getTimezoneOffset() * 60000);
    return module.exports.Now.latest = local2utc.toISOString().substr(11, 12);
}

module.exports.elapsed.asString = function(msec)
{
    module.exports.Now.asString(msec || module.exports.elapsed());
}

//add method to an object:
module.exports.addNow = function(that, name)
{
//    this.getTime = function() //check current time from a consistent place;
    Object.defineProperty(that, name || "now", //read-only
    {
        get: function() { return module.exports.Now(); },
    });
}

var started = module.exports.Now();

//eof
