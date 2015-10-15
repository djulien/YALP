var messenger = require('messenger');

client = messenger.createSpeaker(8000);
//server = messenger.createListener(8000);

/*
server.on('give it to me', function(message, data){
  message.reply({'you':'got it'})
});
*/

/*
setInterval(function(){
  client.request('give it to me', {hello:'world'}, function(data){
    console.log(data);
  });
}, 1000);
*/

client.send('reset', {seqnum: 0});

var seqnum = 0, prev = 0;
function send()
{
	client.send('msg', {seqnum: seqnum++});
//	if (seqnum % 10) //~1K/sec
//	if (seqnum % 100) //~7.5K/sec
	if (seqnum % 1000) //~30K/sec
		process.nextTick(function() { send(); });
	else
		setTimeout(function() { send(); }, 10);
}

send();
