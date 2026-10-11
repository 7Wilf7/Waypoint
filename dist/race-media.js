import {copy} from './i18n.js';
import {racePhotoRoles} from './race-photos.js';
import {createMediaImage} from './loading.js';

// The same explicit photo roles appear in the archive, hover preview and reader.
export function createRaceGallery(entry,{preview=false}={}) {
  const locale=document.documentElement.dataset.language==='en'?'en':'zh',w=copy[locale];
  const roles=racePhotoRoles(entry),gallery=document.createElement('div');
  const title=entry.title||(locale==='en'?entry.titleEn:entry.titleZh);
  gallery.className='race-media-gallery';
  for(const [role,id,label]of [['primary',roles.primary,w.racePrimaryPhoto],['secondary',roles.secondary,w.raceSecondaryPhoto],['certificate',entry.certificates?.[0],w.raceCertificates]]) {
    const figure=document.createElement('figure');figure.className='race-media-slot';figure.dataset.role=role;
    const caption=document.createElement('figcaption');caption.textContent=label;figure.append(caption);
    if(id)figure.append(createMediaImage('/media/'+id,title+' · '+label,{size:preview?'preview':'read',entry:entry.id,originalLink:!preview,allowPDF:role==='certificate',interactive:!preview}));
    else {const missing=document.createElement('p');missing.className='race-media-missing';missing.textContent=w.photoToCome;figure.append(missing);}
    gallery.append(figure);
  }
  return gallery;
}
