//ipc wrappers to allow the ipc plumbing to be easily changed out in future
//there are so many npm modules, it's hard to know which one to use so this abstraction allows alternates to be used

//all YALP messages are broadcast-style to allow multiple readers
//they are all streaming-style apps, so each app only sends or receives, not both

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

'use strict';

//node-ipc supports local and tcp/udp variants, which should make it easy to go to distributed later
//otoh, messenger has a very simple api, so let's start out with that one

var fs = require('fs-ext'); //https://github.com/baudehlo/node-fs-ext; NOTE: this one seems to need npm install from git
var path = require('path');
var messenger = require('messenger'); //https://github.com/weixiyen/messenger.js

/*this was going to be server-based name lookup
var registry = {};
var next_port = 8000;
var name_server = messenger.createListener(next_port++);
name_server.on('add', function (req, data)
{
    if (!(name in registry)) registry[name] = next_port++; //TODO: reclaim
    req.reply({port: registry[name], });
});
server.on('give it to me', function(message, data){
  message.reply({'you':'got it'})
});
*/

const first_port = 8900; //try to pick something out of the way

function name2port(name) //, cb)
{
//NO use a peer server to manage a "registry" of names vs. ports:
//all callers must be async, but the ipc api is async anyway for request() and receive(); just make send() that way as well
//    client.request('give it to me', {hello:'world'}, function(data){
//    console.log(data);
//YES use a temp file to allow responses to be synchronous; however, then multi-process file access must be managed (as well as file perms)
    var regfile = path.join(__dirname, "ipc-cache.json");
    fs.writeFileSync(regfile, JSON.stringify({}), {flags: 'wx', }); //write file if not there, so flock has something to work on; http://stackoverflow.com/questions/12899061/creating-a-file-only-if-it-doesnt-exist-in-node-js
    var fd = fs.openSync(regfile, 'r+'); //rd/wr
//    var regports = JSON.parse(fs.readFileSync(regfile)) || {};
//  console.log("Trying to aquire lock for the %s time", counter);
    fs.flockSync(fd, 'exnb');
//    console.log('Aquired lock', counter);
    var buffer = new Buffer(1024);
    var rdlen = fs.readSync(fd, buffer, 0, buffer.length);
    var regnames = JSON.parse(buffer.slice(0, rdlen));
    if (!(name in regnames))
    {
        var used = [];
        for (var i in regnames) used.push(regnames[i]);
        used.sort();
        var next_avail = first_port;
        used.every(function(port)
        {
            if (port != next_avail) return false;
            ++next_avail;
            return true;
        });
        regnames[name] = next_avail;
        var newbuf = JSON.stringify(regname);
        fs.writeSync(fd, newbuf, 0, newbuf.length, 0);
    }
    fs.flockSync(fd, 'un');
    fs.close(fd);
//        return console.log("Couldn't unlock file", counter);
    return regnames[name];
}


function Release(name)
{
}

function Listener(name)
{
    var server = messenger.createListener(name2port(name));
//    var svon = server.on;
//    server.on = function(msgid, cb) {};
    return server;
}


function Sender(name)
{
    var client = messenger.createSpeaker(name2port(name));
//    var svsend = client.send;
//    client.send = function(msgid, data, cb) {}; //add a call-back function because it might be async due to name lookup
    return client;
}


//eof
