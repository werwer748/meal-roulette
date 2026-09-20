#!/bin/sh
# PreToolUse(Bash) 훅 — Claude가 git commit 을 실행하려 할 때 lint·build·test 를 먼저 돌린다.
# 통과하면 조용히 빠지고(exit 0), 실패하면 exit 2 로 커밋을 막고 stderr 를 Claude에게 돌려준다.
#
# 이건 git 훅이 아니라 Claude Code 훅이다. 사람이 터미널에서 직접 치는 커밋은 막지 않는다.
# (그쪽까지 막으려면 .git/hooks/pre-commit 에서 scripts/check.sh 를 부르면 된다.)
set -u

payload=$(cat)

# git commit 이 아닌 Bash 호출에서는 즉시 빠진다 — 모든 Bash 호출마다 도는 훅이라 첫 판단이 싸야 한다.
# `git add -A && git commit -m ...` 같은 합성 명령도 놓치지 않으려고 payload 전체를 훑는다.
# (명령문에 "git commit" 이라는 글자가 들어가기만 해도 검사가 도는 건 감수한다 — 놓치는 것보다 낫다.)
case "$payload" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

PROJECT_DIR=${CLAUDE_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}
CHECK="$PROJECT_DIR/scripts/check.sh"

# 검사 스크립트가 없는 저장소라면 커밋을 막을 근거가 없다
[ -x "$CHECK" ] || exit 0

if output=$("$CHECK" 2>&1); then
  exit 0
fi

{
  echo "커밋 전 검사(lint · build · test)가 실패해서 커밋을 막았습니다."
  echo "아래 문제를 고친 뒤 다시 커밋하세요. 직접 돌려보려면: ./scripts/check.sh"
  echo
  echo "$output"
} >&2
exit 2
