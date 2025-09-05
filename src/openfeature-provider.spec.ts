import { EppoClient } from '@eppo/js-client-sdk-common';
import {
  EvaluationContext,
  Logger,
  ProviderStatus,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';

import { EppoOpenFeatureProvider } from './openfeature-provider';

describe('EppoOpenFeatureProvider', () => {
  let mockEppoClient: jest.Mocked<EppoClient>;
  let provider: EppoOpenFeatureProvider;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockEppoClient = {
      getBooleanAssignmentDetails: jest.fn(),
      getStringAssignmentDetails: jest.fn(),
      getNumericAssignmentDetails: jest.fn(),
      getJSONAssignmentDetails: jest.fn(),
      getBanditAction: jest.fn(),
    } as any;

    provider = new EppoOpenFeatureProvider(mockEppoClient, mockLogger);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('metadata', () => {
    it('should have correct provider metadata', () => {
      expect(provider.metadata.name).toBe('Eppo');
    });

    it('should initialize with READY status', () => {
      expect(provider.status).toBe(ProviderStatus.READY);
    });
  });

  describe('contextToAttributes', () => {
    it('should throw error when context is undefined', async () => {
      await expect(provider.resolveBooleanEvaluation('test-flag', false)).resolves.toMatchObject({
        value: false,
        reason: StandardResolutionReasons.ERROR,
        errorCode: 'GENERAL',
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error evaluating boolean flag test-flag:'),
        expect.any(Error),
      );
    });

    it('should throw error when targetingKey is missing', async () => {
      const context: EvaluationContext = {};

      await expect(
        provider.resolveBooleanEvaluation('test-flag', false, context),
      ).resolves.toMatchObject({
        value: false,
        reason: StandardResolutionReasons.ERROR,
        errorCode: 'GENERAL',
      });
    });

    it('should handle simple context correctly', async () => {
      const context: EvaluationContext = {
        targetingKey: 'user-123',
        email: 'test@example.com',
        age: 30,
      };

      mockEppoClient.getBooleanAssignmentDetails.mockReturnValue({
        variation: true,
        evaluationDetails: {
          flagKey: 'test-flag',
          timestamp: new Date().toISOString(),
        },
      } as any);

      await provider.resolveBooleanEvaluation('test-flag', false, context);

      expect(mockEppoClient.getBooleanAssignmentDetails).toHaveBeenCalledWith(
        'test-flag',
        'user-123',
        { email: 'test@example.com', age: 30 },
        false,
      );
    });

    it('should flatten nested context objects', async () => {
      const context: EvaluationContext = {
        targetingKey: 'user-123',
        user: {
          profile: {
            name: 'John Doe',
            preferences: {
              theme: 'dark',
            },
          },
        },
      };

      mockEppoClient.getBooleanAssignmentDetails.mockReturnValue({
        variation: true,
        evaluationDetails: {
          flagKey: 'test-flag',
          timestamp: new Date().toISOString(),
        },
      } as any);

      await provider.resolveBooleanEvaluation('test-flag', false, context);

      expect(mockEppoClient.getBooleanAssignmentDetails).toHaveBeenCalledWith(
        'test-flag',
        'user-123',
        {
          'user.profile.name': 'John Doe',
          'user.profile.preferences.theme': 'dark',
        },
        false,
      );
    });
  });

  describe('resolveBooleanEvaluation', () => {
    const validContext: EvaluationContext = {
      targetingKey: 'user-123',
      email: 'test@example.com',
    };

    it('should resolve boolean flags successfully', async () => {
      const mockResult = {
        variation: true,
        evaluationDetails: {
          variationKey: 'test-variation',
          environmentName: 'Test',
          configFetchedAt: '2023-01-01T00:00:00Z',
        },
      };

      mockEppoClient.getBooleanAssignmentDetails.mockReturnValue(mockResult as any);

      const result = await provider.resolveBooleanEvaluation('test-flag', false, validContext);

      expect(result.value).toBe(true);
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      expect(result.variant).toBe('test-variation');
      expect(result.flagMetadata).toEqual(
        expect.objectContaining({
          flagKey: 'test-flag',
          subjectKey: 'user-123',
        }),
      );
    });

    it('should handle evaluation errors gracefully', async () => {
      mockEppoClient.getBooleanAssignmentDetails.mockImplementation(() => {
        throw new Error('Evaluation failed');
      });

      const result = await provider.resolveBooleanEvaluation('test-flag', false, validContext);

      expect(result).toMatchObject({
        value: false,
        reason: StandardResolutionReasons.ERROR,
        errorCode: 'GENERAL',
        errorMessage: 'Evaluation failed',
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error evaluating boolean flag test-flag:',
        expect.any(Error),
      );
    });
  });

  describe('resolveStringEvaluation', () => {
    const validContext: EvaluationContext = {
      targetingKey: 'user-123',
    };

    it('should resolve string flags successfully', async () => {
      const mockResult = {
        variation: 'treatment',
        evaluationDetails: {
          variationKey: 'treatment-variation',
          environmentName: 'Test',
          configFetchedAt: '2023-01-01T00:00:00Z',
        },
      };

      mockEppoClient.getStringAssignmentDetails.mockReturnValue(mockResult as any);

      const result = await provider.resolveStringEvaluation('test-flag', 'default', validContext);

      expect(result.value).toBe('treatment');
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      expect(result.flagMetadata).toEqual(
        expect.objectContaining({
          flagKey: 'test-flag',
          subjectKey: 'user-123',
        }),
      );
    });

    it('should return default value on error', async () => {
      mockEppoClient.getStringAssignmentDetails.mockImplementation(() => {
        throw new Error('Network error');
      });

      const result = await provider.resolveStringEvaluation('test-flag', 'default', validContext);

      expect(result.value).toBe('default');
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
    });
  });

  describe('resolveNumberEvaluation', () => {
    const validContext: EvaluationContext = {
      targetingKey: 'user-123',
    };

    it('should resolve numeric flags successfully', async () => {
      const mockResult = {
        variation: 42,
        evaluationDetails: {
          variationKey: 'numeric-variation',
          environmentName: 'Test',
          configFetchedAt: '2023-01-01T00:00:00Z',
        },
      };

      mockEppoClient.getNumericAssignmentDetails.mockReturnValue(mockResult as any);

      const result = await provider.resolveNumberEvaluation('test-flag', 10, validContext);

      expect(result.value).toBe(42);
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      expect(result.flagMetadata).toEqual(
        expect.objectContaining({
          flagKey: 'test-flag',
          subjectKey: 'user-123',
        }),
      );
    });
  });

  describe('resolveObjectEvaluation', () => {
    const validContext: EvaluationContext = {
      targetingKey: 'user-123',
    };

    it('should resolve JSON flags successfully', async () => {
      const mockResult = {
        variation: { key: 'value', number: 123 },
        evaluationDetails: {
          variationKey: 'json-variation',
          environmentName: 'Test',
          configFetchedAt: '2023-01-01T00:00:00Z',
        },
      };

      mockEppoClient.getJSONAssignmentDetails.mockReturnValue(mockResult as any);

      const defaultValue = { default: true };
      const result = await provider.resolveObjectEvaluation(
        'test-flag',
        defaultValue,
        validContext,
      );

      expect(result.value).toEqual({ key: 'value', number: 123 });
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      expect(result.flagMetadata).toEqual(
        expect.objectContaining({
          flagKey: 'test-flag',
          subjectKey: 'user-123',
        }),
      );
    });

    it('should handle bandit evaluation when actions are present', async () => {
      const contextWithActions: EvaluationContext = {
        targetingKey: 'user-123',
        actions: ['action1', 'action2', 'action3'],
      };

      const mockBanditResult = 'action2';
      mockEppoClient.getBanditAction.mockReturnValue(mockBanditResult);

      const result = await provider.resolveObjectEvaluation(
        'bandit-flag',
        'default-action',
        contextWithActions,
      );

      expect(mockEppoClient.getBanditAction).toHaveBeenCalledWith(
        'bandit-flag',
        'user-123',
        {},
        ['action1', 'action2', 'action3'],
        'default-action',
      );

      expect(result).toEqual({
        value: 'action2',
        reason: StandardResolutionReasons.TARGETING_MATCH,
        variant: 'bandit-flag',
        flagMetadata: {
          flagKey: 'bandit-flag',
          subjectKey: 'user-123',
          banditEvaluation: true,
        },
      });
    });
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const newProvider = new EppoOpenFeatureProvider(mockEppoClient);

      // Set up event listener
      let readyEmitted = false;
      newProvider.events.on('PROVIDER_READY', () => {
        readyEmitted = true;
      });

      await newProvider.initialize();

      expect(newProvider.status).toBe(ProviderStatus.READY);
      expect(readyEmitted).toBe(true);
    });

    it('should handle initialization errors', async () => {
      const newProvider = new EppoOpenFeatureProvider(mockEppoClient);

      // Mock initialization to throw an error
      jest.spyOn(newProvider, 'initialize').mockImplementation(async () => {
        throw new Error('Initialization failed');
      });

      await expect(newProvider.initialize()).rejects.toThrow('Initialization failed');
    });
  });

  describe('lifecycle methods', () => {
    it('should handle onClose', async () => {
      await provider.onClose();
      expect(provider.status).toBe(ProviderStatus.NOT_READY);
    });
  });

  describe('error mapping', () => {
    const validContext: EvaluationContext = {
      targetingKey: 'user-123',
    };

    it('should map string errors to GeneralError', async () => {
      mockEppoClient.getBooleanAssignmentDetails.mockImplementation(() => {
        throw 'String error';
      });

      const result = await provider.resolveBooleanEvaluation('test-flag', false, validContext);
      expect(result.errorMessage).toBe('String error');
    });

    it('should map parse errors correctly', async () => {
      mockEppoClient.getBooleanAssignmentDetails.mockImplementation(() => {
        throw new Error('Invalid parse operation');
      });

      const result = await provider.resolveBooleanEvaluation('test-flag', false, validContext);
      expect(result.errorMessage).toBe('Invalid parse operation');
    });

    it('should map type mismatch errors correctly', async () => {
      mockEppoClient.getBooleanAssignmentDetails.mockImplementation(() => {
        throw new Error('Type mismatch detected');
      });

      const result = await provider.resolveBooleanEvaluation('test-flag', false, validContext);
      expect(result.errorMessage).toBe('Type mismatch detected');
    });

    it('should handle unknown errors', async () => {
      mockEppoClient.getBooleanAssignmentDetails.mockImplementation(() => {
        throw { unknownError: true };
      });

      const result = await provider.resolveBooleanEvaluation('test-flag', false, validContext);
      expect(result.errorMessage).toBe('Unknown evaluation error');
    });
  });
});
