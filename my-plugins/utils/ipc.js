//IPC: TODO: use webworkers + transferable objects?

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
/*var sprintf =*/ require('sprintf.js'); //.sprintf;
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

module.exports.purge = function()
{
    return fs.unlinkSync(registry);
}


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

//CAUTION: these event handlers are set once, not per socket (else mem leak)
/*
var on_exit = [];
function OnExit(desc, close)
{
    var retval = on_exit.length;
    on_exit.push({desc: desc, func: function() { close(); }});
    return retval;
}
process.once('exit', function(code) //sometimes socket doesn't close, so try to force it here
{
    console.log("destroy %d connections on exit", on_exit.length); // %s on proc exit(%d)", channel, code);
//    if (client) client.destroy();
//    var counts = {};
    on_exit.forEach(function(close, inx)
    {
        if (!close) return; //already closed
        console.log("destroy[%d/%d]: ", inx, on_exit.length, close.desc); // %s on proc exit(%d)", channel, code);
//        counts[close.desc] = (counts[close.desc] || 0) + 1;
        if (close.func === 'function') close.func();
        on_exit[inx] = null;
    });
});
process.once('SIGINT', function()
{
    console.log('Got SIGINT');
//process.stdin.resume();//so the program will not close instantly
    process.exit(2);
//    console.log("close subscribed socket");
//    receiver.server = null; //socket.destroy();
});
process.once('beforeExit', function() //kludge: make sure socket is closed on exit
{
    console.log("before exit");
//    receiver.server = null; //socket.destroy();
});
*/

function retdebug(retval, msg)
{
    if (arguments.length > 2) msg = sprintf.apply(/*null,*/ arguments);
    console.log(msg);
    return retval;
}

