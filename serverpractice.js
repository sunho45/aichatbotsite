const fs=require("fs");
const http=require("http");
const path=require("path");
const {Readable}=require("stream");
const PORT= NUMBER(process.env.PORT||3000);

function arraysum(list){

const sum=list.reduce((acc,person)=>acc+person.age,0);
return sum;


}

function arraysumtwo(list){
    const newlist=list.map(( person)=>({...person,age:person.age*2}))
    const sum=newlist.reduce((acc,person)=>acc+person.age,0);
}


module.exports={arraysum,arraysumtwo};