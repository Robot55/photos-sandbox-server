
require('dotenv').config()											// add DotEnv to support process.env local vars
var mongoose = require('mongoose')
var findOrCreate = require('mongoose-findorcreate')




function go(){
    mongoose.connect(process.env.MONGODB_URI, {useNewUrlParser: true})
    var Schema = mongoose.Schema;

    var userSchema = new mongoose.Schema({
    name: String,
    token: String,
    });
    userSchema.plugin(findOrCreate)

    var User = mongoose.model('User', userSchema)

    var pairingSchema = new mongoose.Schema({
    hash: String,
    user: {type: Schema.Types.ObjectId, ref: 'User'}
    });

    var Pairing = mongoose.model('Pairing', pairingSchema)
}















module.exports.mongoose = mongoose
module.exports.findOrCreate = findOrCreate
