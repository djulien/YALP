'use strict';

//from https://github.com/bminer/trivial-port/blob/master/test.js

var SerialPort = require("trivial-port");
var util = require('util');

var port = new SerialPort({"baudRate": 115200, "serialPort": "/dev/ttyUSB0"});
console.log(util.inspect(port));

port.initialize();
port.on("data", function(chunk)
{
    console.log("RX:", chunk.toString("ascii"));
});

port.write("AT+CSQ\r\n");
setTimeout(function()
{
    console.log("Writing message again");
    port.write("ATZ\r\n");
}, 2000);

setTimeout(function()
{
    console.log("Closing");
    port.close();
}, 5000);

//eof
