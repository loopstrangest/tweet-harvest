#!/bin/bash

# Quick commit script for tweet-harvest
# Usage: ./quick-commit.sh "Your commit message"

if [ -z "$1" ]; then
    echo "Usage: ./quick-commit.sh \"Your commit message\""
    exit 1
fi

echo "🔍 Checking git status..."
git status

echo ""
echo "📝 Adding all changes..."
git add .

echo ""
echo "✅ Creating commit..."
git commit -m "$1

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

echo ""
echo "🚀 Pushing to GitHub..."
git push

echo ""
echo "✨ Done! Check your repository at: https://github.com/loopstrangest/tweet-harvest"