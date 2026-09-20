#!/usr/bin/env node
// test — index.html 의 /* PURE */ 블록을 그대로 잘라내 node:test 로 검증한다.
// 파일 하나 제약을 지키면서도 룰렛의 위험한 부분(각도 역산·제외 폴백·샘플링 공정성)에
// 진짜 단위 테스트를 걸기 위한 방법. 프로덕션 코드에 테스트용 코드를 심지 않아도 된다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readIndex, pureBlock } from './lib/extract.mjs';

const code = pureBlock(await readIndex()) +
  '\nexport { clamp, randInt, sample, computeCandidates, spinTarget, sliceColor, shortLabel };';
const { clamp, randInt, sample, computeCandidates, spinTarget, sliceColor, shortLabel } =
  await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(code, 'utf8').toString('base64'));

/** 테스트 쪽에서 독립적으로 다시 세운 역함수: 최종 회전각에서 12시 포인터가 가리키는 조각.
 *  구현과 같은 식을 베끼지 않아야 각도 계산 버그를 실제로 잡아낸다. */
const pointerIndex = (rotation, k) => {
  const pos = (((-rotation) % 360) + 360) % 360;   // 12시에 와 있는 원판 좌표
  return Math.floor(pos / (360 / k)) % k;
};

const menu = (name, category) => ({ id: 'm_' + name, name, category });
const MENUS = [
  menu('김치찌개', '한식'), menu('비빔밥', '한식'), menu('제육볶음', '한식'),
  menu('짜장면', '중식'), menu('짬뽕', '중식'),
  menu('라멘', '일식'),
];
const hist = (...names) => names.map(n => ({ id: 'h_' + n, name: n, category: '한식' }));

