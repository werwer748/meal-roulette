# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

랜덤 식단 룰렛. `index.html` **한 파일**이 앱 전체(HTML + 인라인 CSS/JS + Canvas 원판)이고 런타임 의존성이 0이다. Node는 검사 스크립트를 돌릴 때만 쓴다.

## 명령

```bash
./scripts/check.sh              # lint → build → test 전부. 커밋 게이트가 부르는 진입점
node scripts/lint.mjs           # 인라인 JS 문법(node --check) + 금지 패턴
node scripts/build.mjs          # 단일 파일 제약·용량 검증 후 dist/ 출력
node --test scripts/test.mjs    # 단위 테스트
node --test --test-name-pattern 'spinTarget' scripts/test.mjs   # 테스트 하나만
open index.html                 # 실행 (서버 불필요)
```

브라우저 자동화(claude-in-chrome)로 확인할 때는 `file://`이 거부되므로
`python3 -m http.server 8765`로 띄우고 `http://127.0.0.1:8765/index.html`로 접속한다.

## 깨뜨리면 안 되는 제약

### `/* PURE */` 블록 계약

`index.html`의 `/* PURE:START */ … /* PURE:END */` 사이 코드는 `scripts/test.mjs`가 **텍스트로 잘라내
data: URL 모듈로 import**해서 검증한다(`scripts/lib/extract.mjs`의 `pureBlock`). 파일 하나 제약을 지키면서
단위 테스트를 걸기 위한 장치다. 따라서:

- 블록 안에서 DOM·`state`·`window`를 참조하면 테스트가 죽는다(`globalThis.crypto`는 안전).
- 블록에서 함수를 빼거나 이름을 바꾸면 `scripts/test.mjs`의 export 목록도 같이 고친다.
- 마커를 지우면 build와 test가 즉시 실패한다 — 의도된 안전장치다.

현재 순수 함수: `clamp, randInt, sample, computeCandidates, spinTarget, sliceColor, shortLabel`.

### 외부 리소스 금지

CDN·웹폰트·이미지를 `src`/`href`로 참조하면 `build`가 실패한다. 오프라인에서 파일 하나로 열려야 하므로
모든 자산은 인라인이고, 용량 예산은 200KB다.

### `alert` / `confirm` / `prompt` 금지 (lint 오류)

브라우저 모달은 페이지를 멈춰 세워 브라우저 자동화와 커밋 훅 검증을 불가능하게 만든다. 대신:

- 알림 → `toast(msg)`
- 확인 → `armConfirm(btn, onConfirm)` — 같은 버튼을 6초 안에 두 번 누르는 인라인 확인

## 아키텍처

### 상태 흐름

전역 `state` 하나를 고친 뒤 **항상 `render()` 하나만** 호출한다(단방향). `render()`가
`renderFilter / renderMenus / renderHistory / renderStatus` + 원판 재렌더를 모두 수행하므로
부분 갱신 경로를 따로 만들지 않는다.

`render()`는 `spinning` 중에 리샘플·재렌더를 건너뛴다. 회전 도중 조각을 다시 뽑으면 화면과 당첨 결과가
어긋나기 때문이다.

### 스핀: 결과를 먼저 정하고 각도를 역산

`spin()`이 `randInt(k)`로 당첨을 먼저 뽑고, `spinTarget()`이 그 조각이 12시 포인터에 오도록 누적 회전각을
계산한다. 전제 세 가지가 서로 물려 있다:

- Canvas는 조각 `i`를 `-π/2 + i*seg`부터 **시계방향**으로 그리고 CSS `rotate()`도 시계방향이라 부호가 맞는다.
- `delta`를 `[0,360)`으로 정규화해 항상 앞으로만 돈다(되감기 없음).
- jitter는 `±0.5*seg`를 넘으면 다른 조각을 가리킨다(현재 `0.35*seg`).

`transitionend`는 탭이 백그라운드로 가면 오지 않을 수 있어 `setTimeout(finishSpin, 4400)` 안전망과
`finishSpin`의 재진입 가드가 **짝으로** 존재한다. 한쪽만 손대지 말 것.

### 후보 계산과 확률 공정성

`computeCandidates(menus, activeCategories, history, excludeRecent)`:
카테고리 필터 → 최근 N회 제외 → 후보가 0이 되면 **N을 1씩 낮춰 최소 1개를 확보**하고 `relaxed: true`를 돌려준다.

후보가 원판 조각 수보다 많으면 매 스핀마다 `sample()`로 다시 뽑는데, 그래도 확률은 균등하다:
(샘플에 들 확률 k/n) × (샘플 안에서 당첨 1/k) = 1/n. 이 논증은 `spin()`이 subset일 때 **항상** 재샘플링해야
성립한다 — 캐시된 조각을 재사용하면 깨진다.

### 저장 스키마 (`localStorage: meal-roulette:v1`)

```
{ version, menus[{id,name,category}], activeCategories,
  settings{excludeRecent, wheelSlots}, history[{id,name,category,at}] }
```

- 히스토리는 `menuId`가 아니라 **이름·카테고리 스냅샷**을 저장한다. 메뉴를 지워도 기록이 깨지지 않게 한 것이고,
  최근 제외 판정도 같은 이유로 이름 기준이다.
- 읽기·쓰기 모두 `try/catch`. 로드할 때 필드별로 검증해 이상값은 기본값으로 대체하고,
  저장이 막히면 `storageOk = false`로 메모리 상태로만 동작한다(시크릿 모드 대응).

## 커밋 게이트

`.claude/settings.json`의 PreToolUse(Bash) 훅이 `git commit`을 감지해 `scripts/check.sh`를 돌리고,
실패하면 exit 2로 커밋을 막는다(`.claude/hooks/pre-commit-check.sh`). **git 훅이 아니라 Claude Code 훅**이라
사람이 터미널에서 직접 치는 커밋은 막지 않는다.

아직 git 저장소가 아니다. `git init` 할 때 `.gitignore`에 `dist/`와 `.idea/`를 넣을 것.

## 리뷰

프런트엔드 변경 후 리뷰는 `web-reviewer` 서브에이전트에게 맡긴다(`.claude/agents/web-reviewer.md`).
체크리스트와 보고 형식은 `.claude/skills/web-review/SKILL.md`에 있고, 에이전트가 그 스킬을 호출해 따른다.
