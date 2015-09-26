
//console.log("TODO: cli".red);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Phase 1: CLI, help

var cfg = global.CFG; //default options from config file

//module.exports = handler; //commonjs

var cli = require('commander'); //http://www.npmjs.com/package/commander
var bool = require('my-plugins/utils/bool-checks');

//var pkg = require('./package.json'); //read my package + config settings; CAUTION: sets numeric + bool types

//set default values if missing from config:
//if (!pkg.yalp) pkg.yalp = {}; //easier detection
if (typeof cfg.debug === 'undefined') cfg.debug = "0";
if (typeof cfg.port === 'undefined') cfg.port = "2015"; //"80";
if ((typeof cfg.ui === 'undefined') || bool.istrue(cfg.ui)) cfg.ui = "default";
if (bool.isfalse(cfg.ui)) cfg.ui = "none";
//if (pkg.yalp.serial === "undefined") pkg.yalp.serial = 1;

cli
    .option("-d, --debug [=level]", "set debug level [" + cfg.debug + "]: higher = more, 0 = none", cfg.debug, parseInt)
    .option("-p, --port [=port#]", "select I/O server port# [" + cfg.port + "]", cfg.port, parseInt)
    .option("-u, --ui [=browser]", "launch UI in browser [" + cfg.ui + "]: none = no UI", cfg.ui)
    .version(cfg.pkg.version) //introspect; ver# is at top level
//    .option("-s, --serial <ports>", "list of ports", list)
  .parse(process.argv);

//console.log("args", cli.args, cli.rawArgs);
if (!cli.ui)
    cli.rawArgs.forEach(function(arg) //kludge: commander.js doesn't tell if param was present with no value, so use explicit check
    {
        if ((arg == '-u') || (arg == '--ui')) cli.ui = cfg.ui;
    });

//cli.port *= 1; //use numeric compares
//if (cli.ui === "true") cli.ui = "default";
//console.log("yalp def config: %j\ncli.debug: %s, port: %s, ui: %s, vals: ", pkg.yalp, (typeof cli.debug), (typeof cli.port), (typeof cli.ui), cli.debug, cli.port, cli.ui, isfalse(cli.ui), istrue(cli.ui)); //process.argv.slice(2).length);
if (!cli.port /*!process.argv.slice(2).length*/) cli.help(yellow); //server is required but not configured; show help and exit immediately
if (cli.debug) cli.outputHelp(yellow); //show help if debug is on

module.exports = cli; //return parsed options to caller


function yellow(str)
{
    var colors = require('colors'); //require('colors/safe'); //https://www.npmjs.com/package/colors; http://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
    return colors.yellow(str);
}

//eof
