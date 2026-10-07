import fs from "node:fs";
import process from "node:process";
import {compileKriegerNativeAuthoring} from "./native-authoring-compiler.mjs";

function readInput(path){
  if(path&&path!=="-")return fs.readFileSync(path,"utf8");
  return fs.readFileSync(0,"utf8");
}

const input=process.argv[2]??"-";
const output=process.argv[3]??"-";
const recipe=JSON.parse(readInput(input));
const plan=compileKriegerNativeAuthoring(recipe);
const json=JSON.stringify(plan,null,2)+"\n";
if(output==="-")process.stdout.write(json);
else fs.writeFileSync(output,json);
