#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OUT_DIR="$SCRIPT_DIR/dist"
mkdir -p "$OUT_DIR"

TS="$(date +"%Y%m%d_%H%M%S")"
OUT_ZIP="$OUT_DIR/ws-server_deploy_${TS}.zip"

REQUIRED_FILES=("index.js" "config.js" "package.json")
OPTIONAL_FILES=("package-lock.json" "config.local.js")

for f in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "$SCRIPT_DIR/$f" ]]; then
    echo "缺少必需文件：$f"
    exit 1
  fi
done

ZIP_INPUTS=("${REQUIRED_FILES[@]}")
for f in "${OPTIONAL_FILES[@]}"; do
  if [[ -f "$SCRIPT_DIR/$f" ]]; then
    ZIP_INPUTS+=("$f")
  fi
done

if command -v zip >/dev/null 2>&1; then
  (cd "$SCRIPT_DIR" && zip -r "$OUT_ZIP" "${ZIP_INPUTS[@]}" >/dev/null)
else
  echo "未找到 zip 命令，请安装后重试（macOS 通常自带）"
  exit 1
fi

echo "已生成：$OUT_ZIP"
