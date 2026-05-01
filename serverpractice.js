const fs=require("fs");
const http=require("http");
const path=require("path");
const {Readable}=require("stream");
const PORT= NUMBER(process.env.PORT||3000);