#!/usr/bin/env node
// lint — 의존성 없는 정적 검사.
//  1) 인라인 JS 문법 검사 (node --check)
//  2) 이 프로젝트에서 금지한 패턴 (브라우저 모달·디버그 잔재 등)
//  3) 경고: 남아 있어도 커밋은 되지만 눈에 띄어야 하는 것들
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readIndex, inlineScripts } from './lib/extract.mjs';

// alert/confirm/prompt 는 페이지를 멈춰 세워 브라우저 자동화와 훅 검증을 막는다.
// 그래서 이 프로젝트는 인라인 확인 UI를 쓰기로 했고, 되돌아오면 안 된다.
const ERRORS = [
  [/(^|[^.\w])alert\s*\(/,        'alert() — 페이지를 멈추는 브라우저 모달. 인라인 안내(toast)를 쓰세요'],
  [/(^|[^.\w])confirm\s*\(/,      'confirm() — 두 번 눌러 확인하는 armConfirm() 패턴을 쓰세요'],
  [/(^|[^.\w])prompt\s*\(/,       'prompt() — 입력은 폼 필드로 받으세요'],
  [/(^|[^.\w])eval\s*\(/,         'eval() — 임의 코드 실행'],
  [/\bdebugger\b/,                'debugger 문이 남아 있습니다'],
  [/document\s*\.\s*write\s*\(/,  'document.write()'],
];
const WARNINGS = [
  [/console\s*\.\s*(log|debug)\s*\(/, 'console.log/debug 가 남아 있습니다'],
  [/\b(TODO|FIXME|XXX)\b/,            '미완료 표시(TODO/FIXME/XXX)'],
];

const html = await readIndex();
const scripts = inlineScripts(html);
if (scripts.length === 0){
  console.error('✗ lint: 인라인 <script> 를 찾지 못했습니다. index.html 이 비었거나 구조가 바뀌었습니다.');
  process.exit(1);
}

let errors = 0, warnings = 0;

// 1) 문법
const dir = mkdtempSync(join(tmpdir(), 'roulette-lint-'));
scripts.forEach((code, i) => {
  const f = join(dir, `inline-${i}.js`);
  writeFileSync(f, code);
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    const msg = (e.stderr?.toString() || e.message).trim().split('\n').slice(0, 6).join('\n');
    console.error(`✗ 문법 오류 (인라인 script #${i + 1})\n${msg}`);
    errors++;
  }
});
if (!errors) console.log(`✓ 문법  인라인 script ${scripts.length}개 통과`);

// 2)/3) 패턴 — 줄 번호는 index.html 기준으로 환산해서 보여준다
const lines = html.split('\n');
const inScript = new Set();
{
  let depth = 0;
  lines.forEach((line, i) => {
    if (/<script\b[^>]*>/i.test(line) && !/\bsrc=/i.test(line)) depth++;
    if (depth > 0) inScript.add(i);
    if (/<\/script>/i.test(line)) depth = Math.max(0, depth - 1);
  });
}
const scan = (rules, label, bump) => {
  for (const [re, why] of rules){
    lines.forEach((line, i) => {
      if (!inScript.has(i) || !re.test(line)) return;
      console.error(`${label} index.html:${i + 1}  ${why}\n    ${line.trim().slice(0, 100)}`);
      bump();
    });
  }
};
scan(ERRORS, '✗', () => errors++);
scan(WARNINGS, '!', () => warnings++);

if (!errors) console.log('✓ 금지 패턴  없음');
if (warnings) console.log(`! 경고 ${warnings}건 (커밋은 막지 않습니다)`);

if (errors){
  console.error(`\n✗ lint 실패: 오류 ${errors}건`);
  process.exit(1);
}
console.log('✓ lint 통과');
