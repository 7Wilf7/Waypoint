import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {hashPassword} from '../server/auth.js';

await mkdir('.local',{recursive:true});
let existing='';try{existing=await readFile('.env.local','utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
if(existing.includes('WAYPOINT_PASSWORD_HASH=')) {
  console.log('Owner credentials already configured. See .local/admin-access.txt.');
}else {
  const password=randomBytes(24).toString('base64url');
  const settings='\nWAYPOINT_PASSWORD_HASH="'+hashPassword(password)+'"\nWAYPOINT_SESSION_SECRET="'+randomBytes(32).toString('hex')+'"\n';
  await writeFile('.env.local',existing+settings,{mode:0o600});await chmod('.env.local',0o600);
  await writeFile('.local/admin-access.txt','Waypoint 内容管理\n\n管理地址：https://waypoint-wilf-wu.vercel.app/manage.html\n本地管理：http://127.0.0.1:4173/manage.html\n\n管理密码：'+password+'\n\n此文件只保存在本机，未提交到 GitHub。请保存在密码管理器中。\n',{mode:0o600});
  console.log('Created owner credentials in .local/admin-access.txt (not committed).');
}
