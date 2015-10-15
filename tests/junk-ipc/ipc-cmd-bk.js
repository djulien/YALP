var playback = require('my-plugins/utils/ipc').Sender("cmd");

//console.log (process.argv);
function main()
{
if (process.argv.length > 2)
	playback.request('cmd', process.argv[process.argv.length - 1], function(data)
	{
		console.log("sent cmd '%s', got response ", process.argv[process.argv.length - 1], JSON.stringify(data));
	});
else
	console.log("usage: node <me> <cmd>");
console.log("hit Ctl+C to exit");
}

setTimeout(function() { main(); }, 10); //kludge: need time for socket to open

//eof
