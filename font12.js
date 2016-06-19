#!/usr/bin/env node

'use strict';
require('colors');
const fs = require('fs');
//const net = require('net');
//const sockio = require('socket.io');
const sockio = require('socket.io-client'); //('http://localhost');
const remote = require('my-plugins/wetty-modified/public/wetty/remote-exec.js');

//process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; //http://stackoverflow.com/questions/24482856/how-to-connect-to-node-socket-io-server-from-node-socket-io-client-with-https


function main()
{
//	var src = fs.createReadStream('my-plugins/wetty-modified/bin/wetty.
	var src = fs.readFileSync('my-plugins/wetty-modified/bin/wetty.conf', 'utf8'); //, function(err, data)
//	console.log(src);
	var parts = src.match(/exec sudo -u [^ ]+ wetty -p ([0-9]+)/mi);
	if (!parts) { console.error("unknown server".red); return; }
//console.log(parts.length, parts);
	var port = parseInt(parts[1]);
	console.log("port", port);

debugger;
//{path: '/wetty/socket.io'}
//	var socket = sockio('http://localhost:' + port + '/wetty/socket.io');
	var socket = sockio('http://localhost:' + port,
	{
		path: '/wetty/socket.io/',
		extraHeaders: {notty: true},
//		allowUpgrades: true,
////		transports: ['websocket', 'flashsocket', 'polling'],
//		transports: ['websocket'],
//		reconnect: true,
//		'log level': 1,
////		pingTimeout: 1000 * 80,
////		pingInterval: 1000 * 25,
	});
	socket.on('connect', function() { console.log("connected".green); });
	socket.on('event', function(data){ console.log("event".blue, data); });
	socket.on('data', function(data){ console.log("data".blue, data); });
	socket.on('disconnect', function(){ console.log("disconnected".red); });

	remote.init(socket);
console.log("TODO: send JS to all of server's other clients");
	remote.exec(function() { console.log("get clients"); var buf = ''; for (var i in this) buf += ',' + i; return buf; }, function(clients)
{
//		console.log("server has %d clients", clients.length, clients);
		console.log("server got clients", clients);
		socket.destroy(); // kill client after server's response
	});

//return;
//	socket.on('rep-clients', function(clients)
//	{
//		console.log("server has %d clients", clients.length || 0, clients);
//		socket.destroy(); // kill client after server's response
//		socket.to(id).emit(data); //http://stackoverflow.com/questions/24041220/sending-message-to-a-specific-id-in-socket-io-1-0
//	});
//	socket.emit('req-clients'); //'function(){}'); //, function(resp_code, data)
//	{
//		console.log("reply", resp_code, data);
//	});
}


main();

//eof
