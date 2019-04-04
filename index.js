var express    = require('express');
require('dotenv').config()
var app        = express();
var port = process.env.PORT || 3000;        // set our port
var passport = require('passport');
var request = require ('request');
var GoogleStrategy = require('passport-google-oauth20').Strategy;
var myToken = '';

app.get('/photos', function(req, res) {
	request({url: 'https://photoslibrary.googleapis.com/v1/albums', headers:{'Authorization': 'Bearer ' +myToken}}, function(err, response, body){
		res.json(body);
		console.log(body);  
	  })
    
});

app.get('/login', function(req, res) {
		res.send('you may now go to unity');
	
});




// Use the GoogleStrategy within Passport.
//   Strategies in passport require a `verify` function, which accept
//   credentials (in this case, a token, tokenSecret, and Google profile), and
//   invoke a callback with a user object.
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://photos-sandbox-server.herokuapp.com/auth/google/callback"
  },
  function(token, tokenSecret, profile, done) {
      /*User.findOrCreate({ googleId: profile.id }, function (err, user) {
        return done(err, user);
      });*/
	  console.log(token, tokenSecret);
	  myToken = token;
	  return done();
  }
));

// GET /auth/google
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Google authentication will involve redirecting
//   the user to google.com.  After authorization, Google will redirect the user
//   back to this application at /auth/google/callback
app.get('/auth/google', passport.authenticate('google', { scope: ['profile','https://www.googleapis.com/auth/photoslibrary.readonly'] }));

// GET /auth/google/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });










app.listen(port);

