var que = require('my-plugins/utils/ipc')("cmd");

var onoff = true;

setInterval(function()
{
	onoff = !onoff;
	que.send(onoff? "play": "pause", function(data_reply)
	{
		console.log("sent cmd '%s', got response ", onoff? "play": "pause", JSON.stringify(data_reply));
	});
}, 1500); //simulate periodic activity

//eof

