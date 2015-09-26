
var USERNAME = '****';
var PASSWORD = '****';
var SENDER = '****';
var RECIPIENT = '****';

//http://javascript.tutorialhorizon.com/2015/07/02/send-email-node-js-express/
//https://github.com/andris9/nodemailer-smtp-transport#usage

var nodemailer = require('nodemailer');
var colors = require('colors');

//var router = express.Router();
//app.use('/sayHello', router);
//router.post('/', handleSayHello); // handle the route at yourdomain.com/sayHello

var text = 'Hello world from \n\n' + 'me'; //req.body.name;

var mailOptions = {
    from: SENDER, // sender address
    to: RECIPIENT, // list of receivers
    subject: 'Hi from YALP', // Subject line
    text: text //, // plaintext body
    // html: '<b>Hello world ✔</b>' // You can choose to send an HTML body instead
};

//function handleSayHello(req, res) {
    // Not the movie transporter!
//https://github.com/andris9/nodemailer-smtp-transport#usage
    var transporter = nodemailer.createTransport({
    //    port: 995,
//	host: 'server260.com', //'thejuliens.net',
//	secure: true,
//	name: '???',
	debug: true,
        service: 'Gmail',
//	authMethod: 'LOGIN', //??
        auth: {
            user: USERNAME, // Your email id
            pass: PASSWORD, // Your password
        },
    });
//    ...
//    ...
//    ...
//}

transporter.on('log', function (msg) { console.log(("LOG: " + msg).blue); });

transporter.sendMail(mailOptions, function(error, info){
    if(error){
        console.log(("ERROR "+ error).red);
//        res.json({yo: 'error'});
    }else{
        console.log(('Message sent: ' + info.response).green);
//        res.json({yo: info.response});
    };
});


//eof
