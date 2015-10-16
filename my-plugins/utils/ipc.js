//ipc wrappers to hide the plumbing and allow it to be easily changed out in future
//there are so many npm modules, it's hard to know which one to use so this abstraction allows alternates to be used
//all YALP messages fall into 3 cases:
//1. send + forget
//2. send + wait for 1 reply
//3. send + wait for many replies
//all of these fit neatly into the standard client/server send/reply model
//rather than try to implement a multi-cast solution, subscription-style requests are send instead; no broadcast-style messages
//most ipc is streaming-style anyway

/*
//============================================
//scheduler:
send('cmd', 'play'); reply only needed for more robust communication
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
receive('cmd', requested-cmd); reply for robustness
receive('playback', subscription-req); reply repeatedly
//============================================
//hwout:
send('playback', subscription-req); receive replies repeatedly
receive('iostats', subscription-req); reply repeatedly
//============================================
//preview:
send('playback', subscription-req); receive replies repeatedly
//============================================
//monitor:
send('playback', subscription-req); receive replies repeatedly
send('iostats', subscription-req); receive replies repeatedly
send('evt', subscription-req); receive replies repeatedly
//============================================
//trace/log:
send('playback', subscription-req); receive replies repeatedly
send('evt', subscription-req); receive replies repeatedly
*/

'use strict';

//node-ipc supports local and tcp/udp variants, which should make it easy to go to distributed later
//otoh, messenger has a very simple api, so maybe we should start out with that one
//otoh^2, net api is simple enough - just call it directly

var path = require('path');
var fs = require('fs-ext'); //https://github.com/baudehlo/node-fs-ext; NOTE: this one seems to need npm install from git
var CircularJSON = require('circular-json');
var objectStream = require('objectstream').createStream; //https://www.npmjs.com/package/objectstream
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
//TODO: use objectstream
    var buffer = new Buffer(1024);
    var rdlen = fs.readSync(fd, buffer, 0, buffer.length);
    if (rdlen) cache = JSON.parse(buffer.slice(0, rdlen));
//    console.log("got json", cache);
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
//TODO: use objectstream
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

var loop  = 0;
//for net examples see http://www.hacksparrow.com/tcp-socket-programming-in-node-js.html
module.exports = function(name)
{
    var receivers = {}, senders = {}; //, seqnum = 0;
    var retval = //don't know whether caller wants to send or receive or both, so just return a client + server promise wrapper
    {
        rcv: function(channel, cb) //receiver (socket server); channels allow multiple receiver sockets; rcv should only be called once per channel
        {
            if (arguments.length == 1) { cb = channel; channel = '*'; }
            if (typeof cb !== 'function') throw "Call-back must be a function (" + typeof cb + " supplied)";
            var receiver = receivers[name + ':' + channel];
            if (!receiver) receiver = receivers[name + ':' + channel] = {cbs: [], };
            receiver.cbs.push(cb); //allow multiple callbacks per channel, although not recommended (msgs will come in to multiple callbacks)
            if (receiver.server) return;
            receiver.server = net.createServer(function(socket)
            {
//                objectMode(socket);
//                receiver.socket = socket;
                var objsocket = objectStream(socket);
                console.log('CONNECTED: remote ' + socket.remoteAddress + ':' + socket.remotePort + ", local " + socket.localPort);
                objsocket.on('data', function(data)
                {
                    console.log('RCV DATA ' + socket.remoteAddress + ':' + socket.remotePort, data);
//                    objsocket.write('You said "' + data_rcv + '"');
//                     var channel_data = (/*(typeof data_rcv === 'object') &&*/ ('channel' in data_rcv)) data_rcv.channel: '*';
//                     if (!rcv_cbs[rcv_channel]) not waiting for this channel
                    receiver.cbs.forEach(function(cb)
                    {
                        cb(data, function(reply_data)
                        {
if (loop++ < 5)                            console.log("REPLY: ", reply_data);
//                            objsocket.write(JSON.stringify(reply_data)); //TODO: if error due to closed socket, ignore?
//                            wrobj(socket, reply_data);
                            objsocket.write(reply_data);
                        });
                    });
                });
                objsocket.on('close', function(data)
                {
                    console.log('CLOSED: ' + socket.remoteAddress + ':' + socket.remotePort);
                    receiver.server = null; //reopen next time
                });
            }).listen(name2port(name + ':' + channel), "localhost");
        },

        send: function(channel, data, cb) //socket client; can be called multiple times per channel
        {
            switch (arguments.length)
            {
                case 0: channel = '*'; break; //force socket closed
                case 1: data = channel; channel = '*'; break;
                case 2: if (typeof data !== 'function') break; cb = data; data = channel; channel = '*'; break;
                case 3: if (!channel) channel = '*'; break;
            }
            var sender = senders[name + ':' + channel];
            if (!sender) sender = senders[name + ':' + channel] = {}; //{cbs: [], };
            if (!sender.promise) sender.promise = Q.promise(function(resolve, reject) //defer send until socket is open
            {
                var client = new net.Socket();
//broken                var objclient = objectStream(client);
                client.connect(name2port(name + ':' + channel), "localhost", function()
                {
                    console.log('CONNECTED TO: ' + "localhost" + ':' + name2port(name + ':' + channel)); //CircularJSON.stringify(client));
//                    client.itsmebob = true;
//                    client.write("hello bob");
//                    objectMode(client);
                    var objclient = objectStream(client);
                    resolve(objclient);
                });
                var objclient = objectStream(client);
                objclient.on('data', function(data)
                {
//                    console.log('RCV DATA: ', data);
//no                    sender.destroy();
//                    cb = sender.cbs.pop();
                    if (!sender.cb) throw "Unexpected response on " + name;
                    else if (!sender.cb(data)) sender.cb = null; //satisfy pending callback; true => receive more (subscribe), false => reset for another one
//                    else console.log("ASK FOR MORE");
                });
                objclient.on('close', function()
                {
                    console.log('Connection closed');
                    sender.promise = null; //reopen next time
                    if (sender.cb) { sender.cb(-1); sender.cb = null; } //satisfy pending callback and then reset for another one
                });
            });
            sender.promise.then(function(client) //defer send until socket client is ready
            {
//                if (!data) { console.log("req DESTROY"); client.destroy(); return; } //eof
                if (cb) //response wanted
                    if (sender.cb) throw name + " already has a pending response";
                    else sender.cb = cb;
//                console.log("SEND ", data);
//                if (!client.itsmebob) throw "write to wrong obj";
//                client.write(JSON.stringify(data));
//                wrobj(client, data);
                client.write(data);
            });
        },
    };
    return retval;
}


//NOTE: docs say tcp/ip is a stream, so you have to use delimiters and a read loop in order to ensure objects don't get broken into chunks
//http://stackoverflow.com/questions/6038995/extract-integer-from-a-tcp-stream
/*
function objectMode(stream)
{
    var oldread = stream.read;
    stream.xread = function()
    {
        var objlen = stream.readUInt16BE(0);
        var buf = new Buffer(objlen);
//        buf.fill();
        stream.copy(buf, 0, 0, objlen);
        return JSON.parse(buf);
        return oldread();
    }
    var oldwrite = stream.write;
    stream.write = function(data)
    {
        data = JSON.stringify(data);
        if (data.length > 65535) throw "Object size too big for stream: " + data.length;
        var retval = 0;
        retval += stream.writeUInt16BE(data.length);
        retval += stream.oldwrite(data);
        return retval; //total length written
    }
}
function wrobj(stream, data)
{
    var buf = JSON.stringify(data);
    stream.writeUInt16BE(buf.length);
    stream.write(buf);
}

function rdobj(stream)
{
    var objlen = stream.readUInt16BE(0);
    var buf = new Buffer(objlen);
//    buf.fill();
    stream.copy(buf, 0, 0, objlen);
    return JSON.parse(buf);
}
*/

//eof
