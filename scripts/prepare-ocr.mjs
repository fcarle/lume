import { copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
const destination = path.resolve('public/ocr');
await mkdir(destination, { recursive: true });
// Retain only the three LSTM runtimes selected by this app's OCR worker.
for (const file of await readdir(destination)) {
  if (/^tesseract-core/.test(file) && !/^tesseract-core.*-lstm\.wasm\.js$/.test(file)) await unlink(path.join(destination, file));
}
await copyFile('node_modules/tesseract.js/dist/worker.min.js', path.join(destination, 'worker.min.js'));
for (const name of await readdir('node_modules/tesseract.js-core')) {
  if (/^tesseract-core.*-lstm\.wasm\.js$/.test(name)) {
    await copyFile(path.join('node_modules/tesseract.js-core', name), path.join(destination, name));
  }
}
const { access, writeFile } = await import('node:fs/promises');
await mkdir(path.join(destination, 'lang'), { recursive: true });
const english = path.join(destination, 'lang/eng.traineddata.gz');
try { await access(english); } catch {
  const response = await fetch('https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz');
  if (!response.ok) throw new Error(`English OCR download failed: ${response.status}`);
  await writeFile(english, Buffer.from(await response.arrayBuffer()));
}
