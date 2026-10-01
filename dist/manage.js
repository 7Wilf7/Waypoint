import {copy} from './i18n.js';
const root=document.documentElement,form=document.querySelector('.entry-editor'),status=document.querySelector('#manage-status');
const words=()=>copy[root.dataset.language==='en'?'en':'zh'];
let records=[],photos=[],certificates=[],busy=false;
const field=name=>form.elements.namedItem(name);
function translate(){
  const w=words();root.lang=root.dataset.language==='en'?'en':'zh-CN';document.title='Waypoint · '+w.manage;
  document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=w[e.dataset.i18n]);document.querySelectorAll('[data-i18n-aria]').forEach(e=>e.setAttribute('aria-label',w[e.dataset.i18nAria]));
  const toggle=document.querySelector('.language-toggle');toggle.textContent=root.dataset.language==='en'?'中':'EN';toggle.setAttribute('aria-label',w.languageLabel);
  document.querySelector('.manage-theme').textContent=root.dataset.theme==='dark'?w.toLight:w.toDark;
  renderList();renderMedia();
}
document.querySelector('.language-toggle').addEventListener('click',()=>{root.dataset.language=root.dataset.language==='en'?'zh':'en';try{localStorage.setItem('waypoint-language',root.dataset.language);}catch{}translate();});
document.querySelector('.manage-theme').addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('waypoint-theme',root.dataset.theme);}catch{}translate();});
const messages={english_required:'englishRequired',article_body_required:'englishRequired',title_date_required:'titleDateRequired',file_too_large:'fileTooLarge',file_type:'fileType',invalid_metrics:'invalidMetrics',invalid_result:'invalidMetrics',invalid_wechat_url:'invalidWechat'};
async function api(path,options){const response=await fetch('./api/'+path,options);let data;try{data=await response.json();}catch{throw new Error('unavailable');}if(!response.ok)throw new Error(data.error||'unavailable');return data;}
function renderList(){
  const list=document.querySelector('.managed-entries');list.replaceChildren();
  if(!records.length){const p=document.createElement('p');p.className='editor-help';p.textContent=words().entriesEmpty;list.append(p);}
  for(const entry of records){const button=document.createElement('button');button.type='button';button.className='managed-entry'+(field('id').value===entry.id?' is-active':'');const title=document.createElement('strong');title.textContent=(root.dataset.language==='en'?entry.titleEn:entry.titleZh)||entry.titleZh;const meta=document.createElement('span');meta.textContent=entry.date+' · '+(entry.published?words().published:words().draft);button.append(title,meta);button.addEventListener('click',()=>{if(!busy)openEntry(entry);});list.append(button);}
}
function openEntry(entry){
  form.reset();for(const [name,value]of Object.entries(entry)){const input=field(name);if(input&&input.tagName)input.value=value??'';}
  photos=[...(entry.photos||[])];certificates=[...(entry.certificates||[])];form.hidden=false;
  document.querySelectorAll('.race-field').forEach(e=>e.hidden=entry.kind!=='race');document.querySelectorAll('.article-field').forEach(e=>e.hidden=entry.kind!=='article');
  status.textContent='';renderMedia();renderList();field('titleZh').focus();
}
function newEntry(kind){if(busy)return;openEntry({id:crypto.randomUUID(),kind,date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),category:'Trail',photos:[],certificates:[]});}
document.querySelector('#new-race').addEventListener('click',()=>newEntry('race'));document.querySelector('#new-article').addEventListener('click',()=>newEntry('article'));
function renderMedia(){
  for(const [values,selector,photo]of [[photos,'.managed-photos',true],[certificates,'.managed-certificates',false]]){
    const list=document.querySelector(selector);list.replaceChildren();for(const [index,id]of values.entries()){const item=document.createElement('div');item.className='managed-media';const link=document.createElement('a');link.href='./media/'+id;link.target='_blank';link.rel='noopener';if(photo){const image=document.createElement('img');image.src=link.href;image.alt=words().galleryPhoto+' '+(index+1);link.append(image);}else link.textContent=words().viewMedia+' '+(index+1);const remove=document.createElement('button');remove.type='button';remove.textContent=words().removePhoto;remove.setAttribute('aria-label',words().removePhoto+' '+(photo?words().photos:words().certificates)+' '+(index+1));remove.addEventListener('click',()=>{if(!busy){values.splice(index,1);renderMedia();}});item.append(link,remove);list.append(item);}
  }
}
function setBusy(value){busy=value;form.querySelectorAll('button,input[type="file"]').forEach(e=>e.disabled=value);document.querySelectorAll('.manage-new button,.managed-entry').forEach(e=>e.disabled=value);}
async function upload(event,values,photo){
  const input=event.target,files=[...input.files];if(!files.length)return;
  if(files.length+values.length>20){status.textContent=words().mediaLimit;input.value='';return;}
  setBusy(true);status.textContent=words().uploading;
  try {for(const file of files){if(file.size>8*1024*1024)throw new Error('file_too_large');if(!['image/jpeg','image/png','image/webp',...(photo?[]:['application/pdf'])].includes(file.type))throw new Error('file_type');const id=crypto.randomUUID();await api('manage/media/'+id+'?name='+encodeURIComponent(file.name),{method:'PUT',headers:{'content-type':file.type},body:file});values.push(id);renderMedia();}status.textContent='';}
  catch(error){status.textContent=words()[messages[error.message]||'saveFailed'];}
  finally{input.value='';setBusy(false);}
}
document.querySelector('#photo-upload').addEventListener('change',event=>upload(event,photos,true));document.querySelector('#certificate-upload').addEventListener('change',event=>upload(event,certificates,false));
form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const entry=Object.fromEntries(new FormData(form));entry.published=event.submitter?.value==='publish';entry.photos=[...photos];entry.certificates=[...certificates];setBusy(true);status.textContent=words().saving;
  try{const result=await api('manage/entries/'+entry.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(entry)});records=records.filter(record=>record.id!==result.entry.id);records.unshift(result.entry);renderList();status.textContent=entry.published?words().savedPublished:words().savedDraft;}
  catch(error){status.textContent=words()[messages[error.message]||'saveFailed'];}
  finally{setBusy(false);}
});
translate();
try{const session=await api('session');if(!session.owner)document.querySelector('.owner-signin').hidden=false;else {records=(await api('manage/entries')).entries;document.querySelector('.manage-workspace').hidden=false;renderList();}}
catch{status.textContent=words().unavailable;const retry=document.createElement('button');retry.className='button button-quiet';retry.textContent=words().retry;retry.addEventListener('click',()=>location.reload());status.after(retry);}
