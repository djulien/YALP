
//var cfg = global.CFG;
var cfg = require('my-plugins/cmdline').email; //process command line options and config settings

//http://javascript.tutorialhorizon.com/2015/07/02/send-email-node-js-express/
//https://github.com/andris9/nodemailer-smtp-transport#usage

var nodemailer = require('nodemailer');
var colors = require('colors');

module.exports = cfg && emailer; //commonjs


//var router = express.Router();
//app.use('/sayHello', router);
//router.post('/', handleSayHello); // handle the route at yourdomain.com/sayHello
//var text = 'Hello world from \n\n' + 'me'; //req.body.name;

//function handleSayHello(req, res) {
    // Not the movie transporter!
//https://github.com/andris9/nodemailer-smtp-transport#usage
if (cfg)
{
    var transporter = nodemailer.createTransport(cfg.transport);

    if (cfg.debug)
        transporter.on('log', function (data)
        {
//            console.log(("email log: " + data).blue, data);
            console.log("email log: %s msg %s".blue, data.type, data.message);
        });
}


function emailer(title, body)
{
    if (body.match(/%[ds]/))
    {
        var sprintf = require('sprintf');
        body = sprintf.apply(null, Array.prototype.slice.call(arguments, 1)); //exclude title
    }
    var is_html = body.match(/[<>]/); //assume html if tags present
    var mailOptions =
    {
        from: cfg.from,
        to: cfg.to, //can be comma-separated list
        subject: title || 'Hi from YALP',
        get [is_html? 'html': 'text']() { return body; }, //plaintext
    };

    transporter.sendMail(mailOptions, function(err, info)
    {
        if (err)
        {
            console.log(("email ERROR: " + err).red);
//            res.json({yo: 'error'});
        }
        else
        {
            console.log(('email Message sent: ' + info.response).green);
//            res.json({yo: info.response});
        }
    });
}


//eof
