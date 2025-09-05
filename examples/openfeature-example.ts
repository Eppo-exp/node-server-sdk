/**
 * Example demonstrating how to use Eppo SDK with OpenFeature
 */

import { OpenFeature, Client as OpenFeatureClient, ProviderEvents } from '@openfeature/server-sdk';

import { init, getOpenFeatureProvider } from '../src/index';

async function runOpenFeatureExample() {
  try {
    // 1. Initialize the Eppo SDK as usual
    await init({
      apiKey: process.env.EPPO_API_KEY || 'your-api-key',
      assignmentLogger: {
        logAssignment: (assignment) => {
          console.log('Assignment logged:', assignment);
        },
      },
    });

    console.log('✅ Eppo SDK initialized successfully');

    // 2. Get the OpenFeature provider
    const eppoProvider = getOpenFeatureProvider();

    // 3. Set the provider in OpenFeature
    OpenFeature.setProvider(eppoProvider);

    // 4. Get an OpenFeature client
    const openFeatureClient: OpenFeatureClient = OpenFeature.getClient();

    console.log('✅ OpenFeature provider configured');

    // 5. Use OpenFeature API to evaluate flags
    const userContext = {
      targetingKey: 'user-123',
      email: 'john.doe@example.com',
      subscription: 'premium',
      device: {
        type: 'mobile',
        os: 'ios',
      },
    };

    // Boolean flag evaluation
    console.log('\n--- Boolean Flag Evaluation ---');
    const showNewFeature = await openFeatureClient.getBooleanValue(
      'show-new-feature',
      false,
      userContext,
    );
    console.log(`Show new feature: ${showNewFeature}`);

    // Get detailed boolean evaluation
    const boolDetails = await openFeatureClient.getBooleanDetails(
      'show-new-feature',
      false,
      userContext,
    );
    console.log('Boolean evaluation details:', {
      value: boolDetails.value,
      reason: boolDetails.reason,
      variant: boolDetails.variant,
      flagMetadata: boolDetails.flagMetadata,
    });

    // String flag evaluation
    console.log('\n--- String Flag Evaluation ---');
    const theme = await openFeatureClient.getStringValue('ui-theme', 'light', userContext);
    console.log(`UI Theme: ${theme}`);

    // Number flag evaluation
    console.log('\n--- Number Flag Evaluation ---');
    const maxConnections = await openFeatureClient.getNumberValue(
      'max-connections',
      10,
      userContext,
    );
    console.log(`Max connections: ${maxConnections}`);

    // Object flag evaluation
    console.log('\n--- Object Flag Evaluation ---');
    const config = await openFeatureClient.getObjectValue(
      'app-config',
      { timeout: 5000, retries: 3 },
      userContext,
    );
    console.log('App config:', config);

    // Bandit evaluation using object flags
    console.log('\n--- Bandit Evaluation ---');
    const recommendedAction = await openFeatureClient.getObjectValue(
      'recommendation-bandit',
      'default-recommendation',
      {
        ...userContext,
        actions: ['product-a', 'product-b', 'product-c'],
      },
    );
    console.log(`Recommended action: ${recommendedAction}`);

    // Error handling example
    console.log('\n--- Error Handling ---');
    try {
      const resultWithBadContext = await openFeatureClient.getBooleanValue(
        'test-flag',
        true,
        {}, // Missing targetingKey
      );
      console.log(`Result with bad context: ${resultWithBadContext}`); // Should be default value
    } catch (error) {
      console.error('Error evaluating flag:', error);
    }

    // Using hooks with OpenFeature
    console.log('\n--- Using OpenFeature Hooks ---');

    // Add a hook to log all evaluations
    const loggingHook = {
      before: async (hookContext: any) => {
        console.log(`🔍 Evaluating flag: ${hookContext.flagKey}`);
      },
      after: async (hookContext: any, evaluationDetails: any) => {
        console.log(`✅ Flag ${hookContext.flagKey} evaluated to: ${evaluationDetails.value}`);
      },
      error: async (hookContext: any, error: any) => {
        console.log(`❌ Error evaluating flag ${hookContext.flagKey}: ${error.message}`);
      },
    };

    // Add hook to the client
    openFeatureClient.addHooks(loggingHook);

    // This evaluation will trigger the hook
    const hookedResult = await openFeatureClient.getStringValue(
      'hooked-flag',
      'default',
      userContext,
    );
    console.log(`Hooked result: ${hookedResult}`);

    // Multiple client example
    console.log('\n--- Multiple Clients ---');

    const analyticsClient = OpenFeature.getClient('analytics');
    const featureClient = OpenFeature.getClient('features');

    const analyticsFlag = await analyticsClient.getBooleanValue(
      'enable-analytics',
      false,
      userContext,
    );

    const betaFeature = await featureClient.getBooleanValue('beta-feature', false, userContext);

    console.log(`Analytics enabled: ${analyticsFlag}`);
    console.log(`Beta feature enabled: ${betaFeature}`);

    console.log('\n🎉 OpenFeature example completed successfully!');
  } catch (error) {
    console.error('❌ Example failed:', error);
    process.exit(1);
  }
}

// Provider events example
function setupProviderEventHandling() {
  const provider = getOpenFeatureProvider();

  provider.events.addHandler(ProviderEvents.Ready, () => {
    console.log('🚀 Provider is ready');
  });

  provider.events.addHandler(ProviderEvents.Error, (error: any) => {
    console.error('💥 Provider error:', error);
  });

  provider.events.addHandler(ProviderEvents.ConfigurationChanged, (details: any) => {
    console.log('🔄 Provider configuration changed:', details);
  });
}

// Migration example - from direct SDK to OpenFeature
async function migrationExample() {
  console.log('\n--- Migration Example ---');
  console.log('Before (Direct SDK):');

  // Direct SDK usage (existing code)
  // const eppoClient = getInstance();
  // const result = eppoClient.getBooleanAssignment('flag-key', 'user-123', {}, false);

  console.log('After (OpenFeature):');

  // OpenFeature usage (migrated code)
  const client = OpenFeature.getClient();
  const result = await client.getBooleanValue('flag-key', false, { targetingKey: 'user-123' });

  console.log(`Migrated result: ${result}`);
}

// Run the example
if (require.main === module) {
  setupProviderEventHandling();
  runOpenFeatureExample()
    .then(() => migrationExample())
    .catch((error) => {
      console.error('Failed to run example:', error);
      process.exit(1);
    });
}

export { runOpenFeatureExample, setupProviderEventHandling, migrationExample };
