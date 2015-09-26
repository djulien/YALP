module.exports.uri = '/quit';
module.exports.handler = function (req /*:http.IncomingMessage*/, resp /*:http.ServerResponse*/, next_handler)
{
    console.log("get /quit[%d]".yellow, global.seqnum++);
    resp.send("shutting down ...");
//    app.close(); //http://stackoverflow.com/questions/8659011/how-do-i-programmatically-shut-down-an-instance-of-expressjs-for-testing
    console.log("exit request".red); //magenta, seqnum++);
//    if (watcher) watcher.close();
    process.exit(0);
//    server.close();
//    setTimeout(app.close, 500); //kludge: must be done outside event handler
}

//eof
