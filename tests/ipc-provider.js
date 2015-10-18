var que = require('my-plugins/utils/ipc')("test");

var seqnum = 0, prev = 0;

que.rcv('reset', function(data, reply)
{
    seqnum = data;
    reply("okay, i reset to " + seqnum);
});

que.rcv('subscribe', function(data_ignore, reply, states)
{
//debugger;
    console.log("subscribe req:", data_ignore);
    send();

    function send() //1-shot
    {
//        if (seqnum < 5) console.log("reply ", {seqnum: seqnum}, states);
        if (reply({seqnum: seqnum++}) <= 0) { console.log("stopped sending"); return; } //stop sending
//        if (seqnum % 10) //~1K/sec
//        if (seqnum % 100) //~7.5K/sec
        if (seqnum % 1000) //~33K/sec
            process.nextTick(function() { send(); });
        else
            setTimeout(function() { send(); }, 10);
    }
});

setInterval(function()
{
    console.log("sent %d (+%d)", seqnum, seqnum - prev);
    prev = seqnum;
}, 1000);

//eof
