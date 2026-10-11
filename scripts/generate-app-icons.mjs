import {copyFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';

const assets=resolve(import.meta.dirname,'../dist/assets');
const source=resolve(assets,'aevum-refined.png');
const directory=resolve(assets,'icons');
await mkdir(directory,{recursive:true});
// Preserve the original cutout and both perimeter rings; never mask or crop it.
await copyFile(source,resolve(directory,'waypoint-refined-v2-512.png'));
for(const size of [180,192]) {
  await sharp(source).resize(size,size,{fit:'contain'}).png().toFile(resolve(directory,`waypoint-refined-v2-${size}.png`));
}
console.log('Generated Waypoint install icons from the refined logo.');
