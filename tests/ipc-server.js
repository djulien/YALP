var ipc=require('node-ipc');

/***************************************\
 * 
 * You should start both hello and world
 * then you will see them communicating.
 * 
 * *************************************/

ipc.config.id   = 'yalp';
ipc.config.retry= 1500; //client reconnect retry time, msec
ipc.config.networkPort = 2015;
ipc.config.silent = true;

var seqnum = 0, prev = 0;

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

function send(ipc)
{
//	if (!(seqnum % 10000)) console.log("sent %d", seqnum);
	ipc.server.broadcast('app.msg', {id: seqnum++, msg: "data"});
//	if (seqnum % 10) //gives ~4K/sec
	if (seqnum % 100) //gives ~11K/sec
		process.nextTick(function() { send(ipc); }); //gives ~20K/sec
	else
		setTimeout(function() { send(ipc); }, 0); //gives ~600/sec
}

//ipc.server.define.listen['app.message']='This event type listens for message strings as value of data key.';

ipc.server.start();
