
'use strict';

//see http://stackoverflow.com/questions/10046039/nodejs-send-file-in-response
//and http://stackoverflow.com/questions/20449055/node-js-stream-api-leak


var http = require('http'),
    fileSystem = require('fs'),
    path = require('path');

http.createServer(function(request, response) {
    var filePath = path.join(__dirname, 'myfile.mp3');
    var stat = fileSystem.statSync(filePath);

    response.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': stat.size
    });

    var readStream = fileSystem.createReadStream(filePath);
    // We replaced all the event handlers with a simple call to readStream.pipe()
    readStream.pipe(response);
})
.listen(2000);


var outStream = require('fs').createWriteStream("out.txt");
// Add this to ensure that the out.txt's file descriptor is closed in case of error.
response.on('error', function(err) {
  outStream.end();
});
// Pipe the input to the output, which writes the file.
response.pipe(outStream);


//eof
