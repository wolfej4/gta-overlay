/* Shuffle-bag: all headlines play exactly once before the next randomized pass. */
(function(root){
  'use strict';
  function create(items,random=Math.random){
    const source=Array.isArray(items)?items.slice():[];
    let bag=[],previous=null;
    function refill(){
      bag=source.slice();
      for(let i=bag.length-1;i>0;i--){
        const n=Number(random());
        const roll=Number.isFinite(n)?Math.min(.999999999999,Math.max(0,n)):0;
        const j=Math.floor(roll*(i+1));
        [bag[i],bag[j]]=[bag[j],bag[i]];
      }
      // Because next() pops the end, prevent a repeat at a cycle boundary.
      if(bag.length>1 && bag[bag.length-1]===previous){
        const j=bag.findIndex(item=>item!==previous);
        if(j>=0)[bag[bag.length-1],bag[j]]=[bag[j],bag[bag.length-1]];
      }
    }
    return {
      next(){
        if(!source.length)return null;
        if(!bag.length)refill();
        const story=bag.pop();
        previous=story;
        return story;
      }
    };
  }
  const api={create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.ViceTickerShuffle=api;
})(typeof window!=='undefined'?window:globalThis);
