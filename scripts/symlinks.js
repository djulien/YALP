//set up symlinks

var colors = require('colors');
var shell = require('shelljs/global');

//sym link my-plugins so they can be "require"d:
console.log("sym link my-plugins ...".green);
cd('my-plugins');
npm('link');
cd('../node_modules');
npm('link', 'my-plugins');
cd('..');

//sym link my-projects so they can be "require"d:
console.log("sym link my-plugins ...".green);
cd('my-projects');
npm('link');
cd('../node_modules');
npm('link', 'my-projects');
cd('..');

console.log("done!".green);


function npm(args)
{
    exec('npm ' + args.join(' '), function(code, output)
    {
        console.log('code: ', code, 'output:', output);
    });
}

//eof
