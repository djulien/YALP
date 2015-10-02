//from http://danielnill.com/nodejs-tutorial-with-socketio/
//see also http://socket.io/docs/logging-and-debugging/

//to debug: DEBUG=* node yourfile.js

//var http = require('http');
var express = require('express');
var app = express();
var url = require('url');
var fs = require('fs');
var io = require('socket.io');

//console.log("env: ", process.env);

routers(app);

//var server = http.createServer(function(request, response)
var xserver = app.listen(8001, "localhost", function() {});

app.use('/', express.static(__dirname + '/public'));

/*
app.get('*', function(request, response, next)
{
       console.log('Connection');
       var path = url.parse(request.url).pathname;

       switch(path)
       {
            case '/':
                response.writeHead(200, {'Content-Type': 'text/html'});
                response.write('hello world');
                response.end();
                break;
            case '/socket.html':
                fs.readFile(__dirname + path, function(error, data) //async
                {
                    if (error)
                    {
                        response.writeHead(404);
                        response.write("oops this doesn't exist - 404");
                    }
                    else
                    {
                        response.writeHead(200, {"Content-Type": "text/html"});
                        response.write(data, "utf8");
                    }
                    response.end();
                });
                break;
            default:
                response.writeHead(404);
                response.write("opps this doesn't exist - 404");
                response.end();
                break;
        }
//        response.end();
});
//server.listen(8001);
*/


function routers(app)
{
    var server = null;
    var applisten = app.listen;
//    console.log("app.listen = " + applisten);
    app.listen = function(port, host, cb) //kludge: grab http server when created by express and reuse for socket io; should occur first since require_glob is async
    {
        server = applisten.apply(app, arguments); //creates http server
//        console.log("route index: got server");
        return server;
    };

	setTimeout(function() { socket_setup(server); }, 10);

function socket_setup(svr)
{
var listen = io.listen(svr);
listen.set('log level', 1);

listen.on('connection', function(socket)
{
    socket.emit('message', {'message': 'hello world'});
    setInterval(function()
    {
        socket.emit('date', {'date': new Date()});
    }, 1000);
  socket.on('client_data', function(data)
  {
    process.stdout.write(data.letter);
  });
});

}

}

//eof
