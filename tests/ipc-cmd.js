var que = require('my-plugins/utils/ipc')("cmd");

//console.log (process.argv);
function main()
{
if (process.argv.length > 2)
    que.send(process.argv[process.argv.length - 1], function(data_reply)
    {
        console.log("sent cmd '%s', got response ", process.argv[process.argv.length - 1], JSON.stringify(data_reply));
    });
else
    console.log("usage: node <me> <cmd>");
console.log("hit Ctl+C to exit");
}

//setTimeout(function() { main(); }, 10); //kludge: need time for socket to open
main();

//eof

