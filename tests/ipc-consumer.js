var que = require('my-plugins/utils/ipc')("test");

//if (false)
setTimeout(function()
{
    que.send('reset', 3, function(response)
    {
        console.log("i got back ", response);
        return false; //no more
    });
}, 5000);

//var loop = 0;
var latest = 0, prev = 0;
que.send('subscribe', "hello!", function(data)
{
//    if (loop++ < 10) console.log("i got ", data);
    latest = (data && data.seqnum) || -1;
    return true; //i want more
});

setInterval(function()
{
    console.log("latest: %d (+%d)", latest, latest - prev);
    prev = latest;
}, 1000);

//eof
