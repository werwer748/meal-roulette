#!/bin/sh
# PreToolUse(Bash) 훅 — Claude가 git commit 을 실행하려 할 때 프로젝트의 검사 스크립트를 먼저 돌린다.
# 통과하면 조용히 빠지고(exit 0), 실패하면 exit 2 로 커밋을 막고 stderr 를 Claude에게 돌려준다.
#
# 이건 git 훅이 아니라 Claude Code 훅이다. 사람이 터미널에서 직접 치는 커밋은 막지 않는다.
# (그쪽까지 막으려면 .git/hooks/pre-commit 에서 같은 검사 스크립트를 부르면 된다.)
#
# 플러그인으로 설치되면 모든 프로젝트의 모든 Bash 호출에서 이 훅이 돈다. 그래서
# (1) 커밋이 아닌 호출은 payload 만 보고 즉시 빠지고, (2) 검사 스크립트가 없는 프로젝트에서는
# 커밋을 막을 근거가 없으므로 역시 즉시 빠진다.
set -u

payload=$(cat)

# `git add -A && git commit -m ...` 같은 합성 명령도 놓치지 않으려고 payload 전체를 훑는다.
# (명령문에 "git commit" 이라는 글자가 들어가기만 해도 검사가 도는 건 감수한다 — 놓치는 것보다 낫다.)
case "$payload" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

# 훅은 플러그인 캐시 안에 있으므로 자기 위치로 프로젝트를 추측할 수 없다.
# CLAUDE_PROJECT_DIR 가 없으면 훅이 실행되는 작업 디렉터리를 쓴다.
PROJECT_DIR=${CLAUDE_PROJECT_DIR:-$PWD}

# 검사 스크립트 찾기. VANILLA_WEB_CHECK 로 직접 지정할 수 있고, 없으면 관례적인 위치를 순서대로 본다.
CHECK=""
for candidate in ${VANILLA_WEB_CHECK:-} "$PROJECT_DIR/scripts/check.sh" "$PROJECT_DIR/check.sh"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    CHECK=$candidate
    break
  fi
done

# 검사할 것이 없는 저장소라면 커밋을 막을 근거도 없다.
[ -n "$CHECK" ] || exit 0

if output=$(cd "$PROJECT_DIR" && "$CHECK" 2>&1); then
  exit 0
fi

# 프로젝트 안의 스크립트면 상대 경로로, 밖(VANILLA_WEB_CHECK 지정)이면 절대 경로 그대로 안내한다.
rel=${CHECK#"$PROJECT_DIR"/}
[ "$rel" = "$CHECK" ] || rel="./$rel"
{
  echo "커밋 전 검사가 실패해서 커밋을 막았습니다."
  echo "아래 문제를 고친 뒤 다시 커밋하세요. 직접 돌려보려면: $rel"
  echo
  echo "$output"
} >&2
exit 2
