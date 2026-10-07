import {buildGothicTower,buildGothicViaduct} from '../gothic-architecture.mjs';
import {VOXEL_MOD_API_VERSION} from '../voxel-mod-registry.mjs';

export const GOTHIC_CITY_MOD_ID='gothic-city';

export function createGothicCityMod(){
  return {
    id:GOTHIC_CITY_MOD_ID,
    version:'0.1.0',
    apiVersion:VOXEL_MOD_API_VERSION,
    license:'project-original',
    provenance:'World_server original procedural generators',
    structures:{
      'gothic-city:tower':{
        title:'Gothic stone tower',
        category:'architecture',
        blueprintVersion:1,
        generate(params){return buildGothicTower(params);},
      },
      'gothic-city:viaduct':{
        title:'Gothic multi-span viaduct',
        category:'infrastructure',
        blueprintVersion:1,
        generate(params){return buildGothicViaduct(params);},
      },
    },
  };
}
