#!/usr/bin/env node
//#!/usr/local/bin/node --expose-gc

'use strict';

require('longjohn');
var ipc = require('my-plugins/utils/ipc');
var que = ipc.open('playlist');

//console.log(process.argv);
if (process.argv.length > 2) //node <me> extras
{
    var data = Array.prototype.slice.call(process.argv, 2);
    console.log("send cmd ", data);
    if (data[0] == 'purge') { ipc.purge(); process.exit(0); } //don't do anything else
//    if (data[0] == 'listen')
    que.send('cmd', data, function(data, reply)
    {
        console.log("reply: ", data);
        return false; //i don't want more
    });
}
else console.log("no cmd?");

//if (0)
que.send('frames', "it's me bob", function(frame_data, reply)
{
    console.log("frame_data: ", frame_data);
    return true; //i want more
});

//console.log("handles", process._getActiveHandles());

//eof
