#!/usr/bin/env bash

# Run the production Traveloure client source in the preview.
# The canonical frontend is client/src; artifacts/ is not a preview or deploy target.
set -euo pipefail

PORT=5000 npm run dev