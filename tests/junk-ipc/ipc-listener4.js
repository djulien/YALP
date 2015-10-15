var que = require('my-plugins/utils/ipc')("playlist");

var seen = 0, prev = 0;
que.on('msg', function(data, reply)
{
//	message.reply({'you':'got it'})
	seen = data.seqnum;
//	console.log("rcv: data ", message, data);
});

que.on('reset', function(data, reply)
{
	seen = pev = 0;
});


setInterval(function()
{
	if (seen != prev) console.log("last seen: %d (+%d)", seen, seen - prev);
	prev = seen;
}, 1000);
