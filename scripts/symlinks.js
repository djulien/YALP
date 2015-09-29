//set up symlinks

var DEBUG = false;
var SUDO = ''; //set this to 'sudo' if needed; see:
//   http://justjs.com/posts/npm-link-developing-your-own-npm-modules-without-tears
//   OR http://stackoverflow.com/questions/10081293/install-npm-into-home-directory-with-distribution-nodejs-package-ubuntu

var colors = require('colors');
var shell = require('shelljs/global'); //https://www.npmjs.com/package/shelljs

//http://blog.keithcirkel.co.uk/how-to-use-npm-as-a-build-tool/

exec_out(exec('node --version')); //, {async: false}, exec_out);
exec_out(exec('npm --version')); //, {async: false}, exec_out);


//sym link my-plugins so they can be "require"d:
console.log("sym link my-plugins ...".green);
cd('my-plugins');
if (!DEBUG) exec_out(exec(SUDO + ' npm link')); //, {async: false}, exec_out);
cd('../node_modules');
if (!DEBUG) exec_out(exec(SUDO + ' npm link my-plugins')); //, {async: false}, exec_out);
cd('..');

//sym link my-projects so they can be "require"d:
console.log("sym link my-projects ...".green);
cd('my-projects');
if (!DEBUG) exec_out(exec(SUDO + ' npm link')); //, {async: false}, exec_out);
cd('../node_modules');
if (!DEBUG) exec_out(exec(SUDO + ' npm link my-projects')); //, {async: false}, exec_out);
cd('..');

console.log("done!".green);


function exec_out(code, output)
{
    if ((arguments.length == 1) && (typeof code === 'object')) exec_out(code.code, code.output);
    else console.log('code: ', code, 'output:', output);
}

//eof
