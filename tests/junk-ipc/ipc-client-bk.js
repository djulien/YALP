var ipc=require('node-ipc');

/***************************************\
 *
 * You should start both hello and world
 * then you will see them communicating.
 *
 * *************************************/

ipc.config.id   = 'yalp';
ipc.config.retry = 1000; //client reconnect retry time, msec
ipc.config.networkPort = 2015;
ipc.config.silent = true;

//var timer = null;
var seen = 0, prev = 0;

ipc.connectTo( //bypasses network card
    ipc.config.id, //'world',
    function(){
        ipc.of[ipc.config.id].on(
            'connect',
            function(){
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
		console.log("client connected".green);
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

setInterval(function()
{
	console.log("last seen: %d (+%d)", seen, seen - prev);
	prev = seen;
}, 1000);
