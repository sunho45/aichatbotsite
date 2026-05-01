const mongoose = require("mongoose");



const userschema = new mongoose.Schema(
{



email:{
type:String,
required : true,
unique: true,
trim:true,



},
password:{
    type:String,
    required:true,
},




}



)

const user = mongoose.model("User", userschema);

module.exports = user;
