'use strict';

class SpriteAnimator{
  constructor(options={}){
    this.image=options.image||null;
    this.frameWidth=Math.max(1,Number(options.frameWidth)||16);
    this.frameHeight=Math.max(1,Number(options.frameHeight)||24);
    this.clips=options.clips||{idle:{frames:[0],fps:1,loop:true}};
    this.clipName=options.clip||Object.keys(this.clips)[0];
    this.frameIndex=0;
    this.time=0;
    this.x=Number(options.x)||0;
    this.y=Number(options.y)||0;
    this.scale=Number(options.scale)||1;
    this.flipX=Boolean(options.flipX);
    this.anchorX=Number.isFinite(options.anchorX)?options.anchorX:.5;
    this.anchorY=Number.isFinite(options.anchorY)?options.anchorY:0;
    this.drawFrame=typeof options.drawFrame==='function'?options.drawFrame:null;
  }

  play(name,restart=false){
    if(!this.clips[name])return false;
    if(name!==this.clipName||restart){
      this.clipName=name;
      this.frameIndex=0;
      this.time=0;
    }
    return true;
  }

  update(dt){
    const clip=this.clips[this.clipName];
    if(!clip||clip.frames.length<2||!clip.fps)return;
    this.time+=Math.max(0,dt);
    const frameTime=1/clip.fps;
    while(this.time>=frameTime){
      this.time-=frameTime;
      if(this.frameIndex<clip.frames.length-1)this.frameIndex++;
      else if(clip.loop!==false)this.frameIndex=0;
    }
  }

  currentFrame(){
    const clip=this.clips[this.clipName];
    return clip?.frames?.[this.frameIndex]??0;
  }

  draw(ctx,camera){
    const frame=this.currentFrame();
    const p=camera.worldToScreen(this.x,this.y);
    const cell=camera.cellPixels()*this.scale;
    const dw=this.frameWidth*cell,dh=this.frameHeight*cell;
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    ctx.translate(Math.round(p.x),Math.round(p.y));
    if(this.flipX)ctx.scale(-1,1);
    const dx=-dw*this.anchorX,dy=-dh*(1-this.anchorY);
    if(this.drawFrame){
      this.drawFrame(ctx,frame,dx,dy,dw,dh,cell);
    }else if(this.image){
      const cols=Math.max(1,Math.floor(this.image.width/this.frameWidth));
      const sx=(frame%cols)*this.frameWidth;
      const sy=Math.floor(frame/cols)*this.frameHeight;
      ctx.drawImage(
        this.image,sx,sy,this.frameWidth,this.frameHeight,
        Math.round(dx),Math.round(dy),Math.round(dw),Math.round(dh)
      );
    }
    ctx.restore();
  }

  state(){
    return{
      clip:this.clipName,frame:this.currentFrame(),
      frameIndex:this.frameIndex,x:this.x,y:this.y,flipX:this.flipX
    };
  }
}

class SpriteEntity{
  constructor(options={}){
    this.animator=options.animator||new SpriteAnimator(options);
    this.x=Number(options.x)||0;
    this.y=Number(options.y)||0;
    this.vx=0;this.vy=0;
    this.speed=Number(options.speed)||8;
    this.jumpSpeed=Number(options.jumpSpeed)||12;
    this.gravity=Number(options.gravity)||-28;
    this.onGround=false;
    this.aimAngle=0;
    this.moveInput=0;
  }

  move(direction){
    this.moveInput=Math.max(-1,Math.min(1,Number(direction)||0));
    if(this.moveInput)this.animator.flipX=this.moveInput<0;
  }

  aim(angle){this.aimAngle=Number(angle)||0;}

  jump(){
    if(!this.onGround)return false;
    this.vy=this.jumpSpeed;
    this.onGround=false;
    return true;
  }

  update(dt,isSolid=()=>false){
    this.vx=this.moveInput*this.speed;
    this.vy+=this.gravity*dt;
    const nx=this.x+this.vx*dt;
    if(!isSolid(Math.round(nx),Math.floor(this.y))){
      this.x=nx;
    }else this.vx=0;
    const ny=this.y+this.vy*dt;
    const footY=Math.floor(ny);
    if(this.vy<=0&&isSolid(Math.round(this.x),footY)){
      this.y=footY+1;
      this.vy=0;
      this.onGround=true;
    }else{
      this.y=ny;
      this.onGround=false;
    }
    this.animator.x=this.x;
    this.animator.y=this.y;
    const clip=this.onGround
      ?(Math.abs(this.vx)>.1?'walk':'idle')
      :'air';
    if(this.animator.clips[clip])this.animator.play(clip);
    this.animator.update(dt);
  }

  draw(ctx,camera){this.animator.draw(ctx,camera);}
}

module.exports={SpriteAnimator,SpriteEntity};
