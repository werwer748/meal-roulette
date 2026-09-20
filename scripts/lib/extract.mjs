// index.html 한 파일에서 검사 대상을 꺼내는 공용 헬퍼.
// 이 프로젝트는 빌드 도구가 없으므로 "소스"는 HTML 안의 인라인 코드다.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const INDEX = join(ROOT, 'index.html');

export const readIndex = () => readFile(INDEX, 'utf8');

/** 인라인 <script> 본문만 (src= 로 불러오는 외부 스크립트는 본문이 없으므로 건너뛴다) */
export function inlineScripts(html){
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) if (!/\bsrc=/i.test(m[1])) out.push(m[2]);
  return out;
}

/** 테스트 대상인 순수 로직 구역. 마커가 사라지면 조용히 통과하지 않고 실패해야 한다. */
export function pureBlock(html){
  const m = html.match(/\/\* PURE:START \*\/([\s\S]*?)\/\* PURE:END \*\//);
  if (!m) throw new Error('index.html에서 /* PURE:START */ … /* PURE:END */ 블록을 찾지 못했습니다.');
  return m[1];
}

// `node scripts/lib/extract.mjs --scripts` 로 직접 쓸 수도 있게
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  const html = await readIndex();
  process.stdout.write(process.argv.includes('--pure') ? pureBlock(html) : inlineScripts(html).join('\n;\n'));
}
