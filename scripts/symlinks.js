//set up symlinks

var DEBUG = false;
var SUDO = ''; //set this to 'sudo' if needed; see:
//   http://justjs.com/posts/npm-link-developing-your-own-npm-modules-without-tears
//   OR http://stackoverflow.com/questions/10081293/install-npm-into-home-directory-with-distribution-nodejs-package-ubuntu


var colors = require('colors');
var shell = require('shelljs/global'); //https://www.npmjs.com/package/shelljs

//http://blog.keithcirkel.co.uk/how-to-use-npm-as-a-build-tool/

exec('node --version', exec_out);
exec('npm --version', exec_out);


//sym link my-plugins so they can be "require"d:
console.log("sym link my-plugins ...".green);
cd('my-plugins');
if (!DEBUG) exec(SUDO + ' npm link', exec_out);
cd('../node_modules');
if (!DEBUG) exec(SUDO + ' npm link my-plugins', exec_out);
cd('..');

//sym link my-projects so they can be "require"d:
console.log("sym link my-projects ...".green);
cd('my-projects');
if (!DEBUG) exec(SUDO + ' npm link', exec_out);
cd('../node_modules');
if (!DEBUG) exec(SUDO + ' npm link my-projects', exec_out);
cd('..');

console.log("done!".green);


function exec_out(code, output)
{
    console.log('code: ', code, 'output:', output);
}

//eof
