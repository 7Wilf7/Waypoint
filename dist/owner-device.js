export const ownerDevicePreference='waypoint-owner-device';
export const ownerDeviceChanged='waypoint-owner-device-change';
let memory;

export function ownerDeviceState(){
  if(memory)return memory;
  try{
    const value=localStorage.getItem(ownerDevicePreference);
    return {excluded:value==='1',chosen:value==='1'||value==='0',saved:true};
  }catch{return {excluded:false,chosen:false,saved:false};}
}
export function setOwnerDevice(excluded){
  const value=excluded?'1':'0';let saved=false;
  try{localStorage.setItem(ownerDevicePreference,value);saved=localStorage.getItem(ownerDevicePreference)===value;}catch{}
  memory={excluded,chosen:true,saved};
  window.dispatchEvent(new Event(ownerDeviceChanged));
  return memory;
}
// A verified owner is remembered once; an explicit decision to include this
// browser survives later logins. This preference is never an identity token.
export function rememberOwnerDevice(){const state=ownerDeviceState();return state.chosen?state:setOwnerDevice(true);}
window.addEventListener('storage',event=>{if(event.key===ownerDevicePreference||event.key===null)memory=null;});
