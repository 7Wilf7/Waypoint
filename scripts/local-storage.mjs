import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const directory=resolve(import.meta.dirname,'../.local');
await mkdir(resolve(directory,'media'),{recursive:true});
const sqlite=new DatabaseSync(resolve(directory,'waypoint.sqlite'));
sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
for(const name of (await readdir(resolve(import.meta.dirname,'../drizzle'))).filter(name=>name.endsWith('.sql')).sort()) {
  if(sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get(name)) continue;
  sqlite.exec(await readFile(resolve(import.meta.dirname,'../drizzle',name),'utf8'));
  sqlite.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(name);
}
export const localEnv={
  WAYPOINT_OWNER_EMAIL:'preview@waypoint.local',
  DB:{prepare(sql) {
    const statement=sqlite.prepare(sql);
    const wrap=(values=[])=>({bind(...next){return wrap(next);},async all(){return {results:statement.all(...values)};},async first(){return statement.get(...values)||null;},async run(){return statement.run(...values);}});
    return wrap();
  }},
  BUCKET:{async put(key,bytes){await writeFile(resolve(directory,key),bytes);},async get(key){try {return {body:await readFile(resolve(directory,key))};} catch(error){if(error.code==='ENOENT')return null;throw error;}}},
};
