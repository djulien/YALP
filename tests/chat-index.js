//from http://socket.io/get-started/chat/

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.get('/', function(req, resp){
//  res.send('<h1>Hello world</h1>');
  resp.sendFile(__dirname + '/chat-index.html');
});
//const cli_path = require.resolve('socket.io-client/socket.io.js');
//console.log("cli.js is at ", cli_path);

/*
var server = http.createServer(function (req, resp)
{
  console.log("req", req.url);
  if (req.url == "/socket.io/socket.io.js") resp.sendFile(cli_path);
//var clientSource = read(require.resolve('socket.io-client/socket.io.js'), 'utf-8');

});
*/

var numcli = 0; //cli = [];
var nummsg = 0;
io.on('connection', function(socket){
  console.log('user connect');
//  cli.push(socket);
  io.emit('chat msg', 'hello there ' + ++numcli); //cli.length);
  socket.on('disconnect', function(socket) { console.log('user disconnect'); });
  socket.on('chat msg', function(msg)
  {
    console.log('msg: ', msg);
    io.emit('chat msg', msg);
  });
});

var numtick = 0;
setInterval(function() { io.emit('chat msg', 'tick ' + numtick++); }, 2000);

http.listen(3000, function(){
  console.log('listening on *:3000');
});