/* ── clamp ─────────────────────────────────────────────── */
test('clamp: 범위 안팎을 모두 잘라낸다', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

/* ── randInt ───────────────────────────────────────────── */
test('randInt: 항상 0 ~ n-1 범위의 정수', () => {
  for (const n of [1, 2, 3, 7, 12, 33]){
    for (let i = 0; i < 500; i++){
      const v = randInt(n);
      assert.ok(Number.isInteger(v) && v >= 0 && v < n, `n=${n} 에서 ${v}`);
    }
  }
});

test('randInt: 한쪽으로 치우치지 않는다 (모듈로 편향 확인)', () => {
  const n = 5, draws = 20000, hits = new Array(n).fill(0);
  for (let i = 0; i < draws; i++) hits[randInt(n)]++;
  const expected = draws / n;
  for (let i = 0; i < n; i++){
    const dev = Math.abs(hits[i] - expected) / expected;
    assert.ok(dev < 0.1, `조각 ${i} 편차 ${(dev * 100).toFixed(1)}% (기대 ±10% 이내)`);
  }
});

/* ── sample ────────────────────────────────────────────── */
test('sample: 중복 없이 k개, 원본은 건드리지 않는다', () => {
  const src = MENUS.slice();
  const out = sample(src, 3);
  assert.equal(out.length, 3);
  assert.equal(new Set(out.map(m => m.id)).size, 3);
  assert.ok(out.every(m => src.includes(m)));
  assert.equal(src.length, MENUS.length, '원본 배열이 변형되었습니다');
});

test('sample: k가 후보보다 크면 전부 돌려준다', () => {
  assert.equal(sample(MENUS, 99).length, MENUS.length);
  assert.equal(sample([], 5).length, 0);
});

test('sample: 원판에 일부만 올려도 각 후보가 뽑힐 확률은 균등하다', () => {
  // 이 룰렛의 공정성 근거: (샘플에 들 확률 k/n) × (샘플 안 당첨 1/k) = 1/n
  const n = 10, k = 3, rounds = 20000;
  const pool = Array.from({ length: n }, (_, i) => menu('m' + i, '한식'));
  const wins = new Array(n).fill(0);
  for (let r = 0; r < rounds; r++){
    const slots = sample(pool, k);
    wins[pool.indexOf(slots[randInt(k)])]++;
  }
  const expected = rounds / n;
  for (let i = 0; i < n; i++){
    const dev = Math.abs(wins[i] - expected) / expected;
    assert.ok(dev < 0.15, `후보 ${i} 당첨 편차 ${(dev * 100).toFixed(1)}% (기대 ±15% 이내)`);
  }
});

/* ── computeCandidates ─────────────────────────────────── */
test('computeCandidates: 선택한 카테고리만 남긴다', () => {
  const { list, inCat } = computeCandidates(MENUS, ['중식'], [], 0);
  assert.deepEqual(list.map(m => m.name), ['짜장면', '짬뽕']);
  assert.equal(inCat.length, 2);
});

test('computeCandidates: 최근 N회에 먹은 메뉴를 뺀다', () => {
  const { list, relaxed } = computeCandidates(MENUS, ['한식'], hist('김치찌개', '비빔밥'), 2);
  assert.deepEqual(list.map(m => m.name), ['제육볶음']);
  assert.equal(relaxed, false);
});

test('computeCandidates: 제외 0이면 아무것도 빼지 않는다', () => {
  const { list, relaxed } = computeCandidates(MENUS, ['한식'], hist('김치찌개'), 0);
  assert.equal(list.length, 3);
  assert.equal(relaxed, false);
});

test('computeCandidates: 후보가 고갈되면 제외를 완화해 최소 1개를 남긴다', () => {
  // 한식 3개를 전부 최근에 먹었고 10회 제외 설정 → 그대로면 0개가 된다
  const { list, relaxed } = computeCandidates(MENUS, ['한식'], hist('제육볶음', '비빔밥', '김치찌개'), 10);
  assert.ok(list.length >= 1, '완화하고도 후보가 비었습니다');
  assert.equal(relaxed, true);
  assert.deepEqual(list.map(m => m.name), ['김치찌개'], '가장 오래전에 먹은 것부터 풀려야 합니다');
});

test('computeCandidates: 카테고리를 모두 끄면 빈 후보 (완화로도 못 만든다)', () => {
  const { list, inCat, relaxed } = computeCandidates(MENUS, [], hist('김치찌개'), 3);
  assert.equal(list.length, 0);
  assert.equal(inCat.length, 0);
  assert.equal(relaxed, false, '후보가 원천적으로 없는 것은 완화 상황이 아닙니다');
});

test('computeCandidates: 저장소에서 온 이상한 제외값도 버텨야 한다', () => {
  for (const bad of [undefined, null, NaN, -5, 999, '3']){
    const { list } = computeCandidates(MENUS, ['한식'], hist('김치찌개'), bad);
    assert.ok(list.length >= 1, `excludeRecent=${String(bad)} 에서 후보가 비었습니다`);
  }
});

/* ── spinTarget (가장 위험한 계산) ─────────────────────── */
test('spinTarget: 멈춘 자리의 조각이 당첨 조각과 일치한다', () => {
  for (let k = 1; k <= 12; k++){
    const seg = 360 / k;
    for (let idx = 0; idx < k; idx++){
      for (const jitter of [0, seg * 0.34, -seg * 0.34]){
        for (const start of [0, 37.5, 359.9, 1440, -720]){
          const final = spinTarget(start, idx, k, jitter, 5);
          assert.equal(pointerIndex(final, k), idx,
            `k=${k} idx=${idx} jitter=${jitter.toFixed(1)} start=${start} → ${final.toFixed(2)}도`);
        }
      }
    }
  }
});

test('spinTarget: 항상 앞으로만 돌고 요청한 바퀴 수를 지킨다', () => {
  for (const turns of [4, 5, 6]){
    for (let i = 0; i < 200; i++){
      const start = Math.random() * 5000;
      const k = 1 + Math.floor(Math.random() * 12);
      const final = spinTarget(start, randInt(k), k, 0, turns);
      const moved = final - start;
      assert.ok(moved >= turns * 360, `되감김/부족 회전: ${moved.toFixed(1)}도`);
      assert.ok(moved < (turns + 1) * 360, `과회전: ${moved.toFixed(1)}도`);
    }
  }
});

/* ── 표시용 순수 함수 ──────────────────────────────────── */
test('shortLabel: 8자를 넘으면 말줄임', () => {
  assert.equal(shortLabel('김치찌개'), '김치찌개');
  assert.equal(shortLabel('12345678'), '12345678');
  assert.equal(shortLabel('함박스테이크정식'), '함박스테이크정식');
  assert.equal(shortLabel('돼지고기김치찌개정식'), '돼지고기김치찌…');
  assert.ok(shortLabel('아'.repeat(30)).length <= 8);
});

test('sliceColor: 유효한 hsl이고 이웃 조각끼리 밝기가 다르다', () => {
  for (let k = 1; k <= 12; k++){
    for (let i = 0; i < k; i++) assert.match(sliceColor(i, k), /^hsl\(\d+ 66% \d+%\)$/);
  }
  assert.notEqual(sliceColor(0, 10), sliceColor(1, 10));
});
