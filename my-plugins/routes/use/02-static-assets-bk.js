//NOTE: don't use this - harder to add custom debug/trace

var express = require('express'); //http://expressjs.com/4x/api.html

//app.use('/static', express.static(__dirname + '/public'));
module.exports.uri = '/';
module.exports.handler = express.static(__dirname + '/public', {});

//eof
