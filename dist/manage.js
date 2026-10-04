import {copy} from './i18n.js';
import {initTheme} from './theme.js';
import {upload as uploadBlob} from './upload-client.js';
import {reconcileArticleLayout} from './article-layout.js';
import {raceCategoryKeys} from './race-utils.js';
import {racePhotoRoles} from './race-photos.js';
import {requestJSON,renderLoading,clearLoading} from './loading.js';
const root=document.documentElement,form=document.querySelector('.entry-editor'),status=document.querySelector('#manage-status');
const words=()=>copy[root.dataset.language==='en'?'en':'zh'];
const format=(template,values)=>template.replace(/\{(\w+)\}/g,(_,key)=>values[key]??'');
const field=name=>form.elements.namedItem(name);
const categoryFilter=document.querySelector('#manage-category-filter');
const signin=document.querySelector('.owner-signin'),logout=document.querySelector('.manage-logout'),workspace=document.querySelector('.manage-workspace'),account=document.querySelector('.manage-account');
const passwordForm=document.querySelector('.password-editor'),passwordStatus=document.querySelector('#password-status'),editorStatus=document.querySelector('#editor-status');
const loading=document.querySelector('#manage-loading'),retry=document.querySelector('#manage-retry'),messageStates=new Map(),photoFeedback=new Map();
let records=[],activeEntry=null,activeKind='race',photoRoles={primary:'',secondary:''},certificate='',articleLayout,busy=false,uploadMode='local',recordsReady=false,sessionLoading=false,operation=null;
function message(target,key,values={}){if(key)messageStates.set(target,{key,values});else messageStates.delete(target);target.textContent=key?format(words()[key],values):'';}
function errorMessage(error,fallback='unavailable'){return error.readFailure&&error.message==='request_timeout'?'loadTimedOut':messages[error.message]||fallback;}
function renderOperation(){
  if(!operation)return;
  if(operation.button)operation.button.textContent=words()[operation.key];
  operation.progress?.setAttribute('aria-label',words()[operation.key]);
}
function translate(){
  const w=words();root.lang=root.dataset.language==='en'?'en':'zh-CN';document.title='Waypoint · '+w.manage;
  document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=w[e.dataset.i18n]);document.querySelectorAll('[data-i18n-aria]').forEach(e=>e.setAttribute('aria-label',w[e.dataset.i18nAria]));
  const toggle=document.querySelector('.language-toggle');toggle.textContent=root.dataset.language==='en'?'中':'EN';toggle.setAttribute('aria-label',w.languageLabel);toggle.title=w.languageLabel;
  for(const [target,state]of messageStates)target.textContent=format(w[state.key],state.values);
  if(sessionLoading)renderLoading(loading,'manageLoading',{rows:3});
  renderList();renderEditorHeading();renderMedia();renderOperation();
}
document.querySelector('.language-toggle').addEventListener('click',()=>{root.dataset.language=root.dataset.language==='en'?'zh':'en';try{localStorage.setItem('waypoint-language',root.dataset.language);}catch{}translate();});
initTheme();
const messages={request_timeout:'requestTimedOut',invalid_password:'invalidPassword',password_length:'passwordLength',password_mismatch:'passwordMismatch',password_unchanged:'passwordUnchanged',auth_changed:'signInAgain',owner_required:'signInAgain',english_required:'englishRequired',article_body_required:'englishRequired',title_date_required:'titleDateRequired',file_too_large:'fileTooLarge',file_type:'raceFileType',invalid_metrics:'invalidMetrics',invalid_result:'invalidMetrics',invalid_wechat_url:'invalidWechat',invalid_published_time:'invalidPublishedTime',summary_translation_required:'bilingualSummaryRequired',race_photo_limit:'racePhotoLimit',invalid_photo_roles:'invalidPhotoRoles',certificate_image_required:'certificateImageRequired',invalid_article_layout:'invalidArticleLayout'};
async function api(path,options={},timeoutMs=options.method&&options.method!=='GET'?60000:20000){return requestJSON('./api/'+path,options,timeoutMs);}
function renderList(){
  const w=words(),list=document.querySelector('.managed-entries');list.replaceChildren();
  for(const button of document.querySelectorAll('.manage-kind-switch button'))button.setAttribute('aria-pressed',String(button.dataset.kind===activeKind));
  for(const count of document.querySelectorAll('[data-kind-count]'))count.textContent=recordsReady?records.filter(entry=>entry.kind===count.dataset.kindCount).length:'—';
  document.querySelector('.manage-race-tools').hidden=activeKind!=='race';
  const races=records.filter(entry=>entry.kind==='race');
  for(const option of categoryFilter.options)option.textContent=w[option.dataset.i18n]+' · '+races.filter(entry=>option.value==='all'||entry.category===option.value).length;
  const selected=records.filter(entry=>entry.kind===activeKind&&(activeKind!=='race'||categoryFilter.value==='all'||entry.category===categoryFilter.value)).toSorted((a,b)=>(b.date+(b.publishedTime||'')).localeCompare(a.date+(a.publishedTime||''))||a.id.localeCompare(b.id));
  document.querySelector('.managed-list-summary').textContent=format(w.manageListSummary,{count:selected.length,published:selected.filter(entry=>entry.published).length,draft:selected.filter(entry=>!entry.published).length});
  const emptyIntro=document.querySelector('.editor-empty p');emptyIntro.dataset.i18n=activeKind==='race'?'manageEmptyIntro':'manageArticleEmptyIntro';emptyIntro.textContent=w[emptyIntro.dataset.i18n];
  if(!recordsReady){document.querySelector('.managed-list-summary').textContent='';return;}
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
  for(const [selector,hidden]of [['.race-field',!race],['.article-field',race]])document.querySelectorAll(selector).forEach(element=>{element.hidden=hidden;element.querySelectorAll('input,select,textarea').forEach(input=>input.disabled=hidden||busy);});
}
function openEntry(entry){
  if(busy)return;
  activeEntry=entry;activeKind=entry.kind;form.reset();for(const [name,value]of Object.entries(entry)){const input=field(name);if(input&&input.tagName)input.value=value??'';}
  photoRoles=racePhotoRoles(entry);certificate=entry.certificates?.[0]||'';articleLayout=entry.articleLayout;form.hidden=false;document.querySelector('.editor-empty').hidden=true;
  updateEditorFields();message(status);message(editorStatus);photoFeedback.clear();renderMedia();renderList();renderEditorHeading();field('titleZh').focus();
}
function newRace(){if(busy)return;openEntry({id:crypto.randomUUID(),kind:'race',date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),category:categoryFilter.value==='all'?'Trail':categoryFilter.value,photos:[],certificates:[],primaryPhoto:'',secondaryPhoto:''});}
document.querySelector('#new-race').addEventListener('click',newRace);
for(const button of document.querySelectorAll('.manage-kind-switch button'))button.addEventListener('click',()=>{if(busy||activeKind===button.dataset.kind)return;activeKind=button.dataset.kind;activeEntry=null;form.hidden=true;document.querySelector('.editor-empty').hidden=false;message(status);message(editorStatus);renderList();});
categoryFilter.addEventListener('change',()=>{if(!busy)renderList();});
for(const name of ['titleZh','titleEn'])field(name).addEventListener('input',renderEditorHeading);
const slotKeys={primary:'racePrimaryPhoto',secondary:'raceSecondaryPhoto',certificate:'raceCertificatePhoto'};
function renderMedia(){
  const w=words();
  for(const slot of document.querySelectorAll('.race-photo-slot')){
    const role=slot.dataset.slot,id=(role==='certificate'?certificate:photoRoles[role])||'',preview=slot.querySelector('.photo-slot-preview');slot.classList.toggle('has-photo',!!id);
    if(preview.dataset.mediaId!==id) {
      preview.replaceChildren();preview.classList.remove('is-ready');preview.dataset.mediaId=id;
      if(id) {
        const link=document.createElement('a');link.href='./media/'+id;link.target='_blank';link.rel='noopener';
        const status=document.createElement('span');status.className='photo-slot-loading';status.setAttribute('role','status');
        const image=document.createElement('img');image.hidden=true;image.loading='eager';image.decoding='async';
        const failed=()=>{if(!preview.contains(image))return;image.remove();link.classList.add('photo-file-link');link.replaceChildren();link.textContent=words().viewMedia;};
        image.onload=async()=>{
          try{if(image.decode)await image.decode();}catch{failed();return;}
          if(!preview.contains(image))return;
          image.width=image.naturalWidth;image.height=image.naturalHeight;image.hidden=false;status.remove();preview.classList.add('is-ready');
        };
        image.onerror=failed;image.src=link.href+'?size=preview';link.append(status,image);preview.append(link);
      }else{const mark=document.createElement('span');mark.className='photo-slot-placeholder';mark.setAttribute('aria-hidden','true');mark.textContent='+';preview.append(mark);}
    }
    const link=preview.querySelector('a');if(link)link.setAttribute('aria-label',w.viewOriginal+' · '+w[slotKeys[role]]);
    const image=preview.querySelector('img');if(image)image.alt=w[slotKeys[role]];
    const loadingCopy=preview.querySelector('.photo-slot-loading');if(loadingCopy)loadingCopy.textContent=w.imageLoading;
    const uploading=operation?.role===role;
    slot.querySelector('.photo-slot-status').textContent=uploading?(operation.percent==null?w.uploading:format(w.uploadProgress,{percent:operation.percent})):photoFeedback.has(role)?w[photoFeedback.get(role)]:id?w.photoReady:w.photoToCome;
    slot.querySelector('.photo-upload-label').textContent=uploading?w.uploading:id?w.replacePhoto:w.addPhoto;
    let progress=slot.querySelector('.photo-upload-progress');if(!progress){progress=document.createElement('progress');progress.className='manage-progress photo-upload-progress';progress.max=100;slot.querySelector('.photo-slot-status').after(progress);}
    progress.hidden=!uploading;progress.setAttribute('aria-label',w.uploading+' · '+w[slotKeys[role]]);if(uploading&&operation.percent!=null)progress.value=operation.percent;else progress.removeAttribute('value');
    const input=slot.querySelector('input'),remove=slot.querySelector('.photo-slot-remove');input.disabled=busy||activeEntry?.kind!=='race';slot.querySelector('.photo-upload-button').classList.toggle('is-disabled',input.disabled);remove.hidden=!id;remove.disabled=busy;remove.setAttribute('aria-label',w.removePhoto+' · '+w[slotKeys[role]]);
  }
}
function setBusy(value){
  busy=value;document.querySelectorAll('.entry-editor button,.entry-editor input,.entry-editor select,.entry-editor textarea,.owner-signin input,.owner-signin button,.password-editor input,.password-editor button,.manage-new button,.managed-entry,.manage-kind-switch button,#manage-category-filter,.manage-logout,#manage-retry').forEach(e=>e.disabled=value);
  updateEditorFields();renderMedia();
}
function beginOperation(key,{button,target=status,progress=document.querySelector('#manage-progress'),role}={}){
  operation={key,button,target,progress,role,percent:null,announcedPercent:-10};message(target,key);
  if(progress){progress.hidden=false;progress.removeAttribute('value');}
  button?.setAttribute('aria-busy','true');setBusy(true);renderOperation();
}
function endOperation(){
  if(operation){if(operation.button){operation.button.removeAttribute('aria-busy');operation.button.textContent=words()[operation.button.dataset.i18n];}if(operation.progress)operation.progress.hidden=true;}
  operation=null;setBusy(false);
}
function uploadProgress(percentage,currentOperation){
  if(!operation?.role||operation!==currentOperation)return;const percent=Math.max(0,Math.min(100,Math.round(percentage)));if(!Number.isFinite(percent))return;
  operation.percent=percent;
  const slot=document.querySelector('.race-photo-slot[data-slot="'+operation.role+'"]'),progress=slot.querySelector('.photo-upload-progress');progress.value=percent;
  slot.querySelector('.photo-slot-status').textContent=format(words().uploadProgress,{percent});
  if(percent===100||percent>=operation.announcedPercent+10){operation.announcedPercent=percent;message(operation.target,'uploadProgress',{percent});}
}
async function upload(event,role){
  const input=event.target,file=input.files[0];if(!file||busy||activeEntry?.kind!=='race')return;
  const entryId=activeEntry.id;photoFeedback.delete(role);beginOperation('uploading',{target:editorStatus,progress:null,role});const currentOperation=operation;
  try{
    if(file.size>8*1024*1024)throw new Error('file_too_large');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('file_type');const id=crypto.randomUUID();
    if(uploadMode==='blob'){
      const controller=new AbortController();let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},60000);
      try{await uploadBlob('media/'+id,file,{access:'private',handleUploadUrl:'/api/manage/upload',clientPayload:JSON.stringify({id}),contentType:file.type,abortSignal:controller.signal,onUploadProgress:progress=>uploadProgress(progress.percentage,currentOperation)});}
      catch(error){if(timedOut)throw new Error('request_timeout');throw error;}
      finally{clearTimeout(timer);}
      operation.percent=null;renderMedia();message(editorStatus,'saving');
      await api('manage/media/'+id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filename:file.name})});
    }else await api('manage/media/'+id+'?name='+encodeURIComponent(file.name),{method:'PUT',headers:{'content-type':file.type},body:file});
    if(activeEntry?.id===entryId){if(role==='certificate')certificate=id;else photoRoles[role]=id;photoFeedback.set(role,'photoUploaded');message(editorStatus,'photoUploaded');}
  }catch(error){const key=errorMessage(error,'saveFailed');photoFeedback.set(role,key);message(editorStatus,key);}
  finally{input.value='';endOperation();}
}
for(const slot of document.querySelectorAll('.race-photo-slot')){
  slot.querySelector('input').addEventListener('change',event=>upload(event,slot.dataset.slot));
  slot.querySelector('.photo-slot-remove').addEventListener('click',()=>{if(busy)return;if(slot.dataset.slot==='certificate')certificate='';else photoRoles[slot.dataset.slot]='';photoFeedback.set(slot.dataset.slot,'photoRemoved');renderMedia();message(editorStatus,'photoRemoved');});
}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const entry=Object.fromEntries(new FormData(form));entry.published=event.submitter?.value==='publish';
  if(entry.kind==='race'){
    entry.bodyZh=activeEntry?.bodyZh||'';entry.bodyEn=activeEntry?.bodyEn||'';entry.primaryPhoto=photoRoles.primary;entry.secondaryPhoto=photoRoles.secondary;entry.photos=[photoRoles.primary,photoRoles.secondary].filter(Boolean);entry.certificates=certificate?[certificate]:[];
  }else{
    if(entry.published&&Boolean(entry.summaryZh.trim())!==Boolean(entry.summaryEn.trim())){message(editorStatus,'bilingualSummaryRequired');field(entry.summaryZh.trim()?'summaryEn':'summaryZh').focus();return;}
    entry.photos=[];entry.certificates=[];entry.articleLayout=reconcileArticleLayout(articleLayout?.filter(block=>block.type!=='image'),entry);
  }
  beginOperation('saving',{button:event.submitter,target:editorStatus,progress:document.querySelector('#editor-progress')});
  try{const result=await api('manage/entries/'+entry.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(entry)});records=records.filter(record=>record.id!==result.entry.id);records.unshift(result.entry);if(activeEntry?.id===entry.id){activeEntry=result.entry;articleLayout=result.entry.articleLayout;photoFeedback.clear();renderEditorHeading();message(editorStatus,entry.published?'savedPublished':'savedDraft');}renderList();}
  catch(error){message(editorStatus,errorMessage(error,'saveFailed'));}
  finally{endOperation();}
});
async function refreshSession(){
  sessionLoading=true;loading.hidden=false;retry.hidden=true;signin.hidden=true;logout.hidden=true;account.hidden=true;workspace.hidden=true;recordsReady=false;message(status);if(operation?.progress)operation.progress.hidden=true;renderList();renderLoading(loading,'manageLoading',{rows:3});
  try{
    const session=await api('session'),entries=session.owner?(await api('manage/entries')).entries:[];
    uploadMode=session.uploads;records=entries;recordsReady=true;signin.hidden=session.owner;logout.hidden=!session.owner;account.hidden=!session.owner;workspace.hidden=!session.owner;
    if(!session.owner){activeEntry=null;form.hidden=true;signin.reset();passwordForm.reset();message(editorStatus);message(passwordStatus);}
    renderList();
  }catch(error){error.readFailure=true;retry.hidden=false;throw error;}
  finally{sessionLoading=false;clearLoading(loading);loading.hidden=true;}
}
async function loadSession(event){
  if(busy)return;const keyboard=event?.detail===0;let focusMoved=false;
  const trackFocus=event=>{if(![retry,document.body,root].includes(event.target))focusMoved=true;};
  if(keyboard)document.addEventListener('focusin',trackFocus);setBusy(true);
  try{await refreshSession();}
  catch(error){message(status,errorMessage(error));}
  finally{
    setBusy(false);if(keyboard)document.removeEventListener('focusin',trackFocus);
    if(keyboard&&!focusMoved&&[retry,document.body,root].includes(document.activeElement)){
      const target=!retry.hidden?retry:!signin.hidden?signin.elements.password:workspace.querySelector('.managed-entry')||workspace.querySelector('.manage-kind-switch button[aria-pressed="true"]');
      target?.focus({preventScroll:true});
    }
  }
}
retry.addEventListener('click',loadSession);
signin.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const password=signin.elements.password.value;beginOperation('signingIn',{button:signin.querySelector('button')});
  try{await api('login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});signin.reset();await refreshSession();}
  catch(error){message(status,errorMessage(error));}
  finally{endOperation();if(!signin.hidden)signin.elements.password.focus();}
});
logout.addEventListener('click',async()=>{
  if(busy)return;beginOperation('signingOut',{button:logout});
  try{await api('logout',{method:'POST'});records=[];recordsReady=false;activeEntry=null;photoRoles={primary:'',secondary:''};certificate='';form.hidden=true;workspace.hidden=true;account.hidden=true;logout.hidden=true;signin.hidden=false;signin.reset();passwordForm.reset();photoFeedback.clear();message(status);message(editorStatus);message(passwordStatus);renderList();renderMedia();}
  catch(error){message(status,errorMessage(error));}
  finally{endOperation();if(!signin.hidden)signin.elements.password.focus();}
});
function passwordMessage(key){message(passwordStatus,key);}
passwordForm.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const values=Object.fromEntries(new FormData(passwordForm));
  if(values.newPassword!==values.confirmPassword){passwordMessage('passwordMismatch');return;}
  beginOperation('saving',{button:passwordForm.querySelector('button'),target:passwordStatus,progress:document.querySelector('#password-progress')});
  try{await api('manage/password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(values)});passwordForm.reset();passwordMessage('passwordSaved');}
  catch(error){passwordMessage(errorMessage(error,'passwordFailed'));if(['owner_required','auth_changed'].includes(error.message)){passwordForm.reset();try{await refreshSession();message(status,'signInAgain');}catch(sessionError){message(status,errorMessage(sessionError));}}}
  finally{endOperation();}
});
translate();
await loadSession();
