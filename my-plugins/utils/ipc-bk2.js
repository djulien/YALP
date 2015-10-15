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
server.on('regcli', function(message, data){ message.reply({port: new-port#}) });
*/

const first_port = 8900; //try to pick something out of the way
//var cwd = process.cwd(); //__dirname; //save it in case it changes later
//const registry = path.join(process.cwd(), "tmp", "ipc-cache.json");
const registry = path.join(__dirname, "ipc-cache.json");
//fs.writeFileSync(registry, JSON.stringify({}), {flags: 'wx', }); //write file if not there, so flock has something to work on; http://stackoverflow.com/questions/12899061/creating-a-file-only-if-it-doesnt-exist-in-node-js
try { fs.closeSync(fs.openSync(registry, 'wx')); } //write file if not there, so flock has something to work on; http://stackoverflow.com/questions/12899061/creating-a-file-only-if-it-doesnt-exist-in-node-js
catch (exc) {};

function name2port(name) //, cb)
{
//NO use a peer server to manage a "registry" of names vs. ports:
//all callers must be async, but the ipc api is async anyway for request() and receive(); just make send() that way as well
//    client.request('regcli', name, function(port_assigned){ console.log(data); });
//YES use a temp file to allow responses to be synchronous; however, then multi-process file access must be managed (as well as file perms)
    var fd = fs.openSync(registry, 'r+'); //rd/wr
//    var regports = JSON.parse(fs.readFileSync(regfile)) || {};
//  console.log("Trying to aquire lock for the %s time", counter);
    fs.flockSync(fd, 'exnb');
//    console.log('Aquired lock', counter);
    var buffer = new Buffer(1024);
    var rdlen = fs.readSync(fd, buffer, 0, buffer.length);
    var regnames = JSON.parse(buffer.slice(0, rdlen));
    console.log("got json", regnames);
    if (!(name in regnames)) //allocate a new port#
    {
        var used = [];
        for (var i in regnames) used.push(regnames[i]);
        used.sort();
        var next_avail = first_port;
        used.every(function(port)
        {
            if (port != next_avail) return false; //this port# is available
            ++next_avail;
            return true;
        });
        regnames[name] = next_avail;
        var newbuf = JSON.stringify(regnames);
        console.log("upd json: ", newbuf);
        fs.writeSync(fd, newbuf, 0, newbuf.length, 0);
    }
    fs.flockSync(fd, 'un');
    fs.close(fd);
//        return console.log("Couldn't unlock file", counter);
    return regnames[name];
}


//function Release(name)
//{
//}

module.exports.Listener = function(name)
{
    var port = name2port(name);
    var server = messenger.createListener(port);
//    var svon = server.on;
//    server.on = function(msgid, cb) {};
    console.log("created listener on port %d", port);
    return server;
}


module.exports.Sender = function(name)
{
    var port = name2port(name);
    var client = messenger.createSpeaker(port);
//    var svsend = client.send;
//    client.send = function(msgid, data, cb) {}; //add a call-back function because it might be async due to name lookup
    console.log("created sender for port %d", port);
    return client;
}


//eof
