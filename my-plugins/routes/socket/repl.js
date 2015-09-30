'use strict';

require('colors');
var io = require('socket.io'); //http://socket.io/docs/
var http = require('http'); //NOTE: according to http://expressjs.com/guide/migrating-4.html express 4.x no longer needs this, but socket.io needs it
var opts = require('my-plugins/cmdline'); //combine command line options and config settings

//https://gist.github.com/ambrosechua/8176715


//also set up socket for binary I/O:
module.exports = function(app)
{
    var server = http.createServer(app);
    http.globalAgent.maxSockets = opts.max_sockets || 10; //http://webapplog.com/seven-things-you-should-stop-doing-with-node-js/
    var listener = io(server); //io.listen(server);
 
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

        var sh = spawn('bash');
        socket.on('message', function(data)
        {
            console.log("REPL in[%d]: %s".blue, global.seqnum++, data);
            sh.stdin.write(data + '\n');
            socket.emit('message', '> ' + data); //send(new Buffer('> ' + data));
        });

        sh.stdout.on('data', function(data)
        {
            console.log("REPL stdout [%d]: %s".blue, global.seqnum++, data);
            socket.emit('message', data); //send(data);
        });

        sh.stderr.on('data', function(data)
        {
            console.log("REPL stderr[%d]: %s".blue, global.seqnum++, data);
            socket.emit('message', data); //send(data);
        });

        sh.on('exit', function (code)
        {
            console.log("REPL exit[%d]: %s".red, global.seqnum++);
            socket.emit('message', '** Shell exited: ' + code + ' **');
        });

        socket.on('disconnect', function()
        {
            console.log("user disconnected".yellow);
        });
    });
    server.listen(opts.port + 1);
    console.log("listening for sockets on port %d".green, opts.port + 1);
}

//eof