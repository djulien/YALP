// accept DELETE request at /user
//app.delete('/user', function (req, res) {
module.exports.uri = '/user';
module.exports.handler = function (req /*:http.IncomingMessage*/, resp /*:http.ServerResponse*/, next_handler)
{
    console.log("delete /user[%d]", global.seqnum++);
    resp.send('Got a DELETE request at /user');
}

//eof
