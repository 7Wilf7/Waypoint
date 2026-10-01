import {createHmac,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';

const COOKIE='waypoint_owner';
const AGE=7*24*60*60;
export function hasOwnerCookie(request){return /(?:^|;\s*)waypoint_owner=/.test(request.headers.get('cookie')||'');}
export function credentialSettings(env,record) {
  if(!record)return env;
  if(!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(record.hash)||!/^[a-f0-9]{32}$/.test(record.version)||!env.WAYPOINT_SESSION_SECRET)throw new Error('invalid_auth_settings');
  return {...env,WAYPOINT_PASSWORD_HASH:record.hash,WAYPOINT_SESSION_SECRET:createHmac('sha256',env.WAYPOINT_SESSION_SECRET).update(record.version).digest('hex')};
}
export function changedCredentials(input,settings) {
  if(!input||!checkPassword(input.currentPassword,settings.WAYPOINT_PASSWORD_HASH))throw new Error('invalid_password');
  if(typeof input.newPassword!=='string'||input.newPassword.length<10||input.newPassword.length>128)throw new Error('password_length');
  if(input.newPassword!==input.confirmPassword)throw new Error('password_mismatch');
  if(input.newPassword===input.currentPassword)throw new Error('password_unchanged');
  return {hash:hashPassword(input.newPassword),version:randomBytes(16).toString('hex')};
}
export function hashPassword(password,salt=randomBytes(16).toString('hex')) {
  return salt+':'+scryptSync(password,salt,64).toString('hex');
}
export function checkPassword(password,hash) {
  if(typeof password!=='string'||password.length>256||!hash)return false;
  const [salt,expected]=hash.split(':');
  if(!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(expected))return false;
  return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(expected,'hex'));
}
function signature(value,secret){return createHmac('sha256',secret).update(value).digest('base64url');}
export function isOwner(request,env) {
  if(!env.WAYPOINT_SESSION_SECRET)return false;
  const token=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!token||token.length>200)return false;
  const [expires,nonce,mac,...extra]=token.split('.');
  if(extra.length||!/^\d+$/.test(expires)||!/^[a-f0-9]{32}$/.test(nonce)||!/^[a-zA-Z0-9_-]{43}$/.test(mac)||Number(expires)<=Date.now()||Number(expires)>Date.now()+AGE*1000+60000)return false;
  const expected=signature(expires+'.'+nonce,env.WAYPOINT_SESSION_SECRET);
  return mac.length===expected.length&&timingSafeEqual(Buffer.from(mac),Buffer.from(expected));
}
export function sessionCookie(request,env,clear=false) {
  const token=clear?'':Date.now()+AGE*1000+'.'+randomBytes(16).toString('hex');
  const value=clear?'':token+'.'+signature(token,env.WAYPOINT_SESSION_SECRET);
  return COOKIE+'='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+(clear?0:AGE)+(new URL(request.url).protocol==='https:'?'; Secure':'');
}
export function sameOrigin(request) {
  return request.headers.get('origin')===new URL(request.url).origin&&request.headers.get('sec-fetch-site')!=='cross-site';
}
