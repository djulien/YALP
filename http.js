'use strict';

//TODO: use https://github.com/pillarjs/send?

//below is based on https://github.com/cloudhead/node-static

//const fs = require("fs");
//const url = require("url");
//const path = require("path");
const http = require('http');
const staticc = require('node-static');

const PORT = parseInt(process.argv[2]) || 2015;
const cwd = process.cwd(); //save initial value in case it changes

var file = new staticc.Server('./public');
http.createServer(function (request, response)
{
    request.addListener('end', function() { file.serve(request, response); }).resume();
}).listen(PORT);
console.log("Server listening on: http://localhost:%s/\nCTRL + C to shutdown", PORT);

//eof
/*
//below is based on https://github.com/expressjs/serve-static
or

//below is based on https://gist.github.com/ryanflorence/701407

var server = http.createServer(function handleRequest(request, response)
{
    var uri = url.parse(request.url).pathname, filename = path.join(cwd, 'public', uri);
//    response.end('It Works!! Path Hit: ' + request.url);
//    path.exists(filename, function(exists)
//    if (filename.indexOf(cwd) !== 0) //avoid folder traversal attack
    var stat = fs.statSync(filename);
    if (stat.isDirectory()) filename = path.join(filename, 'index.html');
    else if (!stat.isFile())
    {
        response.writeHead(404, {"Content-Type": "text/plain"});
        response.write("404 Not Found\n");
        response.end();
        return;
    }
    fs.readFile(filename, "binary", function(err, file)
    {
        if (err)
        {
            response.writeHead(500, {"Content-Type": "text/plain"});
            response.write(err + "\n");
            response.end();
            return;
        }
        response.writeHead(200);
        response.write(file, "binary");
        response.end();
    });
});
server.listen(PORT, function listen()
{
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s/\nCTRL + C to shutdown", PORT);
});
*/
