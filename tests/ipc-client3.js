var remote = require('my-plugins/utils/ipc').Sender("proc1");

remote.send('reset', {seqnum: 0});

var seqnum = 0, prev = 0;
function send()
{
	remote.send('msg', {seqnum: seqnum++});
//	if (seqnum % 10) //~1K/sec
//	if (seqnum % 100) //~7.5K/sec
	if (seqnum % 1000) //~30K/sec
		process.nextTick(function() { send(); });
	else
		setTimeout(function() { send(); }, 10);
}

send();
