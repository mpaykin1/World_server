export const BLOCK = Object.freeze({ AIR:0, GRASS:1, DIRT:2, STONE:3, SAND:4, WOOD:5, LEAVES:6, SNOW:7, WATER:8, GLASS:9, BRICK:10, PLANK:11, COAL:12, IRON:13 });
export const BLOCKS = {
  0:{name:'Воздух',color:0x000000,solid:false},
  1:{name:'Трава',color:0x5f9f43,solid:true},
  2:{name:'Земля',color:0x795238,solid:true},
  3:{name:'Камень',color:0x777d82,solid:true},
  4:{name:'Песок',color:0xd8c17a,solid:true},
  5:{name:'Дерево',color:0x80522e,solid:true},
  6:{name:'Листва',color:0x3d7d38,solid:true,alpha:.9},
  7:{name:'Снег',color:0xe9f4ff,solid:true},
  8:{name:'Вода',color:0x3f8fe8,solid:false,alpha:.58},
  9:{name:'Стекло',color:0xb8e9f4,solid:true,alpha:.45},
 10:{name:'Кирпич',color:0xa44c3d,solid:true},
 11:{name:'Доски',color:0xb6884d,solid:true},
 12:{name:'Уголь',color:0x35383b,solid:true},
 13:{name:'Железо',color:0xb7a89b,solid:true}
};
export const HOTBAR = [BLOCK.GRASS,BLOCK.DIRT,BLOCK.STONE,BLOCK.SAND,BLOCK.WOOD,BLOCK.PLANK,BLOCK.GLASS,BLOCK.BRICK,BLOCK.SNOW];
