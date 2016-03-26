//call after boot

/*var sprintf =*/ require('sprintf.js'); //.sprintf;
var email = null; //require('my-plugins/utils/email');
var ipadrs = require('ip'); //https://www.npmjs.com/package/ip
var hostname = require('os').hostname();

if (false) email('I\'m here!', 'hello from %s on %s.', ipadrs.address(), hostname);

var nodemailer = require('nodemailer');

// create reusable transporter object using the default SMTP transport
var transporter = nodemailer.createTransport(options);
var options = 
// 'smtps://djpi2b%40gmail.com:rasby16!@smtp.gmail.com');
{
	service: 'gmail',
	secure: true,
};

// setup e-mail data with unicode symbols
var mailOptions = {
    from: '"Fred Foo 👥" <foo@blurdybloop.com>', // sender address
    to: 'djulien@thejuliens.net', // list of receivers
    subject: 'Hello ✔', // Subject line
    text: 'Hello world 🐴', // plaintext body
    html: '<b>Hello world 🐴</b>' // html body
};

// send mail with defined transport object
transporter.sendMail(mailOptions, function(error, info){
    if(error){
        return console.log(error);
    }
    console.log('Message sent: ' + info.response);
});

//eof
