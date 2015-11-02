#!/usr/local/bin/node
//read/write yalp stream from/to disk (cache)

'use strict'; //helps catch errors

vix2player =
rdtime = 0;
var data = vix2.read(time: rdtime);
write({time: rdtime, data: data}); //pre-fetch first frame
on('want_data', function()
{
    rdtime += 50;
    data = vix2.read(time: rdtime);
    write({time: rdtime, data: data});
});
on('end', function()
{
    close();
});


var timer = setTimeout(function()
{
    var data = file.read();
    write(data);
}, 50);

var chmap =
[
    [0..10] => model1[20..30];
    [0..2] => model2[0..2];
];
var chdata = vix2.frame(0);
mode1

//vix2 stream:
var data = vix2.read(time: 0*50);
write(data);
data = vix2.read(time: 1*50);
setTimeout(function()
    write(data);
}, 1*50 - now());

//yalp stream playback:
//equiv var fs = require('fs');
//equiv var readableStream = fs.createReadStream('file.txt');
var FILENAME = './tmp/stream1.yalp';
var yalpstr = /*new*/ require('my-plugins/streamers/YalpStream')(FILENAME);

//yalpstr.setEncoding('utf8'); //default is buffer so this is not needed
yalpstr.on('data', function(frame) //data (next frame) is available; read-ahead to eliminate latency
{
//    data+=chunk;
    setTimeout(function()
    {
        ports[frame.port].write(frame.data);
    }, frame.time - now());
});
yalpstr.on('end', function() //eof
{
//    console.log(data);
});
yalpstr.on('readable', function() //data is available for next frame
{
    while ((chunk = yalpstr.read()) != null) data += chunk;
});

//for examples see http://www.sitepoint.com/basics-node-js-streams/

var dummy_stream = YALP.stream(filename);


//eof
