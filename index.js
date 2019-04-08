var sha1 = require('sha1');
var express    = require('express');
require('dotenv').config()
var app        = express();
var port = process.env.PORT || 3000;        // set our port
var passport = require('passport');
var request = require ('request');
var GoogleStrategy = require('passport-google-oauth20').Strategy;
var myToken = '';
var mongoose = require('mongoose');



mongoose.connect(process.env.MONGODB_URI, {useNewUrlParser: true});
var Schema = mongoose.Schema;

var userSchema = new mongoose.Schema({
  name: String,
  token: String,
});


var User = mongoose.model('User', userSchema);

var pairingSchema = new mongoose.Schema({
  hash: String,
  user: {type: Schema.Types.ObjectId, ref: 'User'}
});

var Pairing = mongoose.model('Pairing', pairingSchema);

// POST https://photoslibrary.googleapis.com/v1/mediaItems:search

app.get('/photos', function(req, res) {
	request(
		{
			url: 'https://photoslibrary.googleapis.com/v1/mediaItems:search',
			qs: {'fields': 'mediaItems(baseUrl)'},
			method: 'POST',
			json: {
			  "pageSize": req.query.pageSize || 20,
			  "filters": {
				"mediaTypeFilter": {
				  "mediaTypes": [
					"PHOTO"
				  ]
				},
				"contentFilter": {
				  "excludedContentCategories": [
					"SCREENSHOTS",
					"DOCUMENTS",
					"NONE"
				  ]
				}
			  }
			},
			headers:{'Authorization': 'Bearer ' +myToken}
		
		}, function(err, response, body){
			res.json(body.mediaItems);
			console.log(body);  
	  })
    
});

app.get('/login', function(req, res) {
		res.send('GSuite Login Completed.\n Unity and AFrame Apps can now use APIs');
	
});
app.use(express.static('public'));

app.get('/createNewPairing', function(req, res) {
		
		var newPairing = new Pairing({ hash: sha1((new Date()-0)+process.env.HASH_SALT) });
		newPairing.save(function (err, newPairing) {
			if (err) return console.error(err);
			pairingUrl = process.env.MY_DOMAIN+'/auth/google?hash='+newPairing.hash;
			res.send(pairingUrl);
		 });
		
		
		
		
		
	
});

// Use the GoogleStrategy within Passport.
//   Strategies in passport require a `verify` function, which accept
//   credentials (in this case, a token, tokenSecret, and Google profile), and
//   invoke a callback with a user object.
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.MY_DOMAIN+"/auth/google/callback",  // using the env.My_DOMAIN I can use this both on localhost and server
	passReqToCallback: true
  },
  function(req, token, tokenSecret, profile, done) {
      User.findOrCreate({ name: profile.id }, function (err, user) {
        Pairing.find({hash: req._toParam}, function (err, pairing){
			user.token=token;
			pairing.user=user;
			pairing.save();
		});
		return done(err, user);
      });
  }
));

// GET /auth/google
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Google authentication will involve redirecting
//   the user to google.com.  After authorization, Google will redirect the user
//   back to this application at /auth/google/callback
app.get('/auth/google',function(req,res,next){
			req._toParam = req.params.hash;
			passport.authenticate('google', { scope: ['profile','https://www.googleapis.com/auth/photoslibrary.readonly']}, function (req, res, next){
				return next();
			});
			}
		);

// GET /auth/google/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login'}),
  function(req, res) {
    res.redirect('/login');
  });




//keep this last (for convention's sake?)
app.listen(port);

