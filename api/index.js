import {safeHandle} from '../server/api.js';
import {BlobStore} from '../server/blob-store.js';
const store=new BlobStore();
export default {fetch:request=>safeHandle(request,store)};
