import {copy} from './i18n.js';
import {upload as uploadBlob} from './upload-client.js';
import {reconcileArticleLayout} from './article-layout.js';
import {raceCategoryKeys} from './race-utils.js';
import {racePhotoRoles} from './race-photos.js';
const root=document.documentElement,form=document.querySelector('.entry-editor'),status=document.querySelector('#manage-status');
const words=()=>copy[root.dataset.language==='en'?'en':'zh'];
const format=(template,values)=>template.replace(/\{(\w+)\}/g,(_,key)=>values[key]??'');
const field=name=>form.elements.namedItem(name);
const categoryFilter=document.querySelector('#manage-category-filter');
let records=[],activeEntry=null,activeKind='race',photoRoles={primary:'',secondary:''},certificate='',articleLayout,busy=false,uploadMode='local';
function translate(){
  const w=words();root.lang=root.dataset.language==='en'?'en':'zh-CN';document.title='Waypoint · '+w.manage;
  document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=w[e.dataset.i18n]);document.querySelectorAll('[data-i18n-aria]').forEach(e=>e.setAttribute('aria-label',w[e.dataset.i18nAria]));
  const toggle=document.querySelector('.language-toggle');toggle.textContent=root.dataset.language==='en'?'中':'EN';toggle.setAttribute('aria-label',w.languageLabel);toggle.title=w.languageLabel;
  const theme=document.querySelector('.manage-theme'),themeLabel=root.dataset.theme==='dark'?w.toLight:w.toDark;theme.setAttribute('aria-label',themeLabel);theme.title=themeLabel;
  document.querySelector('meta[name="theme-color"]').content=root.dataset.theme==='dark'?'#101113':'#f5f6f8';
  renderList();renderEditorHeading();renderMedia();
}
document.querySelector('.language-toggle').addEventListener('click',()=>{root.dataset.language=root.dataset.language==='en'?'zh':'en';try{localStorage.setItem('waypoint-language',root.dataset.language);}catch{}translate();});
document.querySelector('.manage-theme').addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('waypoint-theme',root.dataset.theme);}catch{}translate();});
const messages={invalid_password:'invalidPassword',password_length:'passwordLength',password_mismatch:'passwordMismatch',password_unchanged:'passwordUnchanged',auth_changed:'signInAgain',owner_required:'signInAgain',english_required:'englishRequired',article_body_required:'englishRequired',title_date_required:'titleDateRequired',file_too_large:'fileTooLarge',file_type:'raceFileType',invalid_metrics:'invalidMetrics',invalid_result:'invalidMetrics',invalid_wechat_url:'invalidWechat',invalid_published_time:'invalidPublishedTime',summary_translation_required:'bilingualSummaryRequired',race_photo_limit:'racePhotoLimit',invalid_photo_roles:'invalidPhotoRoles',certificate_image_required:'certificateImageRequired',invalid_article_layout:'invalidArticleLayout'};
async function api(path,options){const response=await fetch('./api/'+path,options);let data;try{data=await response.json();}catch{throw new Error('unavailable');}if(!response.ok)throw new Error(data.error||'unavailable');return data;}
function renderList(){
  const w=words(),list=document.querySelector('.managed-entries');list.replaceChildren();
  for(const button of document.querySelectorAll('.manage-kind-switch button'))button.setAttribute('aria-pressed',String(button.dataset.kind===activeKind));
  for(const count of document.querySelectorAll('[data-kind-count]'))count.textContent=records.filter(entry=>entry.kind===count.dataset.kindCount).length;
  document.querySelector('.manage-race-tools').hidden=activeKind!=='race';
  const races=records.filter(entry=>entry.kind==='race');
  for(const option of categoryFilter.options)option.textContent=w[option.dataset.i18n]+' · '+races.filter(entry=>option.value==='all'||entry.category===option.value).length;
  const selected=records.filter(entry=>entry.kind===activeKind&&(activeKind!=='race'||categoryFilter.value==='all'||entry.category===categoryFilter.value)).toSorted((a,b)=>(b.date+(b.publishedTime||'')).localeCompare(a.date+(a.publishedTime||''))||a.id.localeCompare(b.id));
  document.querySelector('.managed-list-summary').textContent=format(w.manageListSummary,{count:selected.length,published:selected.filter(entry=>entry.published).length,draft:selected.filter(entry=>!entry.published).length});
  const emptyIntro=document.querySelector('.editor-empty p');emptyIntro.dataset.i18n=activeKind==='race'?'manageEmptyIntro':'manageArticleEmptyIntro';emptyIntro.textContent=w[emptyIntro.dataset.i18n];
  if(!selected.length){const p=document.createElement('p');p.className='editor-help managed-list-empty';p.textContent=activeKind==='race'?w.manageRaceEmpty:w.manageArticleEmpty;list.append(p);}
  for(const entry of selected){
    const button=document.createElement('button');button.type='button';button.className='managed-entry'+(!form.hidden&&field('id').value===entry.id?' is-active':'');if(!form.hidden&&field('id').value===entry.id)button.setAttribute('aria-current','true');
    const title=document.createElement('strong');title.textContent=(root.dataset.language==='en'?entry.titleEn:entry.titleZh)||entry.titleZh;
    const meta=document.createElement('span');meta.className='managed-entry-meta';meta.textContent=entry.date+(entry.kind==='race'?' · '+(w[raceCategoryKeys[entry.category]]||entry.category):entry.publishedTime?' · '+entry.publishedTime:'');
    const state=document.createElement('span');state.className='managed-entry-state';const publication=document.createElement('span');publication.className='publication-tag'+(entry.published?' is-published':'');publication.textContent=entry.published?w.published:w.draft;state.append(publication);
    if(entry.kind==='race'){const roles=racePhotoRoles(entry),missing=Number(!roles.primary)+Number(!roles.secondary)+Number(!entry.certificates?.[0]);if(missing){const pending=document.createElement('span');pending.className='managed-entry-pending';pending.textContent=format(w.racePhotosPending,{count:missing});state.append(pending);}}
    button.append(title,meta,state);button.disabled=busy;button.addEventListener('click',()=>{if(!busy)openEntry(entry);});list.append(button);
  }
}
function renderEditorHeading(){
  if(!activeEntry)return;const w=words(),race=activeEntry.kind==='race';
  document.querySelector('.editor-kind').textContent=race?w.manageRaces:w.manageArticles;
  document.querySelector('.editor-title').textContent=(root.dataset.language==='en'?field('titleEn').value:field('titleZh').value)||field('titleZh').value||(race?w.newRace:w.editorArticleTitle);
  document.querySelector('.editor-publication').textContent=activeEntry.published?w.published:w.draft;
  document.querySelector('.editor-publication').classList.toggle('is-published',!!activeEntry.published);
  document.querySelector('.editor-publish-help').textContent=race?w.racePublishHelp:w.articlePublishHelp;
}
function updateEditorFields(){
  const race=activeEntry?.kind==='race';
  for(const [selector,hidden]of [['.race-field',!race],['.article-field',race]])document.querySelectorAll(selector).forEach(element=>{element.hidden=hidden;element.querySelectorAll('input,select,textarea').forEach(input=>input.disabled=hidden||(busy&&input.type==='file'));});
}
function openEntry(entry){
  activeEntry=entry;activeKind=entry.kind;form.reset();for(const [name,value]of Object.entries(entry)){const input=field(name);if(input&&input.tagName)input.value=value??'';}
  photoRoles=racePhotoRoles(entry);certificate=entry.certificates?.[0]||'';articleLayout=entry.articleLayout;form.hidden=false;document.querySelector('.editor-empty').hidden=true;
  updateEditorFields();status.textContent='';renderMedia();renderList();renderEditorHeading();field('titleZh').focus();
}
function newRace(){if(busy)return;openEntry({id:crypto.randomUUID(),kind:'race',date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),category:categoryFilter.value==='all'?'Trail':categoryFilter.value,photos:[],certificates:[],primaryPhoto:'',secondaryPhoto:''});}
document.querySelector('#new-race').addEventListener('click',newRace);
for(const button of document.querySelectorAll('.manage-kind-switch button'))button.addEventListener('click',()=>{if(busy||activeKind===button.dataset.kind)return;activeKind=button.dataset.kind;activeEntry=null;form.hidden=true;document.querySelector('.editor-empty').hidden=false;status.textContent='';renderList();});
categoryFilter.addEventListener('change',()=>{if(!busy)renderList();});
for(const name of ['titleZh','titleEn'])field(name).addEventListener('input',renderEditorHeading);
const slotKeys={primary:'racePrimaryPhoto',secondary:'raceSecondaryPhoto',certificate:'raceCertificatePhoto'};
function renderMedia(){
  const w=words();
  for(const slot of document.querySelectorAll('.race-photo-slot')){
    const role=slot.dataset.slot,id=role==='certificate'?certificate:photoRoles[role],preview=slot.querySelector('.photo-slot-preview');preview.replaceChildren();slot.classList.toggle('has-photo',!!id);
    if(id){
      const link=document.createElement('a');link.href='./media/'+id;link.target='_blank';link.rel='noopener';link.setAttribute('aria-label',w.viewMedia+' · '+w[slotKeys[role]]);
      const image=document.createElement('img');image.src=link.href;image.alt=w[slotKeys[role]];image.loading='lazy';image.addEventListener('error',()=>{image.remove();link.classList.add('photo-file-link');link.textContent=words().viewMedia;});link.append(image);preview.append(link);
    }else{const mark=document.createElement('span');mark.className='photo-slot-placeholder';mark.setAttribute('aria-hidden','true');mark.textContent='+';preview.append(mark);}
    slot.querySelector('.photo-slot-status').textContent=id?w.photoReady:w.photoToCome;slot.querySelector('.photo-upload-label').textContent=id?w.replacePhoto:w.addPhoto;
    const input=slot.querySelector('input'),remove=slot.querySelector('.photo-slot-remove');input.disabled=busy||activeEntry?.kind!=='race';slot.querySelector('.photo-upload-button').classList.toggle('is-disabled',input.disabled);remove.hidden=!id;remove.disabled=busy;remove.setAttribute('aria-label',w.removePhoto+' · '+w[slotKeys[role]]);
  }
}
function setBusy(value){busy=value;form.querySelectorAll('button,input[type="file"]').forEach(e=>e.disabled=value);document.querySelectorAll('.manage-new button,.managed-entry,.manage-kind-switch button,#manage-category-filter').forEach(e=>e.disabled=value);updateEditorFields();renderMedia();}
async function upload(event,role){
  const input=event.target,file=input.files[0];if(!file||busy||activeEntry?.kind!=='race')return;
  setBusy(true);status.textContent=words().uploading;
  try{
    if(file.size>8*1024*1024)throw new Error('file_too_large');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('file_type');const id=crypto.randomUUID();
    if(uploadMode==='blob'){
      await uploadBlob('media/'+id,file,{access:'private',handleUploadUrl:'/api/manage/upload',clientPayload:JSON.stringify({id}),contentType:file.type});
      await api('manage/media/'+id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filename:file.name})});
    }else await api('manage/media/'+id+'?name='+encodeURIComponent(file.name),{method:'PUT',headers:{'content-type':file.type},body:file});
    if(role==='certificate')certificate=id;else photoRoles[role]=id;renderMedia();status.textContent=words().photoUploaded;
  }catch(error){status.textContent=words()[messages[error.message]||'saveFailed'];}
  finally{input.value='';setBusy(false);}
}
for(const slot of document.querySelectorAll('.race-photo-slot')){
  slot.querySelector('input').addEventListener('change',event=>upload(event,slot.dataset.slot));
  slot.querySelector('.photo-slot-remove').addEventListener('click',()=>{if(busy)return;if(slot.dataset.slot==='certificate')certificate='';else photoRoles[slot.dataset.slot]='';renderMedia();status.textContent=words().photoRemoved;});
}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const entry=Object.fromEntries(new FormData(form));entry.published=event.submitter?.value==='publish';
  if(entry.kind==='race'){
    entry.bodyZh=activeEntry?.bodyZh||'';entry.bodyEn=activeEntry?.bodyEn||'';entry.primaryPhoto=photoRoles.primary;entry.secondaryPhoto=photoRoles.secondary;entry.photos=[photoRoles.primary,photoRoles.secondary].filter(Boolean);entry.certificates=certificate?[certificate]:[];
  }else{
    if(entry.published&&Boolean(entry.summaryZh.trim())!==Boolean(entry.summaryEn.trim())){status.textContent=words().bilingualSummaryRequired;field(entry.summaryZh.trim()?'summaryEn':'summaryZh').focus();return;}
    entry.photos=[];entry.certificates=[];entry.articleLayout=reconcileArticleLayout(articleLayout?.filter(block=>block.type!=='image'),entry);
  }
  setBusy(true);status.textContent=words().saving;
  try{const result=await api('manage/entries/'+entry.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(entry)});records=records.filter(record=>record.id!==result.entry.id);records.unshift(result.entry);activeEntry=result.entry;articleLayout=result.entry.articleLayout;renderList();renderEditorHeading();status.textContent=entry.published?words().savedPublished:words().savedDraft;}
  catch(error){status.textContent=words()[messages[error.message]||'saveFailed'];}
  finally{setBusy(false);}
});
translate();
const signin=document.querySelector('.owner-signin'),logout=document.querySelector('.manage-logout');
async function refreshSession(){const session=await api('session');uploadMode=session.uploads;signin.hidden=session.owner;logout.hidden=!session.owner;document.querySelector('.manage-account').hidden=!session.owner;document.querySelector('.manage-workspace').hidden=!session.owner;records=session.owner?(await api('manage/entries')).entries:[];renderList();}
signin.addEventListener('submit',async event=>{event.preventDefault();const button=signin.querySelector('button');button.disabled=true;status.textContent='';try{await api('login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:signin.elements.password.value})});signin.reset();await refreshSession();}catch(error){status.textContent=words()[messages[error.message]||'unavailable'];}finally{button.disabled=false;}});
logout.addEventListener('click',async()=>{logout.disabled=true;try{await api('logout',{method:'POST'});location.reload();}catch{status.textContent=words().unavailable;logout.disabled=false;}});
const passwordForm=document.querySelector('.password-editor'),passwordStatus=document.querySelector('#password-status');
function passwordMessage(key){passwordStatus.dataset.i18n=key;passwordStatus.textContent=words()[key];}
passwordForm.addEventListener('submit',async event=>{
  event.preventDefault();const values=Object.fromEntries(new FormData(passwordForm));
  if(values.newPassword!==values.confirmPassword){passwordMessage('passwordMismatch');return;}
  passwordForm.querySelectorAll('input,button').forEach(e=>e.disabled=true);passwordMessage('saving');
  try{await api('manage/password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(values)});passwordForm.reset();passwordMessage('passwordSaved');}
  catch(error){passwordMessage(messages[error.message]||'passwordFailed');if(['owner_required','auth_changed'].includes(error.message)){passwordForm.reset();status.textContent=words().signInAgain;try{await refreshSession();}catch{status.textContent=words().unavailable;}}}
  finally{passwordForm.querySelectorAll('input,button').forEach(e=>e.disabled=false);}
});
try{await refreshSession();}
catch{status.textContent=words().unavailable;const retry=document.createElement('button');retry.className='button button-quiet';retry.textContent=words().retry;retry.addEventListener('click',()=>location.reload());status.after(retry);}
