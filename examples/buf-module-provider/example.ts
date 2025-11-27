import path from 'path';

import { BufModuleProvider, parseProtoDirectory } from '../../src';

/**
 * Example demonstrating how to use the BufModuleProvider with the ModuleProvider API.
 *
 * This approach downloads complete Buf modules as raw proto files,
 * providing better performance and type resolution.
 */
async function main() {
  console.log('BufModuleProvider Example\n');
  console.log('='.repeat(50) + '\n');

  // Example 1: Basic usage with ModuleProvider API
  console.log('Example 1: Using BufModuleProvider with ModuleProvider API');
  console.log('-'.repeat(50));

  let idl = '';
  try {
    // Create module provider with modules to download
    const bufModuleProvider = new BufModuleProvider([
      'buf.build/bufbuild/protovalidate:v1.0.0', // Contains buf/validate
      'buf.build/googleapis/googleapis', // No version = latest
    ]);

    console.log('Parsing proto files with automatic Buf module resolution...');

    // Parse our example proto files that import from Buf modules
    // The BufModuleProvider is passed as a module provider and handles everything automatically
    const protos = await parseProtoDirectory(__dirname, {
      moduleProviders: [bufModuleProvider], // New clean API - no manual temp directory management!
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

    console.log('\n✓ Automatic cleanup handled by parseProtoDirectory (no manual cleanup needed!)');

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
    console.error('✗ Failed to parse with BufModuleProvider:', error);
  }

  console.log('\n' + '='.repeat(50));

  // Example 2: Error handling with authentication
  console.log('\nExample 2: Error handling and authentication');
  console.log('-'.repeat(50));

  try {
    // Try to access a private module (this will fail without proper token)
    const provider = new BufModuleProvider(['buf.build/private/module'], {
      bufToken: process.env.BUF_TOKEN, // Optional: set BUF_TOKEN environment variable
      includeDependencies: false, // Don't include dependencies for this example
    });

    await provider.getIncludePaths();
    console.log('✓ Successfully accessed private module');
    await provider.dispose();
  } catch (error) {
    console.log('✗ Expected error accessing private module without authentication:');
    console.log(`  ${(error as Error).message}`);
  }

  console.log('\n' + '='.repeat(50));

  // Example 3: Performance comparison information
  console.log('\nExample 3: Benefits of BufResolver approach');
  console.log('-'.repeat(50));

  console.log('Key advantages of BufModuleProvider approach:');
  console.log('1. ✓ Uses original proto files - no syntax reconstruction needed');
  console.log('2. ✓ Automatic dependency resolution with ?imports=true');
  console.log('3. ✓ Perfect type resolution - all imports available');
  console.log('4. ✓ Better performance - single request per module');
  console.log('5. ✓ Preserves comments, formatting, and custom options');
  console.log('6. ✓ Simpler error handling with standard HTTP status codes');
  console.log('7. ✓ Works with any import resolver by providing temp directories');

  console.log('\nUsage pattern:');
  console.log('1. Create BufModuleProvider with list of module coordinates');
  console.log('2. Pass BufModuleProvider as moduleProvider to parseProto/parseProtoDirectory');
  console.log('3. Parser automatically downloads modules and adds to include paths');
  console.log('4. Parser automatically cleans up when done - no manual cleanup needed!');

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
