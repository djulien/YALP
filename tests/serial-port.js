'use strict';

require('colors');
var Elapsed = require('my-plugins/utils/elapsed');
//console.log(JSON.stringify(Elapsed));

//from https://github.com/voodootikigod/node-serialport
var SerialPort = require("serialport"); //.SerialPort;

SerialPort.list(function (err, ports)
{
    if (err) console.log("ERR:".red, err);
  ports.forEach(function(port)
  {
    console.log("found port:".blue, port.comName, port.manufacturer, port.pnpId);
  });
});

var elap = new Elapsed();
var serialPort = new SerialPort.SerialPort("/dev/ttyUSB0", { baudrate: 242500, dataBits: 8, parity: 'none', stopBits: 1, buffersize: 2048, parser: SerialPort.parsers.raw, xparser: SerialPort.parsers.readline("\n") }, function(err)
{
    if (err) console.log("open err: ".red + err);
    else console.log("opened after %s".green, elap.scaled());
});
//var serialPort = new SerialPort.SerialPort("/dev/ttyUSB0", { baudrate: 57600 }, false); // this is the openImmediately flag [default is true]
setTimeout(function() { serialPort.open(); }, 4000);
serialPort.outSync = function(outbuf, cb)
{
    var elapsed = new Elapsed();
    if (!cb) cb = function(err) { return err; };
    return this.write(outbuf, function(err)
    {
//        console.log(typeof outbuf);
        var outdesc = outbuf.length + ':"' + ((typeof outbuf === 'string')? outbuf: (outbuf.toString('utf8').substr(0, 20) + '...')).replace(/\n/g, "\\n") + '"';
        if (err) { console.log('write "%s" err '.red + err, outdesc); return cb(err); }
//    else console.log('results %d: "%s"'.green, results.length, results);
        console.log("wr %s ok after %s".green, outdesc, elapsed.scaled());
        this.drain(function(err)
        {
            if (err) { console.log('drain %s err '.red + err, outdesc); return cb(err); }
            console.log("drain %s completed after %s".green, outdesc, elapsed.scaled());
            return cb();
        }.bind(this));
    }.bind(this));
}.bind(serialPort);

serialPort.on("open", function ()
{
  console.log('opened');
  serialPort.on('data', function(data)
  {
    console.log('data received %d: "%s"'.blue, data.length, data.toString('utf8').replace(/\n/g, "\\n"));
  });
  serialPort.outSync("ls\n");
  serialPort.outSync("echo hello there;\n");
  var buf = new Buffer(2000);
  buf.fill(0x5a);
  serialPort.outSync(buf);
});

//.flush(cb(err)) data received but not read
serialPort.on('error', function(err) { console.log("ERR: ".red, err); });
serialPort.on('close', function() { console.log("closed".cyan); });

setTimeout(function() { var el = new Elapsed(); serialPort.close(function(err)
{
    if (err) console.log("close err: ".red + err);
    else console.log("closed after %s".green, el.scaled());
}); }, 15000);

//eof

/* OLD//from https://github.com/bminer/trivial-port/blob/master/test.js
//CAUTION: messes up xterm afterward
var util = require('util');
var SerialPort = require("trivial-port");
//to list ports: dmesg | grep tty
var port = new SerialPort({"baudRate": 115200, "serialPort": "/dev/ttyUSB0"});
//console.log(util.inspect(port));
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
*/
