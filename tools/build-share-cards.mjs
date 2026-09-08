import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function renderShareCards(root, cards) {
  const result=spawnSync('python3',[fileURLToPath(new URL('./render-share-cards.py',import.meta.url)),root],{
    input:JSON.stringify(cards),encoding:'utf8',maxBuffer:1024*1024
  });
  if(result.error||result.status!==0)throw new Error(`Share-card build failed. Install tools/requirements-images.txt.\n${result.error||result.stderr}`);
  console.log(result.stdout.trim());
}
