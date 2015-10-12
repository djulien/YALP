//plug-in to provide a consistent time base and hide implementation
'use strict';

module.exports.Now = function()
{
    if (global.v8debug) module.exports.Now.asString(); //allow latest time to be seen more easily in node inspector
//https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now
    return Date.now? Date.now(): (new Date()).getTime(); //poly fill < ECMA-262 5th edition; TODO: use process.hrtime (nsec)?
}

module.exports.Now.asString = function()
{
    var now = new Date();
    var local2utc = now.setTime(now.getTime() - now.getTimezoneOffset() * 60000);
    return module.exports.Now.latest = local2utc.toISOString().substr(11, 12);
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

//eof
