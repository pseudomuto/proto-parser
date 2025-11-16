#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    local color=$1
    shift
    echo -e "${color}$@${NC}"
}

# Function to get current version from package.json
get_current_version() {
    node -p "require('./package.json').version"
}

# Function to check if working directory is clean
check_clean_working_dir() {
    if [[ -n $(git status -s) ]]; then
        print_color $RED "Error: Working directory is not clean. Please commit or stash your changes."
        exit 1
    fi
}

# Function to check current branch and warn if not main
check_current_branch() {
    local current_branch=$(git branch --show-current)
    local main_branch=$(git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@')
    if [[ "$current_branch" != "$main_branch" ]]; then
        print_color $YELLOW "Warning: You are not on the main branch (current: $current_branch, main: $main_branch)"
        read -p "Do you want to continue? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    echo "$current_branch"
}

# Main script
print_color $GREEN "🚀 Proto Parser Release Script"
echo

# Check prerequisites
check_clean_working_dir
CURRENT_BRANCH=$(check_current_branch)

# Pull latest changes
print_color $YELLOW "Pulling latest changes from origin..."
git pull origin "$CURRENT_BRANCH"

# Get current version
CURRENT_VERSION=$(get_current_version)
print_color $GREEN "Current version: $CURRENT_VERSION"
echo

# Ask for version bump type
print_color $YELLOW "Select version bump type:"
echo "  1) patch (x.x.X) - Bug fixes and minor changes"
echo "  2) minor (x.X.x) - New features, backwards compatible"
echo "  3) major (X.x.x) - Breaking changes"
echo "  4) prerelease (x.x.x-alpha.X) - Pre-release version"
echo "  5) custom - Enter version manually"
echo
read -p "Enter your choice (1-5): " VERSION_TYPE

case $VERSION_TYPE in
    1)
        BUMP_TYPE="patch"
        ;;
    2)
        BUMP_TYPE="minor"
        ;;
    3)
        BUMP_TYPE="major"
        ;;
    4)
        BUMP_TYPE="prerelease"
        read -p "Enter prerelease identifier (alpha/beta/rc): " PREID
        ;;
    5)
        read -p "Enter custom version: " CUSTOM_VERSION
        ;;
    *)
        print_color $RED "Invalid choice"
        exit 1
        ;;
esac

# Bump version
if [[ $VERSION_TYPE == "5" ]]; then
    npm version "$CUSTOM_VERSION" --no-git-tag-version
    NEW_VERSION="$CUSTOM_VERSION"
elif [[ $VERSION_TYPE == "4" ]]; then
    npm version prerelease --preid="$PREID" --no-git-tag-version
    NEW_VERSION=$(get_current_version)
else
    npm version "$BUMP_TYPE" --no-git-tag-version
    NEW_VERSION=$(get_current_version)
fi

print_color $GREEN "New version: $NEW_VERSION"
echo

# Run tests
print_color $YELLOW "Running tests..."
npm run test:ci

# Run linter
print_color $YELLOW "Running linter..."
npm run lint

# Build the project
print_color $YELLOW "Building project..."
npm run build

# Verify build output
if [[ ! -f "dist/index.js" ]]; then
    print_color $RED "Error: Build failed - dist/index.js not found"
    exit 1
fi

# Generate changelog entry
print_color $YELLOW "Generating changelog entry..."
CHANGELOG_ENTRY="## v$NEW_VERSION - $(date +%Y-%m-%d)\n\n"

# Get commit messages since last tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [[ -n "$LAST_TAG" ]]; then
    COMMITS=$(git log ${LAST_TAG}..HEAD --pretty=format:"* %s (%h)" | grep -v "^$")
    if [[ -n "$COMMITS" ]]; then
        CHANGELOG_ENTRY="${CHANGELOG_ENTRY}### Changes\n\n${COMMITS}\n"
    fi
fi

echo -e "$CHANGELOG_ENTRY"
echo

# Ask for confirmation
print_color $YELLOW "Ready to create release v$NEW_VERSION"
echo "This will:"
echo "  1. Commit the version bump"
echo "  2. Create a signed git tag"
echo "  3. Push changes and tag to GitHub"
echo "  4. Trigger the GitHub Actions release workflow"
echo
read -p "Do you want to proceed? (y/n) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_color $YELLOW "Release cancelled. Version bump has been made but not committed."
    print_color $YELLOW "To undo: git checkout -- package.json package-lock.json"
    exit 0
fi

# Commit version bump
print_color $YELLOW "Committing version bump..."
git add package.json package-lock.json
git commit -m "chore: release v$NEW_VERSION"

# Create signed tag with changelog
print_color $YELLOW "Creating signed tag..."
if git config --get user.signingkey > /dev/null 2>&1; then
    # If GPG signing is configured, create signed tag
    echo -e "$CHANGELOG_ENTRY" | git tag -s "v$NEW_VERSION" -F -
    print_color $GREEN "Created signed tag v$NEW_VERSION"
else
    # Otherwise create annotated tag
    echo -e "$CHANGELOG_ENTRY" | git tag -a "v$NEW_VERSION" -F -
    print_color $YELLOW "Created annotated tag v$NEW_VERSION (unsigned - no GPG key configured)"
fi

# Push changes
print_color $YELLOW "Pushing changes to GitHub..."
git push origin "$CURRENT_BRANCH"
git push origin "v$NEW_VERSION"

print_color $GREEN "✅ Release v$NEW_VERSION created successfully!"
echo
print_color $GREEN "The GitHub Actions workflow will now:"
echo "  • Run tests and build"
echo "  • Publish to NPM"
echo "  • Create a GitHub release"
echo
print_color $YELLOW "Monitor the release progress at:"
echo "https://github.com/pseudomuto/proto-parser/actions"
echo
print_color $YELLOW "Once published, the package will be available at:"
echo "https://www.npmjs.com/package/@pseudomutojs/proto-parser"