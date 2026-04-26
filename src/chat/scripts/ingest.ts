import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    return parsed.text.replace(/\s+/g, ' ').trim();
  }

  return fs.readFileSync(filePath, 'utf-8');
}

async function ingest(title: string, content: string) {
  const res = await fetch(`${BASE_URL}/api/knowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`[FAIL] "${title}":`, (data as any).error);
    return;
  }

  console.log(`[OK] "${title}" → ${(data as any).chunks_created} chunk(s) | provider: ${(data as any).provider}`);
}

async function main() {
  const args = process.argv.slice(2);

  const batchIndex = args.indexOf('--batch');
  if (batchIndex !== -1) {
    const batchFile = args[batchIndex + 1];
    const items: { title: string; file?: string; content?: string }[] = JSON.parse(
      fs.readFileSync(path.resolve(batchFile), 'utf-8'),
    );
    console.log(`Ingesting ${items.length} document(s)...`);
    for (const item of items) {
      const content = item.file
        ? await extractText(path.resolve(path.dirname(batchFile), item.file))
        : (item.content ?? '');
      await ingest(item.title, content);
    }
    return;
  }

  const titleIndex = args.indexOf('--title');
  const fileIndex = args.indexOf('--file');
  const textIndex = args.indexOf('--text');

  if (titleIndex === -1) {
    console.error('Usage:');
    console.error('  npm run ingest -- --title "Judul" --file ./doc.pdf');
    console.error('  npm run ingest -- --title "Judul" --text "konten..."');
    console.error('  npm run ingest:batch');
    process.exit(1);
  }

  const title = args[titleIndex + 1];
  let content = '';

  if (fileIndex !== -1) {
    const filePath = path.resolve(args[fileIndex + 1]);
    console.log(`Reading: ${filePath}`);
    content = await extractText(filePath);
    console.log(`Extracted ${content.length} characters`);
  } else if (textIndex !== -1) {
    content = args[textIndex + 1];
  } else {
    console.error('Provide --file or --text');
    process.exit(1);
  }

  await ingest(title, content);
}

main().catch(console.error);
