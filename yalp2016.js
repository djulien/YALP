#!/usr/bin/env node
//#!/usr/bin/env /mnt/ub14/home/dj/Documents/djdev/my-npm/yalp/node_modules/nodemon/bin/nodemon.js
//#!/usr/bin/env nodemon --delay 5
//setup:
//1. install node 6.x
//2. install git
//3. https://github.com/chjj/pty.js/issues/138
//4. 'Connection refused' indicates ssh is in the path, but sshd server is not running on your mac.
//  sudo apt-get install openssh-server
//   sudo service ssh status
//   sudo vi /etc/ssh/sshd_config
//   sudo service ssh restart

//git clone pty.js and then add @line 590 of nan.h:
//these don't seem to be defined at this point
//I have no idea if these definitions are correct 
//#define GCEpilogueCallback GCCallback
//#define GCPrologueCallback GCCallback
//and recompile (make) pty.js, move into node_modules
//3. npm install ...yalp...
//4. cd my-projects; npm link; cd ../node_modules; npm link my-projects
//   cd my-plugins; npm link; cd ../node_modules; npm link my-plugins
//5. on Linux, chmod +x this file

//usage (assuming this file is named yalp.js):
// (Windows) node yalp.js
// (Linux) ./yalp.js

//possibly useful pkgs: ttycast, web-terminal, noide

'use strict';
require('colors'); //https://github.com/Marak/colors.js
const logger = console;
logger.debug = logger.log;
var olderr = console.error;
console.error = function(args)
{
	console.has_errors = true;
	return olderr.apply(null, arguments);
}
debugger;


////////////////////////////////////////////////////////////////////////////////////
////
/// main logic
//

function main()
{
//	logger.debug("hello".blue);
	var port = 2016, want = {ui: false, svr: true, restart: true, debug: false}; //default parameters
//	process.argv.forEach((val, index) => {	logger.debug(`arg[${index}]: ${val}`); });
	process.argv.forEach((argi, index, args) =>
	{
		var parts;
		if (index < (args.skip || 2)) return; //skip "node" + self, and port#
//		logger.debug(`arg[${index}]: ${argi}`);
//NO		if (parts = argi.match(/^[+-]p([0-9]+)$/i)) port = parseInt(parts[1]);
//NO		else if (parts = argi.match(/^[+-]p0x([0-9a-f]+)$/i)) port = parseInt(parts[1], 16);
//		if (argi.match(/^[+-]p/i))
//		if (parts = argi.match(/^[+-]p([0-9]+)?$/i))
		if (argi.match(/^[+-]p$/i) && (args[index + 1] + '').match(/^[0-9]+$/))
		{
//			if (argi.length < 3) args.skip = index + 2; //port# is next arg
//			else logger.error("missing space after -P in arg[%d/%d]: %s".red, index + 1, args.length, argi); //kludge: tty.js doesn't parse correctly without space
			port = parseInt(args[index + 1]);
			if (port) args.skip = index + 2;
		}
		else if (parts = argi.match(/^([+-])ui$/i)) want.ui = (parts[1] == "+");
		else if (parts = argi.match(/^([+-])svr$/i)) want.svr = (parts[1] == "+");
		else if (parts = argi.match(/^([+-])res$/i)) want.restart = (parts[1] == "+");
		else if (parts = argi.match(/^([+-])debug$/i)) want.debug = (parts[1] == "+");
		else logger.error("unrecognized arg[%d/%d]: %s".red, index + 1, args.length, argi);
	});
//	logger.debug("args: port %d, ui %s, debug %s".blue, port, ui, debug);
	if (logger.has_errors) { logger.log("cancelled; had errors".yellow); return; }
	if (want.svr) { if (want.restart) auto_restart(); else start_server(port); }
	else logged.log("no server wanted".yellow);
//	if (want.svr && !want.ui) auto_restart();
//	else logger.log("no auto-restart wanted".yellow);
	if (want.ui) start_ui(port);
	else logger.log("no ui wanted".yellow);
	logger.log("done".blue);
}