//var loop  = 0;
//for net examples see http://www.hacksparrow.com/tcp-socket-programming-in-node-js.html
module.exports.open = function(name)
{
//    var loop  = 0;
    var senders = {}, receivers = {}; //, seqnum = 0;
    var num_retries = 0; //only used for debug
//var state = 0;
    var retval = //don't know whether caller wants to send or receive or both, so just return a client + server promise wrapper
    {
        send: function(channel, data, cb) //socket client; can be called multiple times per channel
        {
//            var retry_args = arguments;
//            console.log("entry: args", arguments);
            switch (arguments.length)
            {
                case 0: channel = '*'; break; //force socket closed
                case 1: data = channel; channel = '*'; break;
                case 2:
                    if (typeof data === 'function') { cb = data; data = null; }
                    if (typeof channel !== 'string') { data = channel; channel = '*'; }
                    break;
                default: if (!channel) channel = '*'; break;
            }
            var retry_args = [channel, data, cb]; //save after shuffle to avoid re-shuffle params each time
            channel = name + ':' + channel;
            var sender = cb? {}: senders[channel] = senders[channel] || {}; //use separate sockets if responses are needed (to avoid cross-talk)
            if (!sender.cbexec) sender.cbexec = function(reply_data)
            {
                if (!sender.cb) return -1; //retdebug(-1, "cbexec: nothing pending"); //no call-back
                if (cb(reply_data)) return 1; //retdebug(1, "cbexec: cb wants to retain current cb"); //retained call-back
                sender.cb = null; //request is satisfied; don't want any more responses
                return 0; //dropped call-back
            }
            if (!sender.promise) sender.promise = Q.promise(function(resolve, reject) //defer send until socket is open
            {
//state = 1;
//                var client = new net.Socket();
                console.log("try connect %s ...", channel);
                var client = net.connect(name2port(channel), "localhost"); //https://millermedeiros.github.io/mdoc/examples/node_api/doc/net.html#net.createConnection
//debugger;
//                console.log("ons %s ...", channel);
                client.on('connect', function() //NOTE: don't chain this from above?
                {
//debugger;
                    console.log('CONNECTED TO %s at %s:%s', channel, "localhost", name2port(channel)); //+ " from " + client.port); //CircularJSON.stringify(client));
//                    client.itsmebob = true;
//                    client.write("hello bob");
//                    objectMode(client);
//                    status = 1;
                    client.objclient = objectStream(client); //TODO: does this need to be repeated after reconnect also?
                    resolve(client); //.objclient);
                    client.objclient.on('data', function(data)
                    {
//                        if (loop++ < 10) console.log('RCV DATA: ', data);
//no                    sender.destroy();
//                    cb = sender.cbs.pop();
                        switch (sender.cbexec(data))
                        {
                            case -1: throw "Unexpected response on " + channel;
                            case 0: client.destroy(); break;
                        }
                    });
                    client.objclient.on('error', function(err)
                    {
                        console.log('Connection stream error ' + channel, err);
                        sender.promise = client = null; //client.objclient = null; //reopen next time
                        sender.cbexec(-1); //if (sender.cbs.length) if (!sender.cbs[0](-1)) sender.cbs.shift(); //= null; //satisfy pending callback and then reset for another one
                    });
                    client.objclient.on('close', function()
                    {
                        console.log('Connection stream closed ' + channel);
                        sender.promise = client = null; //client.objclient = null; //reopen next time
                        sender.cbexec(-1); //if (sender.cbs.length) if (!sender.cbs[0](-1)) sender.cbs.shift(); //= null; //satisfy pending callback and then reset for another one
                    });
                });
                client.on('error', function(err) //NOTE: this must be on client rather than objclient in case error occurs < connect
                {
debugger;
                    console.log("error on ", channel, err.code || err, err.syscall || '??');
//                    console.log("syscall ", err.syscall); //, ", state ", state); //, " myconnect? ", client.myconnect, " state ", state);
                    if (client.objclient) client.objclient.end();
                    retry(1000);
                });
                client.on('end', function()
                {
                    console.log("connection end", channel);
                });
                client.on('disconnect', function()
                {
                    console.log("connection disconnect", channel);
                });
                client.on('timeout', function()
                {
                    console.log("connection timeout", channel);
                });
                client.on('close', function(had_error)
                {
                    console.log('Connection closed %s, had err? %s', channel, had_error);
                    if (client && client.objclient) client.objclient.end();
//                    on_exit[client.oxinx] = null; //don't need to close it later
//                    sender.promise = client = null; //client.objclient = null; //reopen next time
                    if ((sender.cbexec(-1) > 0) && client && client.objclient) retry(0);
//                    if (!sender.cbs.length) return;
//                    if (!sender.cbs[0](-1)) sender.cbs.shift(); //= null; //satisfy pending callback and then reset for another one
//                    if (client && client.objclient) retry(0);
                });
                function retry(delay)
                {
                    (delay? setTimeout: process.nextTick)(function() //retry in a little while
                    {
                        console.log("retry# %d connect to %s, delay %d, resolved? %s", num_retries++, channel, delay, client? !!client.objclient: '-'); //sender.promise.resolved);
//                            client.reconnect();
                        sender.promise = client = null; //reopen next time
//                        console.log("retry: args", retry_args);
                        retval.send.apply(null, retry_args); //(channel, data, cb); //retry the whole call
                    }, delay);
                }
            });
            sender.promise.then(function(client) //defer send until socket client is ready
            {
                if (sender.cb) throw "pending response already exists on this connection";
                sender.cb = cb;
//                console.log("SEND: cb? %s, data %j", !!cb, data);
//                if (cb) //response wanted; NOTE: previous req needs to terminate before response will be processed for new req
//                if (!client.itsmebob) throw "write to wrong obj";
//                client.write(JSON.stringify(data));
//                wrobj(client, data);
                client.objclient.write(data);
            });
        },

        rcv: function(channel, cb) //receiver (socket server); channels allow multiple receiver sockets; rcv should only be called once per channel
        {
            if (arguments.length == 1) { cb = channel; channel = '*'; }
            if (typeof cb !== 'function') throw "Call-back must be a function (" + typeof cb + " supplied)";
            channel = name + ':' + channel;
            var receiver = receivers[channel];
            if (!receiver) receiver = receivers[channel] = {cbs: [], };
            receiver.cbs.push(cb); //allow multiple callbacks per channel, although not recommended (msgs will come in to multiple callbacks)
            if (receiver.server) return;
            var states = {}; //keep track of client connection states so we know when to break subscription streams
            receiver.server = net.createServer(function(socket)
            {
//                socket.unref();
//                 objectMode(socket);
//                receiver.socket = socket;
                var objsocket = objectStream(socket);
                objsocket.id = socket.remoteAddress + ':' + socket.remotePort;
                console.log("CONNECTED %s: remote %s, local %d", channel, objsocket.id, socket.localPort);
//                var states = {}; //keep track of client connection states so we know when to break subscription streams
                objsocket.on('data', function(data)
                {
                    console.log('RCV DATA %s', objsocket.id, data);
                    states[objsocket.id] = 1;
//                    objsocket.write('You said "' + data_rcv + '"');
//                     var channel_data = (/*(typeof data_rcv === 'object') &&*/ ('channel' in data_rcv)) data_rcv.channel: '*';
//                     if (!rcv_cbs[rcv_channel]) not waiting for this channel
                    receiver.cbs.forEach(function(cb)
                    {
                        cb(data, function(reply_data)
                        {
                            if ((arguments.length > 1) && (typeof reply_data === 'string')) reply_data = sprintf.apply(null, arguments);
//                            if (!receiver.server) { console.log("closed, don't write %d", ++loop); return -1; } //tell caller to stop calling
                            if (states[objsocket.id] <= 0)
                                console.log("%s, don't write %s", (states[objsocket.id] < 0)? "error": "closed", objsocket.id);
//                            else if (!socket.writable) states[objsocket.id] = 0;
                            else
                            {
//                                if (loop++ < 5) console.log("REPLY: ", reply_data);
//                            objsocket.write(JSON.stringify(reply_data)); //TODO: if error due to closed socket, ignore?
//                            wrobj(socket, reply_data);
                                states[objsocket.id] = objsocket.write(reply_data)? 1: 2; //false => queued, true => flushed
//                                console.log("reply-write to %s was okay? %d, writable? %d %d", objsocket.id, states[objsocket.id], objsocket.writable, socket.writable);
                            }
                            return states[objsocket.id]; //tell caller whether to stop sending
                        }); //, states);
                    });
                });
                objsocket.on('close', function(data)
                {
                    console.log('CLOSED: %s', objsocket.id);
                    /*delete*/ states[objsocket.id] = 0;
//                    receiver.server = null; //reopen next time
                });
                objsocket.on('error', function(err) //NOTE: need to catch this in order to avoid exception + exit in write()
                {
                    console.log('ERROR: %s', objsocket.id, err.errno || err);
                    /*delete*/ states[objsocket.id] = -1;
//                    if ((err.errno == 'EPIPE') && (err.syscall == 'write'))
//                        receiver.server = null; //reopen next time
                });
                socket.on('close', function()
                {
                    states[objsocket.id] = 0;
                    console.log("server socket closed", channel);
                });
//                socket.on('disconnect', function()
//                {
//                    console.log("server socket disconnected", channel);
//                });
//                socket.on('end', function()
//                {
//                    console.log("server socket ended", channel);
//                });
                socket.on('error', function(err)
                {
                    states[objsocket.id] = -1;
                    console.log("server socket error", channel, err);
                });
            }).listen(name2port(channel), "localhost");
//            OnExit("server " + channel, function() { receiver.server.close(); });
//            receiver.server.on('connection', function(socket)
//            {
//                console.log("server connection ", channel, socket);
//            });
            receiver.server.on('close', function()
            {
                console.log("server close ", channel);
            });
            receiver.server.on('disconnect', function(data)
            {
                console.log("server disconnect ", channel);
            });
            receiver.server.on('error', function(err)
            {
                console.log("server error ", channel, err);
            });
//            process.on('SIGINT', function()
//            {
//                console.log('Got SIGINT.');
//            //process.stdin.resume();//so the program will not close instantly
////                process.exit(2);
//                console.log("close subscribed socket");
//                receiver.server = null; //socket.destroy();
//            });
//            process.on('beforeExit', function() //kludge: make sure socket is closed on exit
//            {
//                console.log("close subscribed socket");
//                receiver.server = null; //socket.destroy();
//            });
        },

        subscribers: {numgood: 0, numbad: 0, length: 0, list: []},
//        m_subscribers: [],
//        m_numgood: 0,
//        m_numbad: 0,
        subscr: function(channel, cb) //same as rcv, but sender is a subscriber
        {
            this.subscribers.of = name2port(name + ':' + channel);
            this.rcv(channel, function(data, reply_cb)
            {
debugger;
                console.log("subscribe req:", data);
                this.subscribers.list.push(reply_cb);
                this.subscribers.length = this.subscribers.list.length;
                cb(data, reply_cb);
//                reply_cb("okay, will send you iostats");
            }.bind(this));
        },
        broadcast: function(send_data)
        {
//            if (this.subscribers.length) console.log("broadcast %s:", this.subscribers.of, send_data);
            var keepers = [];
            this.subscribers.numgood = this.subscribers.numbad = 0;
            this.subscribers.list.forEach(function(reply_cb, inx)
            {
                if (reply_cb(send_data) > 0) { ++this.subscribers.numgood; keepers.push(reply_cb); }
                else { console.log("%s stop sending to %s", this.subscribers.of, inx); ++this.subscribers.numbad; }
            }.bind(this));
//            var pruned = this.subscribers.list.length - keepers.length;
//            if (!pruned) return;
            if (!this.subscribers.numbad) return;
            this.subscribers.list = keepers;
            this.subscribers.length = this.subscribers.list.length;
            console.log("%s subscribers left after %s pruned", this.subscribers.list.length, this.subscribers.numbad); //pruned);
        },

//        unref: function
        close: function()
        {
            console.log("closing ipc que sockets");
            for (var channel in senders)
                senders[channel].promise.then(function(client)
                {
                    client.destroy();
                });
            for (var channel in receivers)
                receivers[channel].server.close();
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
