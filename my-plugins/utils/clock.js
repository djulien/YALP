//plug-in to provide a consistent time base as well as formating

'use strict';

//TODO: use process.hrtime (nsec) instead of Date (msec)?
const TZlocal = true; //false to use/display UTC


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//formatting:

function asTimeString(msec, tzlocal)
{
    if (arguments.length < 2) tzlocal = TZlocal;
//    console.log("utc as str ", msec);
    var local2utc = (typeof msec !== 'undefined')? new Date(msec): new Date(); //default to now; optional param
    if (tzlocal) local2utc.setTime(local2utc.getTime() - local2utc.getTimezoneOffset() * 60000); //make it display as-is
//    console.log("local utc ", msec, local2utc.toISOString());
    return asTimeString.latest = local2utc.toISOString().substr(11, 12).replace(/^(00:)+/, ''); //YYYY-MM-DDTHH:MM:SS.MMMZ -> HH:MM:SS.MMM
}

function asDateTimeString(msec, tzlocal)
{
    if (arguments.length < 2) tzlocal = TZlocal;
//    console.log("utc as str ", msec);
    var local2utc = (typeof msec !== 'undefined')? new Date(msec): new Date(); //default to now; optional param
    if (tzlocal) local2utc.setTime(local2utc.getTime() - local2utc.getTimezoneOffset() * 60000); //make it display as-is
//    console.log("local utc ", msec, local2utc.toISOString());
    return asDateTimeString.latest = local2utc.toISOString().replace(/^\d{2}(\d{2})-(\d+-\d+)T(\d+:\d+:\d+\.\d+)Z$/, "$2-$1 $3"); //YYYY-MM-DDTHH:MM:SS.MMMZ -> MM-DD-YY HH:MM:SS.MMM
}
var local2utc = new Date();
//console.log("tz ", local2utc.getTimezoneOffset() * 60000);
//console.log(asDateTimeString(), asDateTimeString(undefined, false));

module.exports.asTimeString = asTimeString;
module.exports.asDateTimeString = asDateTimeString;
module.exports.asString = asTimeString; //default to shorter format


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//current date/time:

var started = Now(); //NOTE: this is when module was first loaded

function elapsed(when)
{
    return (when || Now()) - started;
}

elapsed.asTimeString = asTimeString;
elapsed.asDateTimeString = asDateTimeString;
elapsed.asString = elapsed.asTimeString; //default to shorter format


function Now()
{
    if (global.v8debug) /*Now.*/asTimeString(); //allow latest time to be seen more easily in node inspector
//https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now
    var retval = Date.now? Date.now(): (new Date()).getTime(); //poly fill < ECMA-262 5th edition
    if (TZlocal) retval -= (new Date()).getTimezoneOffset() * 60000; //show local times instead of UTC
    return retval;
}

Now.asTimeString = asTimeString;
Now.asDateTimeString = asDateTimeString;
Now.asString = asTimeString; //default to shorter format


//add getter method to an object:
function addNow(that, name)
{
//    this.getTime = function() //check current time from a consistent place;
    Object.defineProperty(that, name || "now", //read-only
    {
        get: function() { return /*module.exports.*/Now(); },
        enumerable: true,
    });
}


module.exports.Now = Now;
module.exports.addNow = addNow;
module.exports.elapsed = elapsed;


//eof
