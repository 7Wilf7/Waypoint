export function initPrivacy(tracker) {
  const dialog=document.querySelector('.privacy-dialog'),choice=dialog.querySelector('input'),system=dialog.querySelector('.privacy-system');
  let origin;
  const sync=()=>{const signal=navigator.doNotTrack==='1'||navigator.doNotTrack==='yes'||navigator.globalPrivacyControl===true;choice.checked=tracker.disabled();choice.disabled=signal;system.hidden=!signal;};
  for(const button of document.querySelectorAll('.privacy-link'))button.addEventListener('click',()=>{origin=button;sync();dialog.showModal();});
  dialog.querySelector('.privacy-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>origin?.focus({preventScroll:true}));
  choice.addEventListener('change',()=>tracker.setOptOut(choice.checked));
  return {sync};
}
