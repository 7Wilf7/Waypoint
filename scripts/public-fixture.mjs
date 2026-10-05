import sharp from 'sharp';
import {LocalStore} from '../server/local-store.js';
import {ensureImageVariants} from '../server/image-variants.js';
import {hashPassword} from '../server/auth.js';

// Entirely fictional, bounded data. Never imports an environment file or production.
export async function createPublicationFixture(directory,{races=2,articles=1,drafts=1}={}) {
  const store=new LocalStore(directory);
  const picture=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800"><rect width="1200" height="1800" fill="#244936"/><path d="M0 1400L420 650L720 1150L950 430L1200 1200V1800H0Z" fill="#9baf88"/><text x="90" y="200" fill="white" font-family="sans-serif" font-size="65">FICTIONAL FIXTURE</text></svg>');
  const image=await sharp(picture).jpeg({quality:92}).withExif({IFD0:{ImageDescription:'PRIVATE-EXIF-SENTINEL'}}).toBuffer();
  const square=await sharp({create:{width:960,height:640,channels:4,background:'#decfaa'}}).png().toBuffer();
  for(const [id,bytes,mime] of [['fixture-primary',image,'image/jpeg'],['fixture-secondary',square,'image/png'],['fixture-certificate',square,'image/png'],['fixture-draft-photo',square,'image/png'],['fixture-orphan-photo',square,'image/png']]) {
    await store.saveFile(id,bytes);const meta={id,mime,size:bytes.length,filename:'PRIVATE-FILENAME-SENTINEL.jpg'};
    await store.saveMedia(meta);await ensureImageVariants(store,meta,bytes);
  }
  const pdf=Buffer.from('%PDF-1.4\n% Fictional certificate fixture; access-control test only\n%%EOF\n');
  await store.saveFile('fixture-legacy-pdf',pdf);
  await store.saveMedia({id:'fixture-legacy-pdf',mime:'application/pdf',size:pdf.length,filename:'PRIVATE-PDF-FILENAME.pdf'});
  const entries=[];
  for(let i=0;i<races;i++)entries.push({id:'fixture-race-'+i,kind:'race',published:true,titleZh:'虚构测试赛事 '+(i+1),titleEn:'Fictional fixture race '+(i+1),date:i===0?'2026-10-01':'2026-09-'+String(28-i%28).padStart(2,'0'),bodyZh:'这是虚构的离线验证记录。\n\n只用于检验页面与公开范围。',bodyEn:'This is a fictional offline verification record.\n\nIt only tests the page and publication scope.',
    photos:i===0?['fixture-primary','fixture-secondary']:[],certificates:i===0?['fixture-certificate']:i===1?['fixture-legacy-pdf']:[],primaryPhoto:i===0?'fixture-primary':'',secondaryPhoto:i===0?'fixture-secondary':'',category:'Trail',subtype:'',distance:30,ascent:1500,result:'08:32:10',privateNote:'PRIVATE-FIELD-SENTINEL'});
  for(let i=0;i<articles;i++)entries.push({id:'fixture-article-'+i,kind:'article',published:true,titleZh:'虚构测试文章 '+(i+1),titleEn:'Fictional fixture article '+(i+1),date:'2026-09-29',publishedTime:'18:30',summaryZh:'虚构文字，用于测试双语阅读。',summaryEn:'Fictional writing for bilingual reading tests.',bodyZh:'测试文章标题\n\n这是虚构文字，不是吴凡的经历或比赛成绩。',bodyEn:'Fixture article heading\n\nThis is fictional writing, not Wilf Wu’s experience or race result.',photos:[],certificates:[],articleLayout:[{type:'heading',index:0},{type:'paragraph',index:1}],wechatUrl:'',privateNote:'PRIVATE-FIELD-SENTINEL'});
  for(let i=0;i<drafts;i++)entries.push({id:'fixture-draft-'+i,kind:'race',published:false,titleZh:'私有草稿',titleEn:'Private draft',date:'2026-10-02',bodyZh:'DRAFT-ONLY-SENTINEL',bodyEn:'DRAFT-ONLY-SENTINEL',photos:['fixture-draft-photo'],certificates:[],category:'Trail',distance:null,ascent:null,result:''});
  for(const entry of entries)await store.saveEntry(entry);
  await store.write('auth.json',JSON.stringify({hash:hashPassword('fictional-waypoint-test-password'),version:'f'.repeat(32),secret:'FAKE-AUTH-ONLY-SENTINEL'}));
  return {store,entries};
}
