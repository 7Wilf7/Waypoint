// Build metadata is bundled with the Function; the public directory is never an
// authority for deciding whether private storage may be read at runtime.
export function buildPublicationPolicy(env=process.env) {
  const source=env.WAYPOINT_PUBLIC_SOURCE||'live';
  if(!['live','local','blob'].includes(source))throw new Error('invalid_public_source');
  const lifecycle=env.WAYPOINT_PUBLIC_LIFECYCLE||null;
  if(source==='blob') {
    if(lifecycle!=='deployment')throw new Error('deployment_lifecycle_required');
    if(env.VERCEL_ENV!=='production')throw new Error('production_public_export_required');
  } else if(lifecycle!==null)throw new Error('invalid_public_lifecycle');
  if(source==='local'&&env.VERCEL_ENV==='production')throw new Error('fixture_production_forbidden');
  return {source,mode:source==='live'?'live':'static',lifecycle};
}

export function runtimePublicationAllowed(policy,env=process.env) {
  if(!policy||!['live','local','blob'].includes(policy.source)||!['live','static'].includes(policy.mode))return false;
  if(policy.mode!==(policy.source==='live'?'live':'static'))return false;
  if(policy.source!==(env.WAYPOINT_PUBLIC_SOURCE||'live')||policy.mode!==(env.WAYPOINT_CONTENT_DELIVERY||'live')||policy.lifecycle!==(env.WAYPOINT_PUBLIC_LIFECYCLE||null))return false;
  if(policy.source==='blob'&&(policy.lifecycle!=='deployment'||env.VERCEL_ENV!=='production'))return false;
  if(policy.source!=='blob'&&policy.lifecycle!==null)return false;
  if(policy.source==='local'&&env.VERCEL_ENV==='production')return false;
  if(env.VERCEL_ENV==='preview'&&policy.source!=='local')return false;
  return true;
}
