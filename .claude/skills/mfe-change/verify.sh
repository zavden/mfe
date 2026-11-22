#!/usr/bin/env bash
# Checks a change before committing it: types, lint and format of the changed files, then the
# full unit, native integration and end-to-end suites, and the production build opened from disk.
#
#   .claude/skills/mfe-change/verify.sh [--static] [--no-e2e] [--companion] [path ...]
#
#   --static     only tsc, eslint and prettier (fast; use while iterating)
#   --no-e2e     skip Playwright (the e2e suite and the check of the build)
#   --companion  run the companion's tests even though companion/ did not change
#   path         files to lint and format-check (relative to the repo root or to app/); default:
#                the changed and new files under app/ according to git
#
# tsc always checks the whole project, e2e specs included (Playwright itself does not type-check).
# docs/*.md is never format-checked: its tables are hand-made. Both suites run under `nice`
# (where the system has it; on Windows the script runs in Git Bash), the
# e2e one with 2 workers, or as many as MFE_E2E_WORKERS says (more are faster and heat the machine
# more; the summary names a number that is not 2). The e2e suite runs its slowest specs first
# (app/e2e/durations.json) and, on a Mac, waits 120 s every 200 tests for the machine to cool:
# MFE_E2E_COOL_EVERY=0 runs it without pauses, and the summary counts the ones it made. The last
# step (`dist`) builds the app and opens `dist/index.html` from file://, which the e2e suite, on
# the dev server, cannot see. One log per step goes to $MFE_VERIFY_LOGS (default: a new temp dir).
# MFE_SKIP_NATIVE=1 leaves the native Vitest project out (a machine without LaTeX): the summary
# says so on the vitest line and in a last WARNING line, and such a run is not the full gate.
# The companion has its own tests (companion/tests, Python's unittest; several minutes, most of
# them the two fidelity runs against Manim): they run when something under companion/ changed
# since the last commit, or with --companion, and their line tells how many were skipped (a
# machine without LaTeX or the Manim virtualenvs skips most of them).
# The exit code is the number of failed steps.
set -u

static=0
e2e=1
companion=0
paths=()
for arg in "$@"; do
  case "$arg" in
    --static) static=1 ;;
    --no-e2e) e2e=0 ;;
    --companion) companion=1 ;;
    -h | --help)
      sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) paths+=("${arg#app/}") ;;
  esac
done

repo=$(cd "$(dirname "$0")/../../.." && pwd)
app="$repo/app"
logs=${MFE_VERIFY_LOGS:-$(mktemp -d -t mfe-verify.XXXXXX)}
mkdir -p "$logs"
cd "$app" || exit 99

# The Python of the PATH runs the companion's tests: `python3`, and `python` in Git Bash on
# Windows, where the installer of python.org gives no `python3`. MFE_PYTHON names another one.
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) python=${MFE_PYTHON:-python} ;;
  *) python=${MFE_PYTHON:-python3} ;;
esac
# The suites run at a low priority, where the system has `nice`.
calm() {
  if command -v nice >/dev/null 2>&1; then nice -n 10 "$@"; else "$@"; fi
}

