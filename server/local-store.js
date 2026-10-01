import {readFile,writeFile,mkdir,readdir,rename} from 'node:fs/promises';
import {resolve} from 'node:path';

export class LocalStore {
  mode='local';
  constructor(directory){this.directory=resolve(directory);}
  async read(path) {try{return await readFile(resolve(this.directory,path));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async write(path,value) {
    await mkdir(this.directory,{recursive:true});
    const target=resolve(this.directory,path),temp=target+'.'+crypto.randomUUID()+'.tmp';
    await writeFile(temp,value,{mode:0o600});await rename(temp,target);
  }
  async entries() {
    let files;try{files=await readdir(this.directory);}catch(error){if(error.code==='ENOENT')return [];throw error;}
    const entries=await Promise.all(files.filter(file=>file.startsWith('entry-')&&file.endsWith('.json')).map(async file=>JSON.parse(await this.read(file))));
    return entries.sort((a,b)=>b.date.localeCompare(a.date));
  }
  saveEntry(entry){return this.write('entry-'+entry.id+'.json',JSON.stringify(entry));}
  async media(id){const bytes=await this.read('meta-'+id+'.json');return bytes?JSON.parse(bytes):null;}
  saveMedia(meta){return this.write('meta-'+meta.id+'.json',JSON.stringify(meta));}
  saveFile(id,bytes){return this.write('media-'+id,bytes);}
  async file(id){const bytes=await this.read('media-'+id);return bytes?{body:new Blob([bytes]).stream(),size:bytes.length}:null;}
}
