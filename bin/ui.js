#!/usr/bin/env node
//#!/usr/local/bin/node --expose-gc

'use strict';

var que = require('my-plugins/utils/ipc')('playlist');

console.log(process.argv);

que.send('frames', function(frame_data, reply)
{
    console.log("frame_data: ", frame_data);
});

if (process.argv.length > 2)
    que.send('cmd', process.argv[2], function(data, reply)
    {
        console.log("reply: ", data);
    });


//eof