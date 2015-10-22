//ipc wrappers to allow the ipc plumbing to be easily changed out in future
//there are so many npm modules, it's hard to know which one to use so this abstraction allows alternates to be used
//Send(channel, data)
//all messages are broadcast-style to allow multiple readers
//Receive(channel, data)
//these are all streaming-style apps, so each app only sends or receives, not both

'use strict';

//node-ipc supports local and tcp/udp variants, which should make it easy to go to distributed later
//otoh, messenger has a very simple api, so let's start out with that one

var ipc = require('node-ipc'); //https://github.com/RIAEvangelist/node-ipc

//ipc.config.id = 'yalp';
//ipc.config.networkPort = 2015;
ipc.config.rawBuffer = true;
ipc.config.silent = true; //no logging
ipc.config.maxConnections = 5;
ipc.config.retry = 1000; //client reconnect retry time, msec


var names = {};

function Receive(channel, data, cb)
{
    ipc.connectTo('yalp', function() //bypasses network card
        ipc.of.yalp.on('connect', function()
        {
/*
                ipc.log('## connected to world ##'.rainbow, ipc.config.delay);
                ipc.of.world.emit(
                    'app.message',
                    {
                        id      : ipc.config.id,
                        message : 'hello'
                    }
                )
*/
            console.log("client connected to %s".green);
            }
        );
        ipc.of[ipc.config.id].on(
            'disconnect',
            function(){
//                ipc.log('disconnected from world'.notice);
		console.log("client disconnected".red);
            }
        );
        ipc.of[ipc.config.id].on(
            'app.msg',
            function(data){
  //              ipc.log('got a message from world : '.debug, data);
		seen = data.id;
//		if (!timer) timer = setTimeout(function()
//		{
//			timer = null;
//	if (!(seen % 1000))
//			console.log("rcv msg %d: ", seen, data);
//		}, 500);
            }
        );

  //      console.log(ipc.of[ipc.config.id].destroy);
    }
);

}

function Send(channel, data)
{
    if (!names[channel])
    {
        names[channel] = true;
        ipc.serve('/tmp/' + channel + '.yalp', function()
        {
        });
        ipc.server.start();

    }
    ipc.server.broadcast(channel, data);
}


ipc.serve('/tmp/app.yalp',
    function(){
/*
        ipc.server.on(
            'app.message',
            function(data,socket){
debugger;
                //ipc.log('got a message from'.debug, (data.id).variable, (data.message).data);
                ipc.server.emit(
                    socket,
                    'app.message',
                    {
                        id      : ipc.config.id,
                        message : data.message+' world!'
                    }
                );
            }
        );
*/
//	setInterval(function()
//	{
//	}, 1); //100);
	setInterval(function()
	{
		console.log("sent %d (+%d)", seqnum, seqnum - prev);
		prev = seqnum;
	}, 1000);
	send(ipc);
    }
);


//ipc.server.define.listen['app.message']='This event type listens for message strings as value of data key.';





module.exports.Send = function(id, buf)
{
ipc.server.broadcast('app.msg', {id: seqnum++, msg: "data"});
}



/*
//============================================
//scheduler:
send('cmd', 'play');
send('cmd', 'pause');
//============================================
//motion:
send('cmd', 'play');
//============================================
//ui:
send('cmd', 'play');
send('cmd', 'pause');
send('cmd', 'volume #');
//============================================
//playlist:
for (;;) receive('cmd', data);
for (;;) broadcast('playback', data);
//============================================
//hwout:
for (;;) receive('playback', data);
for (;;) broadcast('iostats', data);
//============================================
//preview:
for (;;) receive('playback', data);
//============================================
//monitor:
for (;;) receive('playback', data);
for (;;) receive('iostats', data);
//============================================
//trace:
for (;;) receive('playback', data);
for (;;) receive('evt', data);
*/