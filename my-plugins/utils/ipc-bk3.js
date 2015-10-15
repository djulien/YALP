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

var path = require('path');
var fs = require('fs-ext'); //https://github.com/baudehlo/node-fs-ext; NOTE: this one seems to need npm install from git
//var messenger = require('messenger'); //https://github.com/weixiyen/messenger.js
var Wormhole = require('wormhole'); //https://github.com/aikar/wormhole
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
    if (!rdlen) rdlen = buffer.write("{}", 0, 2);
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


module.exports = function(name)
{
    var port = name2port(name);
    console.log("que '%s' is on port %d", name, port);
    var sender = null, receiver = null, reply_cbs = {}; //, client_cb = {}, server_cb = {};
    var retval = //don't know whether caller wants to send or receive or both, so just return a wrapper of deferred client/server
    {
        on: function(channel, rcv_cb)
        {
            if (!receiver)
                receiver = Q.Promise(function(resolve, reject, notify) //can't bind yet (channel and direction not yet unspecified) so just store a promise
                {
                    net.createServer(function(client)
                    {
                        resolve(client);
                    }).listen(port);
                });
            receiver.then(function(client)
            {
//                if (!server_cb[channel]) server_cb[channel] =
                Wormhole(client, channel, function(msg_data)
                {
                    rcv_cb(msg_data, function(reply_data)
                    {
                        client.write(channel, reply_data);
                    });
                    return true; //in case other call-backs are active for this channel
                });
            });
        },
        send: function(channel, data, reply_cb)
        {
            if (!sender)
                sender = Q.Promise(function(resolve, reject, notify) //can't bind yet (channel and direction not yet unspecified) so just store a promise
                {
                    var client = net.createConnection(port, function()
                    {
                        resolve(client);
                    });
                });
            sender.then(function(client)
            {
                if (!reply_cbs[channel]) reply_cbs[channel] = Wormhole(client, channel, function(err, reply_data)
                {
                    if ('id' in reply_data) pending[reply_data.id](err, reply_data);
                    else throw "Reply data has no 'id'";
//??                    return true; //in case other call-backs are active for this channel
                })
                if (reply_cb)
                    if ('id' in data) pending[data.id] = reply_cb;
                    else throw "Data needs 'id' if you want a reply";
                client.write(channel, data);
            });
        },
    };
    return retval;
}


//eof
