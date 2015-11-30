//return file timestamp as a string or number

'use strict';

const fs = require('fs');
const clock = require('my-plugins/utils/clock');

module.exports = filetime;


function filetime(filename)
{
    return clock.asDateTimeString(fs.statSync(filename, false).mtime); //disable overidden local time offset
}

filetime.asString = function(filename)
{
    return clock.asDateTimeString(filetime(filename));
}

//eof
