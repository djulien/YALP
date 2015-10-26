//app.use(function(req, res, next) {
module.exports.handler = function (req /*:http.IncomingMessage*/, resp /*:http.ServerResponse*/, next_handler)
{
    console.log("404[%d]:".red, global.seqnum++, req.url);
    resp.status(404).send('Sorry cant find that!');
}

//404 handler:
//from http://cwbuecheler.com/web/tutorials/2013/node-express-mongo/
//app.use(function(req, res, next)
//{
//    var err = new Error('Not Found');
//    err.status = 404;
//    next(err);
//});

//eof
