import { readFile, writeFile } from 'node:fs/promises';

const wranglerConfigPath = new URL('../dist/server/wrangler.json', import.meta.url);
const raw = await readFile(wranglerConfigPath, 'utf8');
const config = JSON.parse(raw);

if (config.assets?.binding === 'ASSETS') {
  config.assets.binding = 'BROCHURE_ASSETS';
}

await writeFile(wranglerConfigPath, `${JSON.stringify(config)}\n`);