if [ ${#paths[@]} -eq 0 ]; then
  while IFS= read -r file; do
    [ -f "$file" ] && paths+=("$file")
  done < <(
    {
      git diff --name-only --relative HEAD -- .
      git ls-files --others --exclude-standard -- .
    } | sort -u
  )
fi
# The companion is Python: none of the other steps sees it. Changed since the last commit?
companion_changed=0
if [ -n "$(
  git -C "$repo" diff --name-only HEAD -- companion 2>/dev/null
  git -C "$repo" ls-files --others --exclude-standard -- companion 2>/dev/null
)" ]; then
  companion_changed=1
  companion=1
fi
lintable=()
formattable=()
# ${a[@]+"${a[@]}"}: the bash of macOS (3.2) takes an empty array for an unset variable under -u.
for file in ${paths[@]+"${paths[@]}"}; do
  case "$file" in
    *.ts | *.tsx | *.js | *.mjs) lintable+=("$file") ;;
  esac
  case "$file" in
    ../* | src/data/*) ;;
    *.ts | *.tsx | *.js | *.mjs | *.css | *.json | *.html) formattable+=("$file") ;;
  esac
done

failed=0
summary=()
note() { summary+=("$(printf '%-9s %s' "$1" "$2")"); }

npx tsc -b >"$logs/tsc.log" 2>&1
if [ $? -eq 0 ]; then note tsc ok; else
  failed=$((failed + 1))
  note tsc "FAILED: $(grep -c 'error TS' "$logs/tsc.log") error(s)"
fi

if [ ${#lintable[@]} -gt 0 ]; then
  npx eslint "${lintable[@]}" >"$logs/eslint.log" 2>&1
  if [ $? -eq 0 ]; then note eslint "ok (${#lintable[@]} files)"; else
    failed=$((failed + 1))
    note eslint FAILED
  fi
else note eslint "skipped (no files)"; fi

if [ ${#formattable[@]} -gt 0 ]; then
  npx prettier --check "${formattable[@]}" >"$logs/prettier.log" 2>&1
  if [ $? -eq 0 ]; then note prettier "ok (${#formattable[@]} files)"; else
    failed=$((failed + 1))
    note prettier "FAILED: $(grep -c '^\[warn\] [^C]' "$logs/prettier.log") file(s); npx prettier --write <file>"
  fi
else note prettier "skipped (no files)"; fi

if [ $static -eq 0 ]; then
  # npm test is the aggregate gate: both the unit and required native Vitest projects.
  calm npm test >"$logs/vitest.log" 2>&1
  status=$?
  counts=$(grep -E '^ +Tests ' "$logs/vitest.log" | tail -1 | sed -E 's/^ +Tests +//')
  if [ "${MFE_SKIP_NATIVE:-}" = 1 ]; then scope="unit only, NATIVE SKIPPED"; else scope="unit + native"; fi
  if [ $status -eq 0 ]; then note vitest "ok ($scope): $counts"; else
    failed=$((failed + 1))
    note vitest "FAILED (exit $status, $scope): ${counts:-see log}"
  fi

  if [ $companion -eq 1 ]; then
    (cd "$repo" && calm "$python" -m unittest discover -s companion/tests) >"$logs/companion.log" 2>&1
    status=$?
    counts=$(grep -E '^Ran [0-9]+ tests? in ' "$logs/companion.log" | tail -1 | sed -E 's/^Ran ([0-9]+ tests?).*/\1/')
    outcome=$(grep -E '^(OK|FAILED)' "$logs/companion.log" | tail -1)
    if [ $status -eq 0 ]; then note companion "ok: ${counts:-no count}${outcome:+, $outcome}"; else
      failed=$((failed + 1))
      note companion "FAILED (exit $status): ${counts:-see log}${outcome:+, $outcome}"
    fi
  else note companion "skipped (companion/ unchanged; --companion runs its tests)"; fi

  if [ $e2e -eq 1 ]; then
    workers=${MFE_E2E_WORKERS:-2}
    case $workers in '' | *[!0-9]* | 0) workers=2 ;; esac
    calm npx playwright test --workers="$workers" >"$logs/e2e.log" 2>&1
    status=$?
    counts=$(grep -E '^ +[0-9]+ (passed|failed|flaky|skipped|did not run)' "$logs/e2e.log" |
      sed -E 's/^ +//; s/ \(.*\)$//' | paste -sd, - | sed 's/,/, /g')
    [ "$workers" -ne 2 ] && counts="${counts:+$counts, }$workers workers"
    pauses=$(grep -c ' tests have run: a pause of ' "$logs/e2e.log")
    [ "$pauses" -gt 0 ] && counts="${counts:+$counts, }$pauses pause(s) to cool"
    if [ $status -eq 0 ]; then note e2e "ok: $counts"; else
      failed=$((failed + 1))
      note e2e "FAILED (exit $status): ${counts:-see log}"
    fi

    calm npm run dist-check >"$logs/dist.log" 2>&1
    status=$?
    counts=$(grep -E '^ +[0-9]+ (passed|failed|flaky|skipped|did not run)' "$logs/dist.log" |
      sed -E 's/^ +//; s/ \(.*\)$//' | paste -sd, - | sed 's/,/, /g')
    if [ $status -eq 0 ]; then note dist "ok (build, file://): $counts"; else
      failed=$((failed + 1))
      note dist "FAILED (exit $status): ${counts:-the build failed, see log}"
    fi
  fi
fi

if [ $static -eq 1 ] && [ $companion_changed -eq 1 ]; then
  note companion "not run (--static): companion/ changed, the full run tests it"
elif [ $static -eq 1 ] && [ $companion -eq 1 ]; then
  note companion "not run (--static)"
fi
if [ $static -eq 0 ] && [ "${MFE_SKIP_NATIVE:-}" = 1 ]; then
  note WARNING "native tests skipped on purpose (MFE_SKIP_NATIVE=1): this is not the full gate"
fi
printf '%s\n' "${summary[@]}"
echo "logs: $logs"
exit $failed
