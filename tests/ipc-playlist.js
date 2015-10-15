var playback = require('my-plugins/utils/ipc')("playlist");
var cmd = require('my-plugins/utils/ipc')("cmd");

playback.send({state: 'reset', frame: 0, });

var active = false;

cmd.on(function(data_req, reply)
{
	reply({status: "done-by-playlist", });
	active = (data_req == "play");
	console.log("rcv: cmd ", data_req);
});


var seqnum = 0; //, prev = 0;
function send()
{
	if (active) playback.send({frame: seqnum++}); //, function() {});
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
	if (seqnum != reported) console.log("last sent: %d (+%d)", seqnum, seqnum - reported);
	reported = seqnum;
}, 1000);

send(); //start broadcasting

//eof
