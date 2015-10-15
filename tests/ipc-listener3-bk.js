var listener = require('my-plugins/utils/ipc').Listener("proc1");

var seen = 0, prev = 0;
listener.on('msg', function(req, data)
{
//	message.reply({'you':'got it'})
	seen = data.seqnum;
//	console.log("rcv: data ", message, data);
});

listener.on('reset', function(req, data)
{
	seen = pev = 0;
});


setInterval(function()
{
	if (seen != prev) console.log("last seen: %d (+%d)", seen, seen - prev);
	prev = seen;
}, 1000);
