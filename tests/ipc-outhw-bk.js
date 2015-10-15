var playback = require('my-plugins/utils/ipc').Listener("playback");
//var iomon = require('my-plugins/utils/ipc').Sender("iostats");

var seen = 0, prev = 0;
playback.on('msg', function(req, data)
{
//	message.reply({'you':'got it'})
	seen = data.frame;
//	console.log("rcv: data ", message, data);
});

//listener.on('reset', function(req, data)
//{
//	seen = pev = 0;
//});


setInterval(function()
{
	if (seen != prev) console.log("last seen: %d (+%d)", seen, seen - prev);
	prev = seen;
}, 1000);
