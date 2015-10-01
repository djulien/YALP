// accept POST request on the homepage
//app.post('/', function (req, res) {
module.exports.uri = '/';
module.exports.handler = function (req /*:http.IncomingMessage*/, resp /*:http.ServerResponse*/, next_handler)
{
    console.log("post /[%d]".blue, global.seqnum++);
    resp.send('Got a POST request');
}

//eof
