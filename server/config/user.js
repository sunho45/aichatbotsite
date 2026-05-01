import mongoose from "mongoose";



const userschema=new mongoose.schema(
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

const user=mongoose.model("User",userschema);

export default user;