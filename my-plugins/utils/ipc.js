//ipc wrappers to allow the ipc plumbing to be easily changed out in future
//there are so many npm modules, it's hard to know which one to use so this abstraction allows alternates to be used
//all YALP messages are broadcast-style to allow multiple readers
//most are streaming-style apps, so they send or receive, not both

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

var path = require('path');
var fs = require('fs-ext'); //https://github.com/baudehlo/node-fs-ext; NOTE: this one seems to need npm install from git
//var messenger = require('messenger'); //https://github.com/weixiyen/messenger.js
//var Wormhole = require('wormhole'); //https://github.com/aikar/wormhole
//var SimpleMessages = require('simplemessages'); //https://www.npmjs.com/package/simplemessages
var Q = require('q'); //https://github.com/kriskowal/q
var net = require('net');

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
    var cache = {};
    if (name in cache) return cache[name];
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
    if (rdlen) cache = JSON.parse(buffer.slice(0, rdlen));
    console.log("got json", cache);
    if (!(name in cache)) //allocate a new port#
    {
        var used = [];
        for (var i in cache) used.push(cache[i]);
        used.sort();
        var next_avail = first_port;
        used.every(function(port)
        {
            if (port != next_avail) return false; //this port# is available
            ++next_avail;
            return true;
        });
        cache[name] = next_avail;
        var newbuf = JSON.stringify(cache);
        console.log("upd json: ", newbuf);
        fs.writeSync(fd, newbuf, 0, newbuf.length, 0);
    }
    fs.flockSync(fd, 'un');
    fs.close(fd);
//        return console.log("Couldn't unlock file", counter);
    return cache[name];
}


//function Release(name)
//{
//}

/*
module.exports.Listener = function(name)
{
    var port = name2port(name);
    var server = messenger.createListener(port);
//    var svon = server.on;
//    server.on = function(msgid, cb) {};
    console.log("created listener on port %d", port);
    return server;
}
*/

//for net examples see http://www.hacksparrow.com/tcp-socket-programming-in-node-js.html
module.exports = function(name)
{
    var receivers = {}, senders = {}; //, seqnum = 0;
    var retval = //don't know whether caller wants to send or receive or both, so just return a client + server promise wrapper
    {
        on: function(channel, cb) //receiver (socket server); normally only called once per channel
        {
            if (arguments.length == 1) { cb = channel; channel = '*'; }
            if (typeof cb !== 'function') throw "Call-back must be a function (" + typeof cb + " supplied)";
            name += ':' + channel; //use a separate socket for each channel
            var receiver = receivers[name];
            if (!receiver) receiver = receivers[name] = {cbs: [], };
            receiver.cbs.push(cb); //allow multiple callbacks per channel, although not recommended (msgs will come in to multiple callbacks)
            if (receiver.server) return;
            receiver.server = net.createServer(function(socket)
            {
//                receiver.socket = socket;
                console.log('CONNECTED: remote ' + socket.remoteAddress + ':' + socket.remotePort + ", local " + socket.localPort);
                socket.on('data', function(data)
                {
//                    console.log('DATA ' + socket.remoteAddress + ': ' + data_rcv);
//                    socket.write('You said "' + data_rcv + '"');
//                     var channel_data = (/*(typeof data_rcv === 'object') &&*/ ('channel' in data_rcv)) data_rcv.channel: '*';
//                     if (!rcv_cbs[rcv_channel]) not waiting for this channel
                    receiver.cbs.forEach(function(cb)
                    {
                        cb(data, function(reply_data) { receiver.server.write(reply_data); }); //TODO: if error due to closed socket, ignore?
                    });
                });
                socket.on('close', function(data)
                {
                    console.log('CLOSED: ' + socket.remoteAddress + ':' + socket.remotePort);
                    receiver.server = null; //reopen next time
                });
            }.listen(name2port(name), "localhost");
        },

        send: function(channel, data, cb) //socket client; can be called multiple times per channel
        {
            switch (arguments.length)
            {
                case 0: channel = '*'; break; //force socket closed
                case 1: data = channel; channel = '*'; break;
                case 2: if (typeof data === 'function') { cb = data; data = channel; channel = '*'; }
            }
            name += ':' + channel; //use a separate socket for each channel
            var sender = senders[name];
            if (!sender) sender = senders[name] = {}; //{cbs: [], };
            if (!sender.promise) sender.promise = Q.promise(resolve, reject)
            {
                var client = new net.Socket();
                client.connect(name2port(name), "localhost", function()
                {
                    console.log('CONNECTED TO: ' + "localhost" + ':' + port);
                    resolve(client);
                });
                client.on('data', function(data)
                {
                    console.log('reply DATA: ' + data);
//no                    sender.destroy();
//                    cb = sender.cbs.pop();
                    if (!sender.cb) throw "Unexpected response on " + name;
                    else { sender.cb(data); sender.cb = null; } //satisfy pending callback and then reset for another one
                });
                client.on('close', function()
                {
                    console.log('Connection closed');
                    sender.promise = null; //reopen next time
                    if (sender.cb) { sender.cb(-1); sender.cb = null; } //satisfy pending callback and then reset for another one
                });
            }
            sender.promise.then(function(client) //defer send until socket client is ready
            {
                if (!data) { client.destroy(); return; } //eof
                if (cb) //response wanted
                    if (sender.cb) throw name + " already has a pending response";
                    else sender.cb = cb;
                client.write(data);
            });
        },
    };
    return retval;
}


//eof
