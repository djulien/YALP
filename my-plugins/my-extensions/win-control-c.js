//from http://stackoverflow.com/questions/10021373/what-is-the-windows-equivalent-of-process-onsigint-in-node-js

if (process.platform === "win32")
{
  var rl = require("readline").createInterface(
  {
    input: process.stdin,
    output: process.stdout
  });

  rl.on("SIGINT", function ()
  {
    process.emit("SIGINT");
  });
}

//eof
