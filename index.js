
require('dotenv').config()											// add DotEnv to support process.env local vars
var port = process.env.PORT || 3000       // set our port

var express			= require('express')
var cookieParser 	= require('cookie-parser')	
var timeout			= require('express-timeout-handler')					// support read/write cookies for hash
var cors 			= require('cors')								// support cors
var passport 		= require('passport')							// easy login
var GoogleStrategy 	= require('passport-google-oauth20').Strategy	//easy login Google
var InstagramStrategy = require('passport-instagram').Strategy
var sha1			= require('sha1')								// support SHA hashing
var request = require ('request')

var tools			= require('./tools')



var mongoose = require('mongoose')
var findOrCreate = require('mongoose-findorcreate')



var db = require('./db')

//var mongoose = db.mongoose
//var findOrCreate = db.findOrCreate


var app = express()
app.use(cookieParser())
app.use(cors())

//options for timeout settings
var options = {
  timeout: 10000,
  onTimeout: function(req, res) {
	res.redirect("/timeOut")
  },
  onDelayedResponse: function(req, method, args, requestTime) {
    console.log(`Attempted to call ${method} after timeout`)
  },
  disable: ['write', 'setHeaders', 'send', 'json', 'end']
}
 
app.use(timeout.handler(options))



// TESTING require OF MY OWN .JS FILE
console.log("========================\n")
//console.log(typeof tools.foo); // => 'function'
//console.log(typeof tools.bar); // => 'function'
//console.log(typeof tools.zemba); // => undefined
console.log("= = = Server is UP = = =")
console.log("========================\n")

mongoose.connect(process.env.MONGODB_URI, {useNewUrlParser: true})
var Schema = mongoose.Schema;

var userSchema = new mongoose.Schema({
  googleID: String,
  googleToken: String,
});
userSchema.plugin(findOrCreate)

var User = mongoose.model('User', userSchema)

var pairingSchema = new mongoose.Schema({
  hash: String,
  user: {type: Schema.Types.ObjectId, ref: 'User'}
});

var Pairing = mongoose.model('Pairing', pairingSchema)


console.log("= = = Schemas & Models up and running = = =")
// POST https://photoslibrary.googleapis.com/v1/mediaItems:search




app.get('/gphotos', function(req, res) {
	
	if (!req.query.hash){
		
		res.json({
			"error": "please authenticate - hash missing",
			"errorCode": 401	

		})
	}
	
		 Pairing.findOne({"hash": req.query.hash}).populate('user').exec( function(err, pairing){
			 if (err) {
				console.log("Error in pairing")
				res.json({
				"error": "please authenticate - hash mismatch",
				"createNewPairingUrl": process.env.MY_DOMAIN+"/createNewPairing",
				"errorCode": 401	
				})
				return
			}
			if (pairing){
				
				if (!pairing.user){
					console.log("= = >> ERROR: found pairing but it has no user")
					res.json({
					"error": "This hash has no user associated with it",
					"errorCode": 401,
					"createNewPairingUrl": process.env.MY_DOMAIN+"/createNewPairing"
					})
					return
				}
				var user = pairing.user
				console.log("contents of token: ",user.googleToken)
				
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
					headers:{'Authorization': 'Bearer ' +user.googleToken}
				
				}, function(err, response, body){
					if (err) {
						res.json({
						"error": "please authenticate",
						"errorCode": 401	
						})
						return
					}
					
					if ((body.error)){
						console.log("body.error FOUND!!!")
						res.json({
						"error": "please authenticate again - invalid auth token",
						"errorCode": 401	
						})
						return
						
					}
					
					if (body.mediaItems){
						console.log("body.mediaItems FOUND!!!")
						res.json(body.mediaItems)
						console.log("this is the result from /gphotos page: \n")
						console.log(body) 
						return
						}
			  })	
			}		 
		 })
})

app.get('/login', function(req, res) {
		res.json({
		"error": "OK",
		"errorCode": 200	
		})
	
})

app.get('/timeOut', function(req, res) {
		res.json({
		"error": "Auth Server returns a Timeout error. Maybe retry later",
		"errorCode": 503	
		})
	
})

app.get('/photos', function(req, res) {
	res.json({
		"error": "your client is using /photos. it is obsolete. replace /photos in your client code to /gphotos",
		"newGooglePhotosEndPoint": process.env.MY_DOMAIN+"/gphotos?hash="+(req.query.hash || ""),
		"errorCode": 401	
	})
})


app.use(express.static('public'))

app.get('/createNewPairing', function(req, res) {
		
		var newPairing = new Pairing({ 'hash': sha1((new Date()-0)+process.env.HASH_SALT) })
		newPairing.save(function (err, newPairing) {
			if (err) return console.error(err)
			pairingUrl = process.env.MY_DOMAIN+'/pair/'+newPairing.hash
			res.json({
				"url": pairingUrl,
				"hash": newPairing.hash
			})
		 })
});
passport.use(new InstagramStrategy({
	clientID: process.env.INSTAGRAM_CLIENT_ID,
	clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
	callbackURL: process.env.MY_DOMAIN+"/auth/instagram/callback"
},
function(accessToken, refreshToken, profile, done) {
	User.findOrCreate({ instagramId: profile.id }, function (err, user) {
		return done(err, user);
	});
}
));
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
      User.findOrCreate({ 'googleID': profile.id }, function (err, user) {
		if (err){
			console.log("= = = error in findOrCreate = = =")
			return console.error(err)
		}
		console.log("New Hash Obtained:")
		console.log({'hash': req.cookies.hash})
		Pairing.findOne({'hash': req.cookies.hash}, function (err, pairing){
			if (err) {
				
				console.log("=== No Pairing Found ===")
				return console.error(err)
			}
			user.googleToken=token
			user.save()
			pairing.user=user
			pairing.save()
			
			return done()
		})
		//return done(err, user)
	  })
  }
))

// GET /auth/google
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Google authentication will involve redirecting
//   the user to google.com.  After authorization, Google will redirect the user
//   back to this application at /auth/google/callback
app.get('/auth/google',passport.authenticate('google', { scope: ['profile','https://www.googleapis.com/auth/photoslibrary.readonly']}));

app.get('/pair/:hash', function(req, res)
		{
			res.cookie('hash', req.params.hash)
			console.log("added client cookie")
			res.redirect('/auth/google')
		})
// GET /auth/google/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login'}),
  function(req, res) {
    res.redirect('/login')
  })


	app.get('/auth/instagram',
  passport.authenticate('instagram'));

	app.get('/auth/instagram/callback', 
		passport.authenticate('instagram', { failureRedirect: '/login' }),
		function(req, res) {
			// Successful authentication, redirect home.
			res.redirect('/login');
		});



//keep this last (for convention's sake?)
app.listen(port);

