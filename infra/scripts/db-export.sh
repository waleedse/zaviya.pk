#!/usr/bin/env bash
# Copy the local database to the VPS: schema + editorial data, without bulky pipeline history.
#   bash infra/scripts/db-export.sh > zaviya.sql
#   scp zaviya.sql vps:  &&  ssh vps 'docker compose exec -T postgres psql -U zaviya zaviya < zaviya.sql'
set -euo pipefail
URL="${DATABASE_URL:-$(grep '^DATABASE_URL=' "$(dirname "$0")/../../apps/web/.env" | cut -d= -f2-)}"
pg_dump "$URL" --no-owner --no-privileges \
  --exclude-table-data=source_items \
  --exclude-table-data=review_queue \
  --exclude-table-data=zaviya_pageviews \
  --exclude-table-data=zaviya_commands \
  --exclude-table-data=payload_locked_documents* \
  --exclude-table-data=payload_preferences*
