var playback = require('my-plugins/utils/ipc')("playlist");
var iostats = require('my-plugins/utils/ipc')("iostats");

var seen = 0, prev = 0;
playback.rcv(function(data)
{
//  message.reply({'you':'got it'})
    seen = data.frame;
//  console.log("rcv: data ", message, data);
});

//listener.rcv('reset', function(req, data)
//{
//  seen = pev = 0;
//});


setInterval(function()
{
    iostats.send({frame: seen, });
    if (seen != prev) console.log("last seen: %d (+%d)", seen, seen - prev);
    prev = seen;
}, 1000);

//eof
