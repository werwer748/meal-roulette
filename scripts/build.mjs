#!/usr/bin/env node
// build — 번들러가 없는 프로젝트의 "빌드"는 곧 배포 가능 상태 검증이다.
// 단일 HTML 파일이라는 제약(외부 의존 0)이 깨지지 않았는지 확인하고 dist/ 로 내보낸다.
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, INDEX, readIndex } from './lib/extract.mjs';

const html = await readIndex();
const problems = [];
let checks = 0;
const need = (cond, msg) => { checks++; if (!cond) problems.push(msg); };

need(/^\s*<!DOCTYPE html>/i.test(html),            '<!DOCTYPE html> 선언이 없습니다');
need(/<html[^>]*\blang="ko"/i.test(html),          '<html lang="ko"> 가 없습니다 (스크린리더 발음·번역에 영향)');
need(/<meta[^>]*charset=/i.test(html),             '<meta charset> 이 없습니다 (한글이 깨질 수 있습니다)');
need(/<meta[^>]*name="viewport"/i.test(html),      '<meta name="viewport"> 가 없습니다 (모바일 레이아웃이 깨집니다)');
need(/<title>[^<]+<\/title>/i.test(html),          '<title> 이 비어 있습니다');

const count = re => (html.match(re) || []).length;
need(count(/<script\b/gi) === count(/<\/script>/gi), '<script> 태그 짝이 맞지 않습니다');
need(count(/<style\b/gi)  === count(/<\/style>/gi),  '<style> 태그 짝이 맞지 않습니다');
need(count(/<canvas\b/gi) === 1,                     '<canvas> 가 정확히 하나여야 합니다');

// 단일 파일 제약: 외부에서 받아오는 스크립트·스타일·이미지가 있으면 오프라인에서 깨진다
const external = [...html.matchAll(/\b(?:src|href)\s*=\s*"((?:https?:)?\/\/[^"]+)"/gi)].map(m => m[1]);
need(external.length === 0, `외부 리소스를 참조합니다 (오프라인에서 깨집니다): ${external.join(', ')}`);

// 순수 로직 마커 — 테스트가 잡을 코드가 실제로 있는지
need(/\/\* PURE:START \*\/[\s\S]*\/\* PURE:END \*\//.test(html), '/* PURE:START */ … /* PURE:END */ 블록이 없습니다');

const { size } = await stat(INDEX);
const BUDGET = 200 * 1024;   // 파일 하나로 받는 페이지치고 과하지 않은 선
need(size <= BUDGET, `용량 초과: ${(size / 1024).toFixed(1)}KB > ${BUDGET / 1024}KB`);

if (problems.length){
  console.error('✗ build 실패');
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}

const dist = join(ROOT, 'dist');
await mkdir(dist, { recursive: true });
await writeFile(join(dist, 'index.html'), html);

console.log(`✓ build 통과  검사 ${checks}항목 · ${(size / 1024).toFixed(1)}KB (예산 ${BUDGET / 1024}KB)`);
console.log(`  → dist/index.html`);
