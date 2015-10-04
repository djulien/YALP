'use strict';

require('colors');
var io = require('socket.io'); //http://socket.io/docs/
//var http = require('http'); //NOTE: according to http://expressjs.com/guide/migrating-4.html express 4.x no longer needs this, but socket.io needs it
//var opts = require('my-plugins/cmdline'); //combine command line options and config settings

var spawn = require('child_process').spawn;

//https://gist.github.com/ambrosechua/8176715
//https://github.com/rauchg/chat-example
//http://danielnill.com/nodejs-tutorial-with-socketio/
//http://socket.io/docs/logging-and-debugging/
//http://stackoverflow.com/questions/6785979/require-socket-io-client-js-not-working

//NOTE: client must get a copy of socket.io.js, which is one of the files at https://github.com/socketio/socket.io-client

//also set up socket for binary I/O:
module.exports = function(server) //app)
{
//    var server = http.createServer(app);
//    http.globalAgent.maxSockets = opts.max_sockets || 10; //http://webapplog.com/seven-things-you-should-stop-doing-with-node-js/
    var listener = io.listen(server); //io(server); //??
//    listener.set('log level', 1); //http://expressjs.com/guide/debugging.html

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
//        socket.send("Hello from YALP!");

//        socket.on('join', function(data)
//        {
//            console.log("JOIN:", data);
////            client.emit('messages', 'Hello from server');
//            socket.emit('message', {'message': 'hello world'});
//        });

        var sh = spawn('bash'); //https://nodejs.org/api/child_process.html
        sh.stdout.setEncoding("utf8"); //from https://github.com/rabchev/web-terminal/blob/master/lib/terminal.js
        sh.stderr.setEncoding("utf8");

        sh.prompt = function()
        {
            if (!this.linenum) this.linenum = 0;
            return ++this.linenum + " > ";
        }

        socket.emit('tty', {text: sh.prompt(), style: 'stdout'});
        socket.on('tty', function(data)
        {
            console.log("REPL in[%d]: %s".blue, global.seqnum++, data.text);
            sh.stdin.write(data.text + '\n');
//            socket.emit('message', '> ' + data); //new Buffer('> ' + data)); //send = pt-to-pt, emit = broadcast
        });

//shell streams appear to be ArrayBuffers
//http://stackoverflow.com/questions/17191945/conversion-between-utf-8-arraybuffer-and-string
        sh.stdout.on('data', function(data)
        {
            console.log("REPL stdout [%d]: %s".blue, global.seqnum++, data);
            socket.emit('tty', {text: String.fromCharCode.apply(null, data) + "\n" + sh.prompt(), style: 'stdout'});
        });

        sh.stderr.on('data', function(data)
        {
            console.log("REPL stderr[%d]: %s".blue, global.seqnum++, data);
            socket.emit('tty', {text: String.fromCharCode.apply(null, data) + "\n" + sh.prompt(), style: 'stderr'});
        });

        sh.on('exit', function (code)
        {
            console.log("REPL exit[%d]: %s".red, global.seqnum++);
            socket.emit('tty', {text: '** Shell exited: ' + code + ' **', style: 'status'});
        });

        socket.on('disconnect', function()
        {
            console.log("user disconnected".yellow);
            if (sh) sh.stdin.end();
        });
    });
//    server.listen(opts.port + 1); //TODO: do we need to keep it separate from http traffic?
    console.log("listening for sockets at %s:%s".green, server.address().address, server.address().port); // on port %d".green, opts.port); // + 1);
}

//eof
