## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm run test:ci`)
6. Ensure code passes linting (`npm run lint`)
7. Commit your changes (`git commit -m 'Add amazing feature'`)
8. Push to the branch (`git push origin feature/amazing-feature`)
9. Open a Pull Request

### Setup

```bash
git clone https://github.com/pseudomutojs/proto-parser.git
cd proto-parser
npm install
```

### Scripts

```bash
# Build the project
npm run build

# Run tests
npm test

# Run tests in CI mode
npm run test:ci

# Lint code
npm run lint

# Auto-fix linting issues
npm run fix
```

### Testing

The library includes comprehensive tests covering:

- File and string parsing
- Async and sync operations
- Import resolution
- Nested structures
- Error handling
- All supported proto features

## Release Process

This project uses automated releases through GitHub Actions. Releases are triggered by pushing version tags to GitHub.

### Prerequisites

Before creating a release:

1. Ensure you have an NPM account with publish permissions for `@pseudomutojs/proto-parser`
2. Set up the `NPM_TOKEN` secret in GitHub repository settings
3. Configure GPG signing for git tags (optional but recommended):
   ```bash
   git config --global user.signingkey YOUR_GPG_KEY_ID
   ```

### Creating a Release

The easiest way to create a release is using the npm script:

```bash
npm run release
```

This interactive script will:

1. Check that your working directory is clean
2. Pull the latest changes from main
3. Prompt you to select version bump type (patch/minor/major)
4. Run tests and linting
5. Build the project
6. Create a git commit with the version bump
7. Create a signed git tag
8. Push the changes and tag to GitHub

### Manual Release Process

If you prefer to release manually:

```bash
# 1. Ensure you're on main branch with clean working directory
git checkout main
git pull origin main

# 2. Bump version (replace 'patch' with 'minor' or 'major' as needed)
npm version patch

# 3. Push changes and tag (npm version creates the tag automatically)
git push origin main --tags
```

### What Happens Next

Once a tag is pushed, the GitHub Actions workflow will automatically:

1. Run tests and linting across multiple Node.js versions (22.x, 24.x)
2. Build the package
3. Publish to NPM registry
4. Create a GitHub release with:
   - Auto-generated release notes from commits
   - Package tarball as an attachment
   - Installation instructions

### Version Guidelines

- **Patch** (x.x.X): Bug fixes, documentation updates, dependency updates
- **Minor** (x.X.x): New features that are backwards compatible
- **Major** (X.x.x): Breaking changes to the API

### Pre-releases

For testing releases before making them public:

```bash
# Create a pre-release version
npm version prerelease --preid=alpha

# Push the pre-release tag
git push origin main --tags
```

Pre-releases will be published to NPM with the appropriate tag (e.g., `alpha`, `beta`, `rc`).

### Troubleshooting

If a release fails:

1. Check the [GitHub Actions logs](https://github.com/pseudomuto/proto-parser/actions)
2. Ensure `NPM_TOKEN` is correctly set in repository secrets
3. Verify the package builds locally: `npm run build`
4. Check that all tests pass: `npm run test:ci`

### NPM Token Setup

To get an NPM automation token:

1. Log in to [npmjs.com](https://www.npmjs.com)
2. Go to Access Tokens in your account settings
3. Generate a new token with "Automation" type
4. Add it as `NPM_TOKEN` in your GitHub repository secrets
