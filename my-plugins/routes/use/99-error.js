
//from http://cwbuecheler.com/web/tutorials/2013/node-express-mongo/
module.exports.handler = function (err /*:Error*/, req /*:http.IncomingMessage*/, resp /*:http.ServerResponse*/, next_handler)
{
    resp.status(err.status || 500);
    resp.render('error', {message: err.message, error: /*(app.get('env') === 'development')*/ true? err: null}); //only show stack trace for dev, not prod
});

//eof
