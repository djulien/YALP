'use strict';

//require('longjohn');
require('events').EventEmitter.prototype._maxListeners = 3; //catch leaks sooner

//https://nodejs.org/api/process.html#process_event_unhandledrejection
process.on('unhandledRejection', function(reason, p)
{
    console.log("Unhandled Rejection at: Promise ", p, " reason: ", reason);
    // application specific logging, throwing an error, or other logic here
});


//https://nodejs.org/api/process.html#process_event_uncaughtexception
process.on('uncaughtException', function(err)
{
  console.log('Caught exception: ', err);
  console.log("stack:", err.stack);
  process.exit(1); //process is in unknown state at this point; safest action is to exit the process
});


// CTRL+C
//http://stackoverflow.com/questions/14031763/doing-a-cleanup-action-just-before-node-js-exits
if (false)
process.on('SIGINT', function()
{
  console.log('Got SIGINT.');
//process.stdin.resume();//so the program will not close instantly
  process.exit(2);
});


process.on('exit', function(code)
{
  // do *NOT* do this
//  setTimeout(function() {
//    console.log('This will not run');
//  }, 0);
    console.log('process.exit(%d)', code);
    console.log("stack:", (new Error()).stack);
});

//eof
