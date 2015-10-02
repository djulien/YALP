//various exit handlers
//see https://nodejs.org/api/process.html

require('colors');
var email = require('my-plugins/utils/email');
var elapsed = require('my-plugins/utils/elapsed').toString;

module.exports = function(server) //app)
{

    process.on('SIGTERM', function()
    {
        console.log("terminating ...".red);
        if (email) email('YALP crash', 'terminate after %s', elapsed()); //no worky
    //    app.close();
        server.close();
    });

    //http://stackoverflow.com/questions/20165605/detecting-ctrlc-in-node-js
    process.on('SIGINT', function()
    {
        console.log("Caught interrupt signal".red);
        if (email) email('YALP quit', 'interrupt signal after %s', elapsed()); //no worky
//    if (i_should_exit)
        process.exit();
    });

    process.on('uncaughtException', function(err) //NOTE: no async code here, only emergency clean-up
    {
//Emitted when an exception bubbles all the way back to the event loop
//overrides default action of printing a stack trace and exit
//should not be used as an alternative to the 'exit' event unless the intention is to schedule more work.
//Do not use to recover from errors; An unhandled exception means application  + Node.js itself are in an undefined state
//perform synchronous cleanup before shutting down the process
//restart application after every unhandled exception!
         console.log('Exception: ' + err.stack);
        if (email) email('YALP exc', 'uncaught exc after %s', elapsed()); //no worky?
    });

    process.on('beforeExit', function(code) //NOTE: async code okay here
    {
//emitted when Node.js empties its event loop and has nothing else to schedule (ie, no remaining work to do)
//not emitted for explicit termination, such as process.exit() or uncaught exceptions
        console.log("before exit");
    });

    process.on('exit', function(code) //CAUTION: no async code in here
    {
//only emitted when node exits explicitly by process.exit() or implicitly by the event loop draining
//no way to prevent exit at this point
        console.log('About to exit with code: %d'.red, code);
    });
}

//eof