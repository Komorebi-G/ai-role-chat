#!/bin/bash
set -e

BRANCH=$(git branch --show-current)

echo "==> 当前分支: $BRANCH"

# Check Prisma package version consistency
echo "==> 检查 Prisma 包版本一致性..."
ADAPTER_VERSION=$(node -e "console.log(require('./package.json').dependencies['@prisma/adapter-libsql'])")
CLIENT_VERSION=$(node -e "console.log(require('./package.json').dependencies['@prisma/client'])")
PRISMA_VERSION=$(node -e "console.log(require('./package.json').dependencies['prisma'])")

ADAPTER_MAJOR=$(echo "$ADAPTER_VERSION" | grep -oP '\^\d+' | tr -d '^')
CLIENT_MAJOR=$(echo "$CLIENT_VERSION" | grep -oP '\^\d+' | tr -d '^')
PRISMA_MAJOR=$(echo "$PRISMA_VERSION" | grep -oP '\^\d+' | tr -d '^')

if [ "$ADAPTER_MAJOR" != "$CLIENT_MAJOR" ] || [ "$ADAPTER_MAJOR" != "$PRISMA_MAJOR" ]; then
    echo "❌ Prisma 包版本不一致！"
    echo "   @prisma/adapter-libsql: $ADAPTER_VERSION (major: $ADAPTER_MAJOR)"
    echo "   @prisma/client:         $CLIENT_VERSION (major: $CLIENT_MAJOR)"
    echo "   prisma:                 $PRISMA_VERSION (major: $PRISMA_MAJOR)"
    echo ""
    echo "   所有 Prisma 相关包必须使用相同主版本。请修复 package.json 后重试。"
    echo "   参考: docs/vercel-login-crash-analysis.md"
    exit 1
fi
echo "   ✓ Prisma 包版本一致 (major: $ADAPTER_MAJOR)"

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
