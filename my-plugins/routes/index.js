//http://expressjs.com/guide/routing.html
//http://expressjs.com/guide/using-middleware.html

var numroutes = 0;
global.seqnum = 0; //mainly for trace/debug convenience

var path = require('path');
var require_glob = require('node-glob-loader').load; //https://www.npmjs.com/package/node-glob-loader

module.exports = setup; //commonjs
//console.log("route dirname ", __dirname);

function setup(app)
{
    require_glob(__dirname + '/**/*[!-bk].js', {strict: true, noself: true}, function(exported, filename)
    {
//        var relpath = path.relative(__dirname /*path.dirname(require.main.filename)*/, filename);
        var method = path.relative(__dirname, filename).split(path.sep, 1)[0]; //parent folder == http method
//        console.log("route", filename, __filename);
//        if (path.basename(filename) == path.basename(__filename)) return; //skip self
        console.log("route[%d] %s %s '%s'".blue, numroutes++, method, exported.uri || '(any)', path.relative(path.dirname(require.main.filename), filename)); //, exported);
//        if (path.basename(filename) == path.basename(__filename)) return; //skip self
        if (method == "socket") exported(app);
        else if (exported.uri) app[method](exported.uri, exported.handler);
        else app[method](exported.handler);
    })./*done*/ then(function() { console.log("routes loaded: %d".green, numroutes); });

    app.on('close', function ()
    {
        console.log("closed".red);
    //    redis.quit();
    });
}

//console.log("TODO: routes".red);
//module.exports = function() {}

//eof
