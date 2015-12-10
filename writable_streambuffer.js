'use strict';

var util = require('util');
var stream = require('stream');
var constants = require('./constants');
var int24 = require('int24');

var WritableStreamBuffer = module.exports = function(opts) {
  opts = opts || {};
  opts.decodeStrings = true;

  stream.Writable.call(this, opts);

  var initialSize = opts.initialSize || constants.DEFAULT_INITIAL_SIZE;
  var incrementAmount = opts.incrementAmount || constants.DEFAULT_INCREMENT_AMOUNT;

  var buffer = new Buffer(initialSize);
  var size = 0;

  this.size = function() {
    return size;
  };

  this.maxSize = function() {
    return buffer.length;
  };

//allow buf clear without copying contents:
  this.reset = function() {
    size = 0;
    return this; //fluent
  };

//avoid extra mem copy:
  this.peek = function() {
    return size? buffer.slice(0, size): false; //trim to hide unused space from caller
  };

//allow more recent data to be pulled by specifying ofs:
  this.getContents = function(length, ofs) {
    if(!size) return false;

    if (!ofs) ofs = 0;
    if (ofs >= size) return false;

    var data = new Buffer(Math.min(length || size, size - ofs));
    buffer.copy(data, 0, ofs, ofs + data.length);

    if(data.length < size)
      buffer.copy(buffer, ofs, ofs + data.length);

    size -= data.length;

    return data;
  };

  this.getContentsAsString = function(encoding, length) {
    if(!size) return false;

    var data = buffer.toString(encoding || 'utf8', 0, Math.min(length || size, size));
    var dataLength = Buffer.byteLength(data);

    if(dataLength < size)
      buffer.copy(buffer, 0, dataLength);

    size -= dataLength;
    return data;
  };

  var increaseBufferIfNecessary = function(incomingDataSize) {
    if((buffer.length - size) < incomingDataSize) {
      var factor = Math.ceil((incomingDataSize - (buffer.length - size)) / incrementAmount);

      var newBuffer = new Buffer(buffer.length + (incrementAmount * factor));
      buffer.copy(newBuffer, 0, 0, size);
      buffer = newBuffer;
    }
  };

  this._write = function(chunk, encoding, callback) {
    increaseBufferIfNecessary(chunk.length);
    chunk.copy(buffer, size, 0);
    size += chunk.length;
    callback();
  };

//add the following methods:
//writeDoubleBE(value, offset[, noAssert])
//writeDoubleLE(value, offset[, noAssert])
//writeFloatBE(value, offset[, noAssert])
//writeFloatLE(value, offset[, noAssert])
//writeInt8(value, offset[, noAssert])
//writeInt16BE(value, offset[, noAssert])
//writeInt16LE(value, offset[, noAssert])
//writeInt24BE(value, offset[, noAssert])
//writeInt24LE(value, offset[, noAssert])
//writeInt32BE(value, offset[, noAssert])
//writeInt32LE(value, offset[, noAssert])
//writeIntBE(value, offset, byteLength[, noAssert])
//writeIntLE(value, offset, byteLength[, noAssert])
//writeUInt8(value, offset[, noAssert])
//writeUInt16BE(value, offset[, noAssert])
//writeUInt16LE(value, offset[, noAssert])
//writeUInt24BE(value, offset[, noAssert])
//writeUInt24LE(value, offset[, noAssert])
//writeUInt32BE(value, offset[, noAssert])
//writeUInt32LE(value, offset[, noAssert])
//writeUIntBE(value, offset, byteLength[, noAssert])
//writeUIntLE(value, offset, byteLength[, noAssert])

//code block for additional methods adapted from https://github.com/deoxxa/concentrate
  [8, 16, 24, 32].forEach(function(b) {
    ["", "u"].forEach(function(s) {
      ["", "le", "be"].forEach(function(e) {
        // derive endiannes postfix supported by node Buffer api
        // for all the numbers, except 8 bit integer, endiannes is mandatory
        var endiannes = e || "le";
        // for 8 bit integers - no endiannes postfix
        if(b === 8){
            endiannes = "";
        }
      
        //var type = [s, "int", b, e].join(""),
        var method = ["write", s.toUpperCase(), "Int", b, endiannes.toUpperCase()].join(""),
          length = b / 8;

        this[method] = function(data, ofs) {
          if (arguments.length < 2) ofs = size;
          increaseBufferIfNecessary(size + length - ofs);
          if (length == 3) int24[method](buffer, data >>> 0, ofs); //special case
          else buffer[method](data >>> 0, ofs);
//          size += length;
          size = Math.max(ofs + length, size);
          return this; //fluent
        };
        this["read" + method.substr(5)] = function(ofs) {
          return (length == 3)? int24[method](buffer, data, ofs): buffer[method](data, ofs);
        };
      }.bind(this));
    }.bind(this));
  }.bind(this));

  [["float", 4], ["double", 8]].forEach(function(t) {
    ["le", "be"].forEach(function(e) {
      var type = [t[0], e].join(""),
          method = ["write", t[0].replace(/^(.)/, function(e) { return e.toUpperCase(); }), e.toUpperCase()].join(""),
        length = t[1];

      this[method] = function(data, ofs) {
        if (arguments.length < 2) ofs = size;
        increaseBufferIfNecessary(size + length - ofs);
        buffer[method](data, ofs);
        size += length;
        return this; //fluent
      };
      this["read" + method.substr(5)] = function(ofs) {
        return buffer[method](ofs);
      };
    }.bind(this));
  }.bind(this));


  this._write = function(chunk, encoding, callback) {
    increaseBufferIfNecessary(chunk.length);
    chunk.copy(buffer, size, 0);
    size += chunk.length;
    callback();
  };
};

util.inherits(WritableStreamBuffer, stream.Writable);
