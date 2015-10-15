var playback = require('my-plugins/utils/ipc').Sender("playback");
var cmd = require('my-plugins/utils/ipc').Listener("cmd");

playback.send('reset', {frame: 0});

var active = false;

cmd.on('cmd', function(req, data)
{
	req.reply({status: "done", });
	active = (data.cmd == "play");
	console.log("rcv: cmd ", data);
});


var seqnum = 0, prev = 0;
function send()
{
	if (active) playback.send('msg', {frame: seqnum++}, function() {});
//	if (seqnum % 10) //~1K/sec
//	if (seqnum % 100) //~7.5K/sec
	if (seqnum % 1000) //~30K/sec
//	if (false)
		process.nextTick(function() { send(); });
	else
		setTimeout(function() { send(); }, 10);
}

var reported = 0;
setInterval(function()
{
	/*if (seqnum != reported)*/ console.log("last sent: %d (+%d)", seqnum, seqnum - reported);
	reported = seqnum;
}, 1000);

send(); //start broadcasting

//eof
