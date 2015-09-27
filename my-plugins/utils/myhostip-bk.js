//http://stackoverflow.com/questions/3653065/get-local-ip-address-in-node-js

var os = require('os');
var iface = os.networkInterfaces();

console.log(iface);


//eof