//launch browser on default page:
function start_ui(port)
{
	const launch = require('open');

//logger.log("host = " + host, path.sep);
	var browser = true;
	var uri = 'http://' + "localhost" + ':' + port + '/'; //path.sep + 'YALP.html');
	if (browser) launch_shim(uri, browser, function launch_cb(err)
	{
		if (err) throw err;
		else logger.debug("browser '%s' opened".cyan, (browser === true)? '(default)': browser);
	});
	function launch_shim(uri, browser, callback)
	{
		return (browser !== true)? launch(uri, browser, callback): launch(uri, callback);
	}
	logger.log("ui launched on url '%s'".green, uri);
}


//launch http + socket.io server:
function start_server(port)
{
	const fs = require('fs');
	const heredoc = require('heredoc');
	var conf = heredoc.strip(function()
	{/*
# Upstart script
# /etc/init/wetty.conf
# updated %DATE%
description "Web TTY"
author      "Wetty"
start on started mountall
stop on shutdown
respawn
respawn limit 20 5
exec sudo -u root wetty -p %PORT%
*/	});
	conf = conf.replace(/%PORT%/gi, port).replace(/%DATE%/gi, Date.toString());
//	console.log(conf);
        fs.createWriteStream('my-plugins/wetty-modified/bin/wetty.conf').write(conf);

debugger;
	const wetty = require('my-plugins/wetty-modified/app.js'); //https://github.com/krishnasrinivas/wetty
	logger.log("YALP server is listening on port %s".green, port);
}


//launch http + socket.io server:
function x_start_server(port)
{
	const tty = require('my-plugins/tty-modified.js'); //'tty.js'); //https://github.com/chjj/tty.js/

debugger;
//temporarily set env vars for child shell:
	process.env.PS1 = "\\!>"; //https://linuxconfig.org/bash-prompt-basics
	process.env.PS2 = "+>";
//logger.debug("port = %d", port, typeof port);
	var app = tty.createServer(
	{
//NO; handled by tty.js		port: port,
		shell: "bash",
		users: { yalp: "play" }, //hard-coded credentials
		dir: __dirname, //NOTE: pty.js appends "/static"
		static: "public",
//		cwd: "..", //relative to this.dir
	});
//	logger.debug(app);

debugger;
/*
	app.get('*', function(req, resp, next)
	{
		logger.debug("req: get", req.url);
		next();
	});
*/
	app.get('/streams', function(req, resp, next)
	{
		resp.send('TODO');
	});

	logger.log("YALP server is listening to port %s".green, app.conf.port);
	app.listen();
}


//start nodemon before starting server:
function x_auto_restart()
{
	const nodemon = require('nodemon');
	var args = Array.from(process.argv);
	args.shift(); //remove node bin
//	var me = args.shift();
	args.push("-ui", "+svr", "-res"); //start bare server under nodemon control
//	console.log(me, args);
	nodemon(
	{
//		script: 'app.js',
//		ext: 'js json',
//		script: process.argv.join(" ") + " -ui +svr",
//		script: me, //args.shift(),
//		execArgs: args,
		exec: args.join(" "),
		verbose: true,
		delay: 10, //wait 10 sec before restart
		ignore: ["node_modules/*"],
	});
	nodemon
		.on('start', function () { logger.log('App has started'.yellow); })
		.on('quit', function () { logger.log('App has quit'.red); })
		.on('restart', function (files) { logger.log('App restarted due to: %j'.cyan, files); });

	process.once('SIGUSR2', function () //sent by nodemon when files change
	{
//  		gracefulShutdown(function () {
		logger.log("restarting".yellow);
		process.kill(process.pid, 'SIGUSR2');
//		});
	});
}


//TODO:
function stream_example()
{
var fs = require("fs");  
var ss = require("socket.io-stream");

io.on("connection", function (socket) {  
    ss(socket).emit("script", fs.createReadStream(__filename));
});
}


////////////////////////////////////////////////////////////////////////////////////
////
/// helpers
//



////////////////////////////////////////////////////////////////////////////////////
////
/// startup
//


main(); //at end to avoid hoisting errors

//eof
