//app.use(function(req, res, next) {
module.exports.handler = function (req /*:http.IncomingMessage*/, resp /*:http.ServerResponse*/, next_handler)
{
    console.log("404[%d]:".red, global.seqnum++, req.url);
    resp.status(404).send('Sorry cant find that!');
}

//eof
