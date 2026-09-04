'use strict';
const species=require('./creature-species');
const lod=require('./lod');
const runtime=require('./asset-runtime');
module.exports={...species,...lod,...runtime};
