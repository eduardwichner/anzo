#!/usr/bin/env bash
# npm run ops:restart-check — restart the service and prove it recovered: a new process, the only listener on the port,
# /api/live and /api/health answering. A unit that hit systemd's start limit ("start request repeated too quickly")
# refuses even a manual restart, so that state is cleared first. Exit 0 = recovered; 1 = it did not (and why).
set -uo pipefail

PORT="${PORT:-3000}"
UNIT=anzo
say() { printf '%s\n' "$*"; }
prop() { systemctl show "$UNIT" -p "$1" --value; }

say "before: $(prop ActiveState)/$(prop SubState), result $(prop Result), MainPID $(prop MainPID), NRestarts $(prop NRestarts)"
if [ "$(prop Result)" = "start-limit-hit" ] || [ "$(prop ActiveState)" = "failed" ]; then
  say "clearing the failed state (systemctl reset-failed $UNIT)"
  sudo systemctl reset-failed "$UNIT"
fi

old_pid="$(prop MainPID)"
t0=$(date +%s%N)
if ! sudo systemctl restart "$UNIT"; then
  say "FAILED: systemctl restart $UNIT refused"; systemctl status "$UNIT" --no-pager | head -15; exit 1
fi

live=""
for _ in $(seq 1 60); do
  pid="$(prop MainPID)"
  if [ "$pid" != "0" ] && [ "$pid" != "$old_pid" ] && curl -fsS -m 2 "http://127.0.0.1:${PORT}/api/live" >/dev/null 2>&1; then live=1; break; fi
  sleep 0.5
done
ms=$(( ($(date +%s%N) - t0) / 1000000 ))
pid="$(prop MainPID)"
[ -n "$live" ] || { say "FAILED: /api/live did not answer within 30 s (MainPID $pid)"; sudo tail -n 20 /var/log/anzo/app.log; exit 1; }

listeners="$(sudo ss -Hltnp "sport = :${PORT}" | grep -o 'pid=[0-9]*' | sort -u | cut -d= -f2 | tr '\n' ' ')"
for l in $listeners; do
  if [ "$l" != "$pid" ]; then say "FAILED: pid $l (not the service's $pid) also listens on :${PORT}: $(ps -o pid=,user=,args= -p "$l")"; exit 1; fi
done

health="$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/health")"
say "after:  $(prop ActiveState)/$(prop SubState), MainPID $old_pid -> $pid, listener(s) on :${PORT}: ${listeners:-none}, /api/live 200 after ${ms} ms, /api/health ${health}"
[ "$health" = "200" ] || { say "FAILED: /api/health ${health}: $(curl -s -m 5 "http://127.0.0.1:${PORT}/api/health")"; exit 1; }
say "OK: the service recovered"
