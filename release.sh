#!/bin/bash
set -e

if [ -z "$1" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  echo "Usage: ./release.sh <version>"
  echo "Example: ./release.sh 0.4.0"
  exit 0
fi

VERSION="$1"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must be in format X.Y.Z (e.g., 0.4.0)"
  exit 1
fi

# Update package.json version
npm pkg set version="$VERSION"

# Update lockfile
npm install

# Audit, lint & test
npm audit --audit-level=critical
npm run check
npm test
npm run test:conformance

# Build
npm run build

# Docker build check
docker build -t mcpbox:$VERSION .

# Commit and tag
git add package.json package-lock.json
git commit -m "v$VERSION"
git tag "v$VERSION"

echo "Release v$VERSION ready. Run: git push origin main v$VERSION"
