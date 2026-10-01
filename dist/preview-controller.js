// A newer selection owns the screen, even when older image loads finish later.
export function createPreviewSelection({load,onSelect,onReady,onError}) {
  let revision=0;
  return {
    select(state,options={}) {
      const ticket=++revision;
      onSelect(state,options);
      const ready=screen=>{if(ticket===revision)onReady(screen,state,options);};
      const failed=error=>{if(ticket===revision)onError(error,state);};
      try {
        const screen=load(state);
        if(screen?.then)return screen.then(ready,failed);
        ready(screen);
      } catch(error) {failed(error);}
    }
  };
}
