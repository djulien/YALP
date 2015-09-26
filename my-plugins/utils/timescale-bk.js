var hfmt = require('human-format');

//example based on https://github.com/julien-f/human-format
var timeScale = new hfmt.Scale(
{
    msec: 0,
    sec: 1000,
    min: 60 * sec,
    hr: 60 * min,
    day: 24 * hr,
    mon: (365.24 / 12) * day, //NOTE: approx
});

module.exports = function (msec)
{
    return hfmt(msec, {scale: timeScale });
}

//eof
