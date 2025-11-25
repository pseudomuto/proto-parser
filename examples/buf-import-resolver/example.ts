import * as path from 'path';

import { BufImportResolver, parseProto } from '../../src';

/**
 * Example demonstrating how to use the BufImportResolver to resolve
 * Protocol Buffer imports from the Buf Schema Registry.
 */
async function main() {
  console.log('BufImportResolver Example\n');
  console.log('='.repeat(50) + '\n');

  // Example 1: Basic usage with public module (no authentication required)
  console.log('Example 1: Resolving public buf/validate module');
  console.log('-'.repeat(50));

  try {
    const resolver = new BufImportResolver(__dirname, {
      // Use prefix matching to resolve all buf/validate files from the same module
      'buf/validate/': 'buf.build/bufbuild/protovalidate:v1.0.0',
    });

    // Parse our example proto file that imports buf/validate/validate.proto
    const proto = await parseProto(path.join(__dirname, 'example.proto'), {
      importResolver: resolver,
      keepCase: true,
    });

    console.log(`✓ Successfully parsed: ${proto.file}`);
    console.log(`  Package: ${proto.messages?.[0]?.namespace || 'N/A'}`);
    console.log(`  Messages: ${proto.messages?.length || 0}`);
    console.log(`  Services: ${proto.services?.length || 0}`);
    console.log(`  Imports: ${proto.imports?.join(', ') || 'None'}\n`);

    // Show some of the parsed validation rules
    const userMessage = proto.messages?.find(m => m.name === 'User');
    if (userMessage) {
      console.log('  User message fields with validation:');
      userMessage.fields?.slice(0, 3).forEach(field => {
        console.log(`    - ${field.name} (${field.type}): field #${field.number}`);
      });

      console.log('  Full Proto Definition:');
      console.log(proto.idl);
    }
  } catch (error) {
    console.error('✗ Failed to parse with Buf resolver:', error);
  }
}

// Run the example
main().catch(error => {
  console.error('Example failed:', error);
  process.exit(1);
});
