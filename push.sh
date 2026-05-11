#!/bin/bash
set -e

BRANCH=$(git branch --show-current)

echo "==> 当前分支: $BRANCH"

# 检查是否有未提交的更改
if ! git diff-index --quiet HEAD --; then
    echo "==> 发现未提交的更改，先提交..."
    git add -A
    git commit -m "Update" || {
        echo "提交失败，请手动处理"
        exit 1
    }
fi

echo "==> 推送到 origin/$BRANCH ..."
git push -u origin "$BRANCH"

echo "==> 推送完成"
