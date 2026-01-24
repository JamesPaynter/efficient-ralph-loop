#!/usr/bin/env bash
set -euo pipefail

if [[ "${ORCH_CANARY:-}" == "1" ]]; then
  echo "ORCH_CANARY=1: failing as expected"
  exit 1
fi

echo "Doctor not configured. Update .mycelium/doctor.sh"
exit 0
