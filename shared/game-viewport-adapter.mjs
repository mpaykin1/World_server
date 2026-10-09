// Register private engine objects whether the shell loads before or after them.
export function registerGameViewportRenderer(renderer,camera,budget={},host=window){
  const adapter={renderer,camera,...budget};
  let unregister=null;
  const register=()=>{unregister=host.WorldServerGameViewport.registerAdapter(adapter);};
  if(host.WorldServerGameViewport)register();
  else host.addEventListener('worldserverviewportresize',register,{once:true});
  return ()=>{
    host.removeEventListener('worldserverviewportresize',register);
    unregister?.();
  };
}
