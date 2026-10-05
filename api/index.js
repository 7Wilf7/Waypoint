import {safeHandle} from '../server/api.js';
import {BlobStore} from '../server/blob-store.js';
import publication from '../server/publication-build.json' with {type:'json'};
const store=new BlobStore();
export default {fetch:request=>safeHandle(request,store,{...process.env,WAYPOINT_CONTENT_DELIVERY:publication.mode,WAYPOINT_PUBLICATION_BUILD:publication})};
