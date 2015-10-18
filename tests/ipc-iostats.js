var playback = require('my-plugins/utils/ipc')("playlist");
var iostats = require('my-plugins/utils/ipc')("iostats");

var seen = [0, 0], prev = [0, 0];
playback.rcv(function(data_req)
{
//  message.reply({'you':'got it'})
    seen[0] = data.frame;
//  console.log("rcv: data ", message, data);
});

iostats.rcv(function(data_req)
{
//  message.reply({'you':'got it'})
    seen[1] = data.frame;
//  console.log("rcv: data ", message, data);
});

//listener.rcv('reset', function(req, data)
//{
//  seen = pev = 0;
//});


setInterval(function()
{
    if ((seen[0] != prev[0]) || (seen[1] != prev[1])) console.log("last seen: playback %d (+%d), iostats %d (+%d)", seen[0], seen[0] - prev[0], seen[1], seen[1] - prev[1]);
    prev[0] = seen[0];
    prev[1] = seen[1];
}, 1000);

//eof
