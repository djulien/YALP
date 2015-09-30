'use strict';

require('colors');
var io = require('socket.io'); //http://socket.io/docs/
//var http = require('http'); //NOTE: according to http://expressjs.com/guide/migrating-4.html express 4.x no longer needs this, but socket.io needs it
//var opts = require('my-plugins/cmdline'); //combine command line options and config settings

//https://gist.github.com/ambrosechua/8176715
//https://github.com/rauchg/chat-example

//NOTE: client must get a copy of socket.io.js, which is one of the files at https://github.com/socketio/socket.io-client

//also set up socket for binary I/O:
module.exports = function(server) //app)
{
//    var server = http.createServer(app);
//    http.globalAgent.maxSockets = opts.max_sockets || 10; //http://webapplog.com/seven-things-you-should-stop-doing-with-node-js/
    var listener = io.listen(server); //io.listen(server);

/*
    io.on('connection', function(socket)
    {
//nope    var src = socket.handshake.address; //http://stackoverflow.com/questions/6458083/get-the-clients-ip-address-in-socket-io
//nope    var src = socket.request.connection.remoteAddress;
//    console.dir(socket);
        var src = socket.conn; //{remoteAddress: '??'};
        console.log("a user connected from: ".yellow, src.remoteAddress, socket.handshake.headers['user-agent']);
        socket.emit('chat rcv', "welcome!"); //{ hello: 'world' });
        socket.on('chat send', function(msg)
        {
            console.log("chat message: ".yellow + msg);
            io.emit('chat rcv', "REPLY: " + msg);
        });

        socket.on('disconnect', function()
        {
            console.log("user disconnected".yellow);
        });
    });
*/

    listener.on('connection', function(socket)
    {
        var src = socket.conn; //{remoteAddress: '??'};
        console.log("a user connected from: ".yellow, src.remoteAddress, socket.handshake.headers['user-agent']);
        socket.send("Hello from YALP!");

        var sh = spawn('bash');
        socket.on('message', function(data)
        {
            console.log("REPL in[%d]: %s".blue, global.seqnum++, data);
            sh.stdin.write(data + '\n');
            socket.send('> ' + data); //new Buffer('> ' + data)); //send = pt-to-pt, emit = broadcast
        });

        sh.stdout.on('data', function(data)
        {
            console.log("REPL stdout [%d]: %s".blue, global.seqnum++, data);
            socket.send(data);
        });

        sh.stderr.on('data', function(data)
        {
            console.log("REPL stderr[%d]: %s".blue, global.seqnum++, data);
            socket.send(data);
        });

        sh.on('exit', function (code)
        {
            console.log("REPL exit[%d]: %s".red, global.seqnum++);
            socket.send('** Shell exited: ' + code + ' **');
        });

        socket.on('disconnect', function()
        {
            console.log("user disconnected".yellow);
        });
    });
//    server.listen(opts.port + 1); //TODO: do we need to keep it separate from http traffic?
    console.log("listening for sockets at %s:%s".green, server.address().address, server.address().port); // on port %d".green, opts.port); // + 1);
}

//eof
