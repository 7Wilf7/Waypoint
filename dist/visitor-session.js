import {requestJSON} from './loading.js';
let session;
// Owner-link discovery and analytics share one same-origin, no-store request.
export function getVisitorSession({refresh=false}={}){if(refresh)session=null;return session||=(requestJSON('./api/session'));}
