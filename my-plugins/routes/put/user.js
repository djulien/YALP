// accept PUT request at /user
//app.put('/user', function (req, res) {
module.exports.uri = '/user';
module.exports.handler = function (req /*:http.IncomingMessage*/, resp /*:http.ServerResponse*/, next_handler)
{
    console.log("put /user[%d]".blue, global.seqnum++);
    resp.send('Got a PUT request at /user');
}

//eof
