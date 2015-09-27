
//enable CORS; http://enable-cors.org/server_expressjs.html
module.exports.handler = function (req /*:http.IncomingMessage*/, resp /*:http.ServerResponse*/, next_handler)
{
    console.log("cors[%d]".blue, global.seqnum++);
    resp.header("Access-Control-Allow-Origin", "*");
    resp.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next_handler();
}


//eof
