'use strict';

class MatterCamera {
  constructor(options = {}) {
    this.x=Number(options.x)||0;
    this.y=Number(options.y)||0;
    this.zoom=Number(options.zoom)||1;
    this.target={x:this.x,y:this.y,zoom:this.zoom};
    this.viewport={width:Number(options.width)||640,height:Number(options.height)||360};
    this.baseCellPixels=Number(options.baseCellPixels)||3;
    this.pixelPerfect=options.pixelPerfect!==false;
    this.shakeTime=0;
    this.shakePower=0;
    this.shakeOffset={x:0,y:0};
  }

  resize(width,height){
    this.viewport.width=Math.max(1,width);
    this.viewport.height=Math.max(1,height);
  }

  cutTo(x,y,zoom=this.zoom){
    this.x=x;this.y=y;this.zoom=zoom;
    this.target={x,y,zoom};
  }

  animateTo(x,y,zoom=this.zoom){
    this.target={x,y,zoom};
  }

  shake(power=.8,duration=.18){
    this.shakePower=Math.max(this.shakePower,power);
    this.shakeTime=Math.max(this.shakeTime,duration);
  }

  update(dt){
    const k=1-Math.pow(.001,Math.max(0,dt));
    this.x+=(this.target.x-this.x)*k;
    this.y+=(this.target.y-this.y)*k;
    this.zoom+=(this.target.zoom-this.zoom)*k;
    if(this.shakeTime>0){
      this.shakeTime=Math.max(0,this.shakeTime-dt);
      const t=this.shakeTime*91.7;
      this.shakeOffset.x=Math.sin(t*2.13)*this.shakePower;
      this.shakeOffset.y=Math.cos(t*2.71)*this.shakePower;
      this.shakePower*=Math.pow(.04,dt);
    }else{
      this.shakeOffset.x=0;this.shakeOffset.y=0;
    }
  }

  cellPixels(){
    const raw=this.baseCellPixels*this.zoom;
    return this.pixelPerfect?Math.max(1,Math.round(raw)):Math.max(.25,raw);
  }

  worldToScreen(x,y){
    const scale=this.cellPixels();
    return {
      x:this.viewport.width/2+(x-this.x+this.shakeOffset.x)*scale,
      y:this.viewport.height/2-(y-this.y+this.shakeOffset.y)*scale
    };
  }

  screenToWorld(x,y){
    const scale=this.cellPixels();
    return {
      x:(x-this.viewport.width/2)/scale+this.x-this.shakeOffset.x,
      y:(this.viewport.height/2-y)/scale+this.y-this.shakeOffset.y
    };
  }

  visibleBounds(padding=2){
    const scale=this.cellPixels();
    const hw=this.viewport.width/(2*scale)+padding;
    const hh=this.viewport.height/(2*scale)+padding;
    return {
      minX:Math.floor(this.x-hw),maxX:Math.ceil(this.x+hw),
      minY:Math.floor(this.y-hh),maxY:Math.ceil(this.y+hh)
    };
  }
}

module.exports={MatterCamera};
