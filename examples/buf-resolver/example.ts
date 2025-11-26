import path from 'path';

import { BufResolver, DefaultFileSystem, DefaultImportResolver, parseProtoDirectory } from '../../src';

/**
 * Example demonstrating how to use the BufResolver to preload Buf modules
 * and integrate with the existing import resolution system.
 *
 * This approach downloads complete Buf modules as raw proto files,
 * providing better performance and type resolution.
 */
async function main() {
  console.log('BufResolver Example\n');
  console.log('='.repeat(50) + '\n');

  // Example 1: Basic usage with module preloading
  console.log('Example 1: Preloading Buf modules');
  console.log('-'.repeat(50));

  let idl = '';
  try {
    // Create resolver with modules to preload
    const bufResolver = new BufResolver([
      'buf.build/bufbuild/protovalidate:v1.0.0', // Contains buf/validate
      'buf.build/googleapis/googleapis', // No version = latest
    ]);

    // Preload all modules and their dependencies
    console.log('Downloading and extracting Buf modules...');
    const tempDirs = await bufResolver.preloadModules();

    console.log(`✓ Successfully preloaded modules to ${tempDirs.length} directories:`);
    tempDirs.forEach((dir, i) => {
      console.log(`  ${i + 1}. ${dir}`);
    });

    // Create import resolver with file system and preloaded directories
    const fileSystem = new DefaultFileSystem();
    const importResolver = new DefaultImportResolver(__dirname, fileSystem, {
      includePaths: tempDirs, // Add temp directories to include paths - they now contain all the proto files
    });

    // Parse our example proto files that import from Buf modules
    // This will now pick up both user.proto and service.proto
    const protos = await parseProtoDirectory(__dirname, {
      importResolver,
      keepCase: true,
    });

    for (const proto of protos.getProtos()) {
      console.log(`\n✓ Successfully parsed: ${proto.file}`);
      console.log(`  Package: ${proto.messages?.[0]?.namespace || 'N/A'}`);
      console.log(`  Messages: ${proto.messages?.length || 0}`);
      console.log(`  Services: ${proto.services?.length || 0}`);
      console.log(`  Imports: ${proto.imports?.join(', ') || 'None'}`);

      // Show some of the parsed content
      if (proto.messages && proto.messages.length > 0) {
        console.log('\nFirst message:');
        const firstMessage = proto.messages[0];
        console.log(`  Name: ${firstMessage.name}`);
        console.log(`  Fields: ${firstMessage.fields?.length || 0}`);

        if (firstMessage.fields && firstMessage.fields.length > 0) {
          console.log('  Field details:');
          firstMessage.fields.slice(0, 3).forEach(field => {
            console.log(`    - ${field.name}: ${field.type} (field #${field.number})`);
          });
        }
      }
    }

    // Clean up temporary directories
    await bufResolver.cleanup();
    console.log('\n✓ Cleaned up temporary directories');

    // Demonstrate the file attribution feature
    console.log('\n🔍 File attribution demonstration:');

    // Show all Proto objects that were created
    console.log(`Total Proto objects created: ${protos.size()}`);
    for (const proto of protos.getProtos()) {
      console.log(
        `  - ${proto.file}: ${proto.messages?.length || 0} messages, ${proto.services?.length || 0} services`,
      );
    }

    // Show sample file attribution from full IDL (including external protos)
    const fullIdl = protos.generateSupersetIdl({
      baseDir: path.resolve(__dirname, '../../'),
      includeComments: true,
      includeLocalOnly: false,
    });
    const lines = fullIdl.split('\n');
    const relevantLines = lines.filter(line => line.includes('// From:'));
    const uniqueAttributions = [...new Set(relevantLines)];
    console.log('\nSample file attributions found:');
    uniqueAttributions.slice(0, 5).forEach(line => console.log(`  ${line}`));

    idl = protos.generateSupersetIdl({
      baseDir: path.resolve(__dirname, '../../'),
      includeComments: true,
    });
  } catch (error) {
    console.error('✗ Failed to preload and parse with BufResolver:', error);
  }

  console.log('\n' + '='.repeat(50));

  // Example 2: Error handling with authentication
  console.log('\nExample 2: Error handling and authentication');
  console.log('-'.repeat(50));

  try {
    // Try to access a private module (this will fail without proper token)
    const resolver = new BufResolver(['buf.build/private/module'], {
      bufToken: process.env.BUF_TOKEN, // Optional: set BUF_TOKEN environment variable
      includeDependencies: false, // Don't include dependencies for this example
    });

    await resolver.preloadModules();
    console.log('✓ Successfully accessed private module');
    await resolver.cleanup();
  } catch (error) {
    console.log('✗ Expected error accessing private module without authentication:');
    console.log(`  ${(error as Error).message}`);
  }

  console.log('\n' + '='.repeat(50));

  // Example 3: Performance comparison information
  console.log('\nExample 3: Benefits of BufResolver approach');
  console.log('-'.repeat(50));

  console.log('Key advantages of BufResolver approach:');
  console.log('1. ✓ Uses original proto files - no syntax reconstruction needed');
  console.log('2. ✓ Automatic dependency resolution with ?imports=true');
  console.log('3. ✓ Perfect type resolution - all imports available');
  console.log('4. ✓ Better performance - single request per module');
  console.log('5. ✓ Preserves comments, formatting, and custom options');
  console.log('6. ✓ Simpler error handling with standard HTTP status codes');
  console.log('7. ✓ Works with any import resolver by providing temp directories');

  console.log('\nUsage pattern:');
  console.log('1. Create BufResolver with list of module coordinates');
  console.log('2. Call preloadModules() to download and extract to temp dirs');
  console.log('3. Add temp dirs to your ImportResolver include paths');
  console.log('4. Parse protos normally - all imports will be resolved');
  console.log('5. Call cleanup() when done to remove temp directories');

  // Example 4: Complete proto file
  console.log('\nExample 4: Compiled proto file');
  console.log('-'.repeat(50));
  console.log(idl);
}

// Run the example
main().catch(error => {
  console.error('Example failed:', error);
  process.exit(1);
});
