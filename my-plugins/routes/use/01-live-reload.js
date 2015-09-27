
//https://github.com/livereload/livereload-js

//https://www.npmjs.com/package/connect-livereload
//NOTE: should come after static, before dynamic routes
//for static html files, place it before static routes

module.exports.handler = require('connect-livereload')(
{
    port: 35729,
//    ignore: ['.js', '.svg'],
});

//function (req /*:http.IncomingMessage*/, resp /*:http.ServerResponse*/, next_handler)
//    console.log("live-reload[%d]".blue, global.seqnum++);


//eof
