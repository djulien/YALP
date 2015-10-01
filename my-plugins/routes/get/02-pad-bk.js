module.exports.uri = '/pad';
module.exports.handler = function (req /*:http.IncomingMessage*/, resp /*:http.ServerResponse*/, next_handler)
{
    console.log("get /pad[%d]".blue, global.seqnum++);
    resp.render('pad');
}

//eof
