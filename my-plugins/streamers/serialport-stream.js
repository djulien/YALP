//from https://github.com/nathan7/serialport-stream/blob/master/index.js
//serialport-stream still isn't compatible with node 4.x (nan 2.x), so just use the .js layer for now

'use strict'
var inherits = require('util').inherits
var Stream = require('stream')
var DuplexStream = Stream.Duplex
require('colors'); //-DJ
//-DJ var fs = require('fs')
const fs = //-DJ
{
    close: function(sport, err_cb) { return sport.close(err_cb); },
};
//-DJ var binding = require('bindings')('binding.node')
var SerialPort = require("serialport"); //.SerialPort; //from https://github.com/voodootikigod/node-serialport //-DJ
const CONFIG =
{
    '8N1': {dataBits: 8, parity: 'none', stopBits: 1},
    '8N1.5': {dataBits: 8, parity: 'none', stopBits: 1.5},
    '8N2': {dataBits: 8, parity: 'none', stopBits: 2},
};


module.exports = exports = Serial
inherits(Serial, DuplexStream)
function Serial (port, baud, config) { //-DJ
  var self = this
  DuplexStream.call(this)

  port = port || '/dev/ttyS0'; //or /dev/ttyUSB0
  baud = (baud | 0) || 115200
//-DJ  if (!binding.validBaud(baud)) throw new Error('invalid baud rate ' + baud)
  if (!CONFIG[config]) throw new Error("Serial stream: unhandled bit config: '" + (config || '(none)') + "'"); //-DJ

  this._fd = null
//  fs.open(port, 'r+', function (err, fd) {
  this._fd = new SerialPort.SerialPort(port, Object.assign({ baudrate: baud, buffersize: 2048*10 }, CONFIG[config]), function(err) { // this is the openImmediately flag [default is true]
    if (err) return self.emit('error', err)
//-DJ    self._fd = fd

//-DJ    binding.initPort(fd, baud)

//-DJ    self._readStream = fs.createReadStream(port, { fd: fd, autoClose: false })
//-DJ    self._readStream.on('error', function (err) { self.emit('error', err) })
//-DJ    self._writeStream = fs.createWriteStream(port, { fd: fd, autoClose: false })
//-DJ    self._writeStream.on('error', function (err) { self.emit('error', err) })

    this._readStream = {on: function(evt, cb) { if (evt === 'readable') self._readStream.read_cb = cb; }}; //('readable', function () { //-DJ
    this._writeStream = {write: function (chunk, encoding, cb) { return self._fd.write(chunk); }}; //, function(err, results) //-DJ
    self._fd.on('error', function (err) { self.emit('error', err); console.error("port '%s' error: ".red, err); });
    self._fd.on('data', function(data) { self._readStream.read_cb(data); console.log("serial data: len %d".blue, data); });
    self._fd.on('close', function() { console.error("closed '%s'".cyan, port); });
    self._fd.on('disconnect', function() { console.error("disconnected %s".red, port); });

    self.emit('open')
    console.error("open".green); //-DJ
  })
}

/* TODO? -DJ
//add a write+drain method:
sport.write_drain = function(outbuf, outlen, cb)
{
    var elapsed = new Elapsed();
    if (typeof outlen === 'function') { cb = outlen; outlen = undefined; }
    if (!cb) cb = function(err) { return err; }
    if (/-*(typeof outlen !== 'undefined') &&*-/ (outlen < outbuf.length)) outbuf = outbuf.slice(0, outlen); //kludge: no len param to write(), so trim buffer instead
    return this.write(outbuf, function(err, results)
    {
//        console.log(typeof outbuf);
        var outdesc = outbuf.length + ':"' + ((typeof outbuf === 'string')? outbuf: (outbuf.toString('utf8').substr(0, 20) + '...')).replace(/\n/g, "\\n") + '"';
        if (err) { console.log('write "%s" err after %s: '.red, outdesc, elapsed.scaled(), err); return cb(err); }
        else console.log('write "%s" ok after %s; results %d:'.green, outdesc, elapsed.scaled(), results.length, results);
        this.drain(function(err)
        {
            if (err) { console.log('drain %s err '.red + err, outdesc); return cb(err); }
            console.log("drain %s completed after %s".green, outdesc, elapsed.scaled());
            return cb();
        }.bind(this));
    }.bind(this));
}; //.bind(sport);
*/

function whenOpen (self, cb) {
  if (self._fd === null) {
    self.once('open', cb)
  } else {
    cb.call(self)
  }
}

Serial.prototype._read = function (size) {
  whenOpen(this, function () {
    var self = this
    if (this._readStream) this._readStream.on('readable', function () {
      self.push(this.read(size))
    })
    else console.error("rd stream closed".red); //-DJ
  })
}

Serial.prototype._write = function (chunk, encoding, cb) {
  whenOpen(this, function () {
    if (this._writeStream) this._writeStream.write(chunk, encoding, cb)
    else console.error("wr stream closed".red); //-DJ
  })
}

Serial.prototype.close = function (cb) {
  var self = this
  var fd = this._fd
  this._fd = this._writeStream = this._readStream = null
  this.writable = false
  fs.close(fd, function (err) {
    if (err) self.emit('error', err)
  })
}

//eof
