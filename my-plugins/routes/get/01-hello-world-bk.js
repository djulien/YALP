
module.exports.uri = '/hello';
module.exports.handler = function (req /*:http.IncomingMessage*/, resp /*:http.ServerResponse*/, next_handler)
{
    console.log("get /hello[%d]".blue, global.seqnum++);
    resp.send('Hello World!');
}

//eof
