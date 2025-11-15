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
