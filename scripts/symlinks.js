//set up symlinks

var DEBUG = false;
var colors = require('colors');
var shell = require('shelljs/global'); //https://www.npmjs.com/package/shelljs

//http://blog.keithcirkel.co.uk/how-to-use-npm-as-a-build-tool/

exec('node --version', exec_out);
exec('npm --version', exec_out);


//sym link my-plugins so they can be "require"d:
console.log("sym link my-plugins ...".green);
cd('my-plugins');
if (!DEBUG) exec('npm link', exec_out);
cd('../node_modules');
if (!DEBUG) exec('npm link my-plugins', exec_out);
cd('..');

//sym link my-projects so they can be "require"d:
console.log("sym link my-plugins ...".green);
cd('my-projects');
if (!DEBUG) exec('npm link', exec_out);
cd('../node_modules');
if (!DEBUG) exec('npm link my-projects', exec_out);
cd('..');

console.log("done!".green);


function exec_out(code, output)
{
    console.log('code: ', code, 'output:', output);
}

//eof
