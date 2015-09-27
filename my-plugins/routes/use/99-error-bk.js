//this one not needed; express supplies a default error handler
//http://expressjs.com/guide/error-handling.html

module.exports.handler = function (err, req /*:http.IncomingMessage*/, resp /*:http.ServerResponse*/, next_handler)
{
    console.error("error[%d]:", global.seqnum++, err.stack);
    resp.status(500);
    resp.render('error', { error: err });
//??  next(err);
}

//eof
