var que = require('my-plugins/utils/ipc')("test");

setTimeout(function()
{
    que.send('reset', 10, function(response)
    {
        console.log("i got back ", response);
        return false; //no more
    });
}, 2000);

var loop = 0;
que.send('subscribe', "hello!", function(data)
{
    while (loop++ < 5) console.log("i got ", data);
    return true; //i want more
});

//eof
