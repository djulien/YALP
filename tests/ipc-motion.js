var que = require('my-plugins/utils/ipc')("cmd");


setInterval(function()
{
	que.send("zone", function(data_reply)
	{
		console.log("sent cmd '%s', got response ", "zone", JSON.stringify(data_reply));
	});
}, 3000); //simulate periodic activity

//eof

