
require('dotenv').config()				// add DotEnv to support process.env local vars
var port = process.env.PORT || 3000       // set our port to the environment port or 3000 (local host)

var express			= require('express') // adss express framework
var cookieParser 	= require('cookie-parser')	// support read/write cookies for hash
var bodyParser 		= require('body-parser')  // easy body parser for my JSONs
var timeout			= require('express-timeout-handler')	// better timeout handler than I can code on my own.		
var cors 			= require('cors')								// support CORS
var passport 		= require('passport')							// easier login to multiple services
var GoogleStrategy 	= require('passport-google-oauth20').Strategy	//easy login Google
var InstagramStrategy = require('passport-instagram').Strategy		//easy login Insta
var request = require ('request')									//easy http/https request calls with auto redirect support
var sha1			= require('sha1')								// support SHA hashing
var mongoose = require('mongoose')									// adds MongoDB moongoose framework
var findOrCreate = require('mongoose-findorcreate')					// adds findOrCreate functionality to mongoose


// define our express app
var app = express()
app.use(cookieParser())	
app.use(bodyParser.json())
app.use(cors())	//  This line to magically solves all cross domain error problems!

// Timeout handling options Start
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
// Timeout handling options End
app.use(timeout.handler(options))

console.log("= = = Server is UP = = =")
console.log("========================\n")


// === DB MODEL DEFINITION START ===

//initialize connection to the database
mongoose.connect(process.env.MONGODB_URI, {useNewUrlParser: true})

var Schema = mongoose.Schema;

// Defines the user schema
var userSchema = new Schema({
	googleID: String,
	googleToken: String,
	instagramID: String,
	instagramToken: String
});
userSchema.plugin(findOrCreate)

// Defines the user model we will actually refer to
var User = mongoose.model('User', userSchema)

// Defines the pairing schema
var pairingSchema = new mongoose.Schema({
  hash: String,
  user: {type: Schema.Types.ObjectId, ref: 'User'}
});
pairingSchema.plugin(findOrCreate)

// Defines the pairing model we will actually refer to
var Pairing = mongoose.model('Pairing', pairingSchema)

console.log("= = = Schemas & Models up and running = = =\n")
// === MODEL DEFINITION END ===


// === GET Request Route Definitions Start ===

app.get('/login', function(req, res) {
	res.json({
		"error": "OK",
		"errorCode": 200	
	})
	
})

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


app.get('/pair/:hash', function(req, res)
{
	res.cookie('hash', req.params.hash)
	console.log("added client cookie")
	
	if (!req.query.name){
		res.json({
			"instagram_url": process.env.MY_DOMAIN+"/auth/instagram",
			"google_url": process.env.MY_DOMAIN+"/auth/google",
			"hash": req.params.hash
		})
	} else {
		var name=req.query.name.toLowerCase()
		res.redirect(name == "google" ? "/auth/google" : name == "instagram" ? "/auth/instagram" : "/pair/"+req.params.hash )	
	}
})

app.get('/timeOut', function(req, res) {
	res.json({
		"error": "Auth Server returns a Timeout error. Maybe retry later",
		"errorCode": 503	
	})
	
})

app.get('/Success', function(req, res) {
	res.json({
		"error": " Success!",
		"errorCode": 200	
	})
	
})

