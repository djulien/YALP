var que = require('my-plugins/utils/ipc').Sender(8901);

que.send('reset', {seqnum: 0});

var seqnum = 0, prev = 0;
function send()
{
	que.send('msg', {seqnum: seqnum++});
//	if (seqnum % 10) //~1K/sec
//	if (seqnum % 100) //~7.5K/sec
	if (seqnum % 1000) //~30K/sec
		process.nextTick(function() { send(); });
	else
		setTimeout(function() { send(); }, 10);
}

send();
