// Explicit roles keep a secondary photo from silently becoming the main photo.
// Old records use their original attachment order until an owner edits them.
export function racePhotoRoles(entry) {
  if(Object.hasOwn(entry,'primaryPhoto')||Object.hasOwn(entry,'secondaryPhoto'))return {primary:entry.primaryPhoto||'',secondary:entry.secondaryPhoto||''};
  return {primary:entry.photos?.[0]||'',secondary:entry.photos?.[1]||''};
}
