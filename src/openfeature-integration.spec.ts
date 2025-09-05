import { EppoClient } from '@eppo/js-client-sdk-common';
import { OpenFeature, Client as OpenFeatureClient } from '@openfeature/server-sdk';

import { getOpenFeatureProvider } from './index';

// Mock the EppoClient and its methods
jest.mock('@eppo/js-client-sdk-common');
// Mock the getInstance function at the module level
let mockEppoClient: jest.Mocked<EppoClient>;

jest.mock('./index', () => {
  const originalModule = jest.requireActual('./index');
  return {
    ...originalModule,
    getInstance: jest.fn(() => mockEppoClient),
  };
});

describe('OpenFeature Integration', () => {
  let openFeatureClient: OpenFeatureClient;

  beforeEach(() => {
    // Reset OpenFeature state
    OpenFeature.clearProviders();

    mockEppoClient = {
      getBooleanAssignmentDetails: jest.fn(),
      getStringAssignmentDetails: jest.fn(),
      getNumericAssignmentDetails: jest.fn(),
      getJSONAssignmentDetails: jest.fn(),
      getBanditAction: jest.fn(),
    } as any;

    // Initialize the mock client (it's already mocked at module level)

    // Set up OpenFeature provider
    const provider = getOpenFeatureProvider();
    OpenFeature.setProvider(provider);
    openFeatureClient = OpenFeature.getClient();
  });

  afterEach(() => {
    jest.resetAllMocks();
    OpenFeature.clearProviders();
  });

  describe('Boolean flag evaluation', () => {
    it('should evaluate boolean flags through OpenFeature API', async () => {
      const mockAssignmentDetails = {
        variation: true,
        evaluationDetails: {
          flagKey: 'feature-toggle',
          timestamp: '2023-01-01T00:00:00Z',
        },
      };

      mockEppoClient.getBooleanAssignmentDetails.mockReturnValue(mockAssignmentDetails as any);

      const result = await openFeatureClient.getBooleanValue('feature-toggle', false, {
        targetingKey: 'user-123',
        email: 'test@example.com',
      });

      expect(result).toBe(true);
      expect(mockEppoClient.getBooleanAssignmentDetails).toHaveBeenCalledWith(
        'feature-toggle',
        'user-123',
        { email: 'test@example.com' },
        false,
      );
    });

    it('should get detailed boolean evaluation', async () => {
      const mockAssignmentDetails = {
        variation: true,
        evaluationDetails: {
          flagKey: 'feature-toggle',
          timestamp: '2023-01-01T00:00:00Z',
        },
      };

      mockEppoClient.getBooleanAssignmentDetails.mockReturnValue(mockAssignmentDetails as any);

      const result = await openFeatureClient.getBooleanDetails('feature-toggle', false, {
        targetingKey: 'user-123',
      });

      expect(result.value).toBe(true);
      expect(result.reason).toBe('TARGETING_MATCH');
      expect(result.variant).toBe('feature-toggle');
      expect(result.flagMetadata).toEqual({
        flagKey: 'feature-toggle',
        subjectKey: 'user-123',
        timestamp: '2023-01-01T00:00:00Z',
      });
    });
  });

  describe('String flag evaluation', () => {
    it('should evaluate string flags through OpenFeature API', async () => {
      const mockAssignmentDetails = {
        variation: 'treatment',
        evaluationDetails: {
          flagKey: 'string-flag',
          timestamp: '2023-01-01T00:00:00Z',
        },
      };

      mockEppoClient.getStringAssignmentDetails.mockReturnValue(mockAssignmentDetails as any);

      const result = await openFeatureClient.getStringValue('string-flag', 'control', {
        targetingKey: 'user-456',
      });

      expect(result).toBe('treatment');
      expect(mockEppoClient.getStringAssignmentDetails).toHaveBeenCalledWith(
        'string-flag',
        'user-456',
        {},
        'control',
      );
    });
  });

  describe('Number flag evaluation', () => {
    it('should evaluate numeric flags through OpenFeature API', async () => {
      const mockAssignmentDetails = {
        variation: 42,
        evaluationDetails: {
          flagKey: 'numeric-flag',
          timestamp: '2023-01-01T00:00:00Z',
        },
      };

      mockEppoClient.getNumericAssignmentDetails.mockReturnValue(mockAssignmentDetails as any);

      const result = await openFeatureClient.getNumberValue('numeric-flag', 10, {
        targetingKey: 'user-789',
        premium: true,
      });

      expect(result).toBe(42);
      expect(mockEppoClient.getNumericAssignmentDetails).toHaveBeenCalledWith(
        'numeric-flag',
        'user-789',
        { premium: true },
        10,
      );
    });
  });

  describe('Object flag evaluation', () => {
    it('should evaluate JSON flags through OpenFeature API', async () => {
      const mockResult = { theme: 'dark', features: ['a', 'b'] };
      const mockAssignmentDetails = {
        variation: mockResult,
        evaluationDetails: {
          flagKey: 'config-flag',
          timestamp: '2023-01-01T00:00:00Z',
        },
      };

      mockEppoClient.getJSONAssignmentDetails.mockReturnValue(mockAssignmentDetails as any);

      const result = await openFeatureClient.getObjectValue(
        'config-flag',
        { theme: 'light', features: [] },
        { targetingKey: 'user-abc' },
      );

      expect(result).toEqual(mockResult);
      expect(mockEppoClient.getJSONAssignmentDetails).toHaveBeenCalledWith(
        'config-flag',
        'user-abc',
        {},
        { theme: 'light', features: [] },
      );
    });

    it('should handle bandit evaluation through object flags', async () => {
      mockEppoClient.getBanditAction.mockReturnValue('recommended-action');

      const result = await openFeatureClient.getObjectValue('bandit-flag', 'default-action', {
        targetingKey: 'user-bandit',
        actions: ['action1', 'action2', 'recommended-action'],
      });

      expect(result).toBe('recommended-action');
      expect(mockEppoClient.getBanditAction).toHaveBeenCalledWith(
        'bandit-flag',
        'user-bandit',
        {},
        ['action1', 'action2', 'recommended-action'],
        'default-action',
      );
    });
  });

  describe('Error handling', () => {
    it('should return default value when evaluation fails', async () => {
      mockEppoClient.getBooleanAssignmentDetails.mockImplementation(() => {
        throw new Error('Configuration not loaded');
      });

      const result = await openFeatureClient.getBooleanValue('broken-flag', false, {
        targetingKey: 'user-error',
      });

      expect(result).toBe(false);
    });

    it('should provide error details in detailed evaluation', async () => {
      mockEppoClient.getStringAssignmentDetails.mockImplementation(() => {
        throw new Error('Network timeout');
      });

      const result = await openFeatureClient.getStringDetails('broken-flag', 'fallback', {
        targetingKey: 'user-error',
      });

      expect(result.value).toBe('fallback');
      expect(result.reason).toBe('ERROR');
      expect(result.errorMessage).toBe('Network timeout');
    });

    it('should handle missing targeting key', async () => {
      const result = await openFeatureClient.getBooleanValue('test-flag', true, {});

      expect(result).toBe(true); // Should return default
    });
  });

  describe('Context transformation', () => {
    it('should handle nested context objects', async () => {
      const mockAssignmentDetails = {
        variation: 'nested-result',
        evaluationDetails: {
          flagKey: 'nested-flag',
          timestamp: '2023-01-01T00:00:00Z',
        },
      };

      mockEppoClient.getStringAssignmentDetails.mockReturnValue(mockAssignmentDetails as any);

      await openFeatureClient.getStringValue('nested-flag', 'default', {
        targetingKey: 'user-nested',
        user: {
          profile: {
            name: 'John Doe',
            preferences: {
              notifications: true,
              theme: 'dark',
            },
          },
          subscription: {
            tier: 'premium',
            expires: '2024-12-31',
          },
        },
        device: {
          type: 'mobile',
          os: 'ios',
        },
      });

      expect(mockEppoClient.getStringAssignmentDetails).toHaveBeenCalledWith(
        'nested-flag',
        'user-nested',
        {
          'user.profile.name': 'John Doe',
          'user.profile.preferences.notifications': true,
          'user.profile.preferences.theme': 'dark',
          'user.subscription.tier': 'premium',
          'user.subscription.expires': '2024-12-31',
          'device.type': 'mobile',
          'device.os': 'ios',
        },
        'default',
      );
    });

    it('should handle arrays in context', async () => {
      const mockAssignmentDetails = {
        variation: true,
        evaluationDetails: {
          flagKey: 'array-flag',
          timestamp: '2023-01-01T00:00:00Z',
        },
      };

      mockEppoClient.getBooleanAssignmentDetails.mockReturnValue(mockAssignmentDetails as any);

      await openFeatureClient.getBooleanValue('array-flag', false, {
        targetingKey: 'user-array',
        tags: ['premium', 'beta', 'mobile'],
        scores: [85, 92, 78],
      });

      expect(mockEppoClient.getBooleanAssignmentDetails).toHaveBeenCalledWith(
        'array-flag',
        'user-array',
        {
          tags: ['premium', 'beta', 'mobile'],
          scores: [85, 92, 78],
        },
        false,
      );
    });
  });

  describe('Provider events', () => {
    it('should emit ready event on initialization', (done) => {
      const provider = getOpenFeatureProvider();

      provider.events.on('PROVIDER_READY', () => {
        done();
      });

      provider.initialize();
    });
  });
});
