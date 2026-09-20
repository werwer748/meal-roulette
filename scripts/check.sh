#!/bin/sh
# check — lint → build → test 를 한 번에. 프리커밋 훅과 사람이 쓰는 진입점이 같아야
# "훅에서만 터지는" 상황이 생기지 않는다.
# 하나가 실패해도 나머지를 계속 돌린다: 커밋을 한 번 시도했을 때 문제를 전부 보는 게 낫다.
set -u
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT" || exit 1

failed=''
step() {
  name=$1; shift
  printf '\n▶ %s\n' "$name"
  if "$@"; then
    return 0
  else
    failed="$failed $name"
    return 1
  fi
}

step lint  node scripts/lint.mjs  || true
step build node scripts/build.mjs || true
step test  node --test --test-reporter=dot scripts/test.mjs || true

if [ -n "$failed" ]; then
  printf '\n✗ 검사 실패:%s\n' "$failed"
  exit 1
fi
printf '\n✓ lint · build · test 모두 통과\n'