// http GET request for google photos
app.get('/gphotos', function(req, res) { 
	
	if (!req.query.hash){ //if cache is missing return error 401
		
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
				if (!user.googleToken){ // if the user exists for this pairing but doesn't have a google token yet
					console.log("ERROR. user has no googleToken")
					res.json({
						"error": "This user has no googleToken associated with it",
						"errorCode": 401,
						"existingPairingUrl": process.env.MY_DOMAIN+"/pair/"+req.query.hash,
						"createNewPairingUrl": process.env.MY_DOMAIN+"/createNewPairing"
						})
						return
				}
				console.log("contents of google token: ",user.googleToken)
				
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
						console.log("= = = body.error FOUND = = = \n" + JSON.parse(body.error))
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

//http GET request for instagram
app.get('/instaphotos', function(req, res) {	
	
	if (!req.query.hash){	//if cache is missing return error 401
		
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
			if (!user.instagramToken){
				console.log("ERROR. user has no instagramToken")
				res.json({
					"error": "This user has no instagramToken associated with it",
					"errorCode": 401,
					"existingPairingUrl": process.env.MY_DOMAIN+"/pair/"+req.query.hash,
					"createNewPairingUrl": process.env.MY_DOMAIN+"/createNewPairing"
				})
				return
			}
			console.log("contents of insta token: ",user.instagramToken)
			
			request(
				{
					url: 'https://api.instagram.com/v1/users/self/media/recent?access_token='+user.instagramToken,
					qs: {'fields': 'mediaItems(baseUrl)'},
					method: 'GET',
					headers:{'Authorization': 'Bearer ' +user.instagramToken}
					
				}, function(err, response, body){
					if (err) {
						res.json({
							"error": "please authenticate",
							"errorCode": 401	
						})
						return
					}
					
					if (body.error){
						console.log("body.error FOUND!!!")
						res.json({
							"error": "please authenticate again - invalid auth token",
							"errorCode": 401	
						})
						return
					}
					
					if (body){
						console.log("body FOUND!!!")
						body = JSON.parse(body)
						if (body.data){
							console.log("body.data found!")
							body = body.data
							var newbody = new Array()
							body.forEach(element => {
								if (element['images']['standard_resolution']){
									console.log("found element.images.standard_res")
									newbody.push(element['images']['standard_resolution'])
								}
							})
							body = newbody
							class PhotoUrl{
								constructor(baseUrl='') {
									this.baseUrl = baseUrl
								}
							}
							var photoUrls = new Array()
							body.forEach(element => {
								var newUrl = new PhotoUrl
								newUrl.baseUrl=(element['url'])
								photoUrls.push(newUrl)
							});
							body = photoUrls
						};
						res.json(body)
						console.log("this is the result from /instaphotos page: \n")
						console.log(body) 
						return
					}
				})	
			}		 
		})
	})
	
	
	app.get('/photos', function(req, res) { // if some user still uses the legacy route
		res.json({
			"error": "your client is using /photos. it is obsolete. replace /photos in your client code to /gphotos",
			"newGooglePhotosEndPoint": process.env.MY_DOMAIN+"/gphotos?hash="+(req.query.hash || ""),
			"errorCode": 401	
		})
	})
	
	
	
	
	app.get('/auth/google',passport.authenticate('google', { scope: ['profile', 'email','https://www.googleapis.com/auth/photoslibrary.readonly']}));
	
	app.get('/auth/google/callback', 
	passport.authenticate('google', { failureRedirect: '/login'}),
	function(req, res) {
		res.redirect('/Success')
	})
	
	app.get('/auth/instagram',
	passport.authenticate('instagram'));
	
	app.get('/auth/instagram/callback', 
	passport.authenticate('instagram', { successRedirect: '/Success', failureRedirect: '/login' }),
	function(req, res) {
		console.log("function alive!")
		// Successful authentication, redirect home.
		res.redirect('/Success');
	});
	// === GET Request Route Definitions End ===
	
	
	// === Passport.JS Strategies Start ===

	// insta passport strategy
	passport.use(new InstagramStrategy({
		clientID: process.env.INSTAGRAM_CLIENT_ID,
		clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
		callbackURL: process.env.MY_DOMAIN+"/auth/instagram/callback",
		passReqToCallback: true
	},
	function(req, accessToken, refreshToken, profile, done) {
		User.findOrCreate({ 'instagramID': profile.id }, function (err, user) {
			if (err){
				console.log("= = = error in instagramID findOrCreate = = =")
				console.error(err)
				return done(err) 
			}
			
			Pairing.findOne({'hash': req.cookies.hash}, function (err, pairing){
				if (err) {
					
					console.log("=== No Pairing or hash cookie Found (insta)===")
					console.error(err)
					return done(err)
				}
				user.instagramToken=accessToken
				user.save()
				pairing.user=user
				pairing.save()
				
				return done()
			})
			//	return done(err, user);
		});
	}
	));


	// Google passport strategy
	passport.use(new GoogleStrategy({
		clientID: process.env.GOOGLE_CLIENT_ID,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET,
		callbackURL: process.env.MY_DOMAIN+"/auth/google/callback",  // using the env.My_DOMAIN I can use this both on localhost and server
		passReqToCallback: true
	},
	function(req, token, tokenSecret, profile, done) {
		User.findOne({})
		User.findOrCreate({ 'googleID': profile.id }, function (err, user) {
			if (err){
				console.log("= = = error in googleID findOrCreate = = =")
				return console.error(err)
			}
			console.log("Getting client Hash from Cookie:\n" + req.cookies.hash)
			Pairing.findOne({'hash': req.cookies.hash}, function (err, pairing){
				if (err) {
					
					console.log("=== No Pairing or hash cookie Found (google)===")
					return console.error(err)
				}
				user.googleToken=token
				user.save()
				pairing.user=user
				pairing.save()
				return done()
			})
		})
	}
	))
	// === Passport.JS Strategies END ===
	
	//required for the initial Google site verification process
	app.use(express.static('public'))
	
	//keep this last (for convention's sake?)
	app.listen(port);
	
	