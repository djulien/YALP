var messenger = require('messenger');

//client = messenger.createSpeaker(8000);
server = messenger.createListener(8000);

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


var seen = 0, prev = 0;
server.on('msg', function(message, data)
{
//	message.reply({'you':'got it'})
	seen = data.seqnum;
	console.log("rcv: data ", message, data);
});

server.on('reset', function(message, data)
{
	seen = pev = 0;
});

setInterval(function()
{
	console.log("last seen: %d (+%d)", seen, seen - prev);
	prev = seen;
}, 1000);
