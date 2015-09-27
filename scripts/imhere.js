//call after boot

var sprintf = require('sprintf');
var email = require('my-plugins/utils/email');
var ipadrs = require('ip'); //https://www.npmjs.com/package/ip
var hostname = require('os').hostname();

email('I\'m here!', 'hello from %s on %s.', ipadrs.address(), hostname);

//eof
