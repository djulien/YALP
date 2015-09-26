//set up symlinks

var colors = require('colors');
var shell = require('shelljs/global');

//sym link my-plugins so they can be "require"d:
console.log("sym link my-plugins ...".green);
cd('my-plugins');
exec('npm link', exec_out);
cd('../node_modules');
exec('npm link my-plugins', exec_out);
cd('..');

//sym link my-projects so they can be "require"d:
console.log("sym link my-plugins ...".green);
cd('my-projects');
exec('npm link', exec_out);
cd('../node_modules');
exec('npm link my-projects', exec_out);
cd('..');

console.log("done!".green);


exec_out(code, output)
{
    console.log('code: ', code, 'output:', output);
}

//eof
