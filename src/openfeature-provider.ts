import { EppoClient, Attributes } from '@eppo/js-client-sdk-common';
import {
  EvaluationContext,
  ErrorCode,
  GeneralError,
  JsonValue,
  Logger,
  OpenFeatureEventEmitter,
  ParseError,
  Provider,
  ProviderEvents,
  ProviderMetadata,
  ProviderStatus,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/server-sdk';

/**
 * OpenFeature Provider implementation for Eppo SDK
 */
export class EppoOpenFeatureProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: 'Eppo',
  };

  private _status: ProviderStatus = ProviderStatus.NOT_READY;
  readonly events = new OpenFeatureEventEmitter();

  constructor(private eppoClient: EppoClient, private logger?: Logger) {
    // Set initial status based on client state
    this._status = ProviderStatus.READY;

    // Monitor configuration changes if available
    this.setupConfigurationChangeHandlers();
  }

  get status(): ProviderStatus {
    return this._status;
  }

  /**
   * Sets up handlers for configuration changes to emit OpenFeature events
   */
  private setupConfigurationChangeHandlers(): void {
    try {
      // If the client has configuration change events, listen to them
      // Note: This assumes the EppoClient might have event capabilities
      // In practice, you'd need to check the actual EppoClient API
    } catch (error) {
      this.logger?.warn('Could not set up configuration change handlers:', error);
    }
  }

  /**
   * Converts OpenFeature EvaluationContext to Eppo Attributes
   */
  private contextToAttributes(context?: EvaluationContext): {
    subjectKey: string;
    attributes: Attributes;
  } {
    if (!context) {
      throw new GeneralError('EvaluationContext is required and must contain a targetingKey');
    }

    const { targetingKey, ...rest } = context;

    if (!targetingKey || typeof targetingKey !== 'string') {
      throw new GeneralError('targetingKey is required in EvaluationContext');
    }

    // Flatten nested objects for Eppo attributes
    const attributes = this.flattenContext(rest);

    return {
      subjectKey: targetingKey,
      attributes,
    };
  }

  /**
   * Flattens nested context objects with dot notation
   */
  private flattenContext(
    obj: any,
    prefix = '',
    result: Record<string, any> = {},
  ): Record<string, any> {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}.${key}` : key;

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          this.flattenContext(value, newKey, result);
        } else {
          result[newKey] = value;
        }
      }
    }
    return result;
  }

  /**
   * Maps Eppo evaluation errors to OpenFeature error codes
   */
  private mapEppoErrorToOpenFeature(error: any): Error {
    if (typeof error === 'string') {
      return new GeneralError(error);
    }

    if (error instanceof Error) {
      // Check for specific Eppo error types and map accordingly
      if (error.message.includes('parse') || error.message.includes('invalid')) {
        return new ParseError(error.message);
      }
      if (error.message.includes('type') || error.message.includes('mismatch')) {
        return new TypeMismatchError(error.message);
      }
      return new GeneralError(error.message);
    }

    return new GeneralError('Unknown evaluation error');
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context?: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    try {
      const { subjectKey, attributes } = this.contextToAttributes(context);

      const assignmentDetails = this.eppoClient.getBooleanAssignmentDetails(
        flagKey,
        subjectKey,
        attributes,
        defaultValue,
      );

      return {
        value: assignmentDetails.variation,
        reason: StandardResolutionReasons.TARGETING_MATCH,
        variant: assignmentDetails.evaluationDetails?.variationKey || flagKey,
        flagMetadata: {
          flagKey,
          subjectKey,
          environmentName: assignmentDetails.evaluationDetails?.environmentName,
          configFetchedAt: assignmentDetails.evaluationDetails?.configFetchedAt,
        },
      };
    } catch (error) {
      this.logger?.error(`Error evaluating boolean flag ${flagKey}:`, error);
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: this.mapEppoErrorToOpenFeature(error).message,
      };
    }
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context?: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    try {
      const { subjectKey, attributes } = this.contextToAttributes(context);

      const assignmentDetails = this.eppoClient.getStringAssignmentDetails(
        flagKey,
        subjectKey,
        attributes,
        defaultValue,
      );

      return {
        value: assignmentDetails.variation,
        reason: StandardResolutionReasons.TARGETING_MATCH,
        variant: assignmentDetails.evaluationDetails?.variationKey || flagKey,
        flagMetadata: {
          flagKey,
          subjectKey,
          environmentName: assignmentDetails.evaluationDetails?.environmentName,
          configFetchedAt: assignmentDetails.evaluationDetails?.configFetchedAt,
        },
      };
    } catch (error) {
      this.logger?.error(`Error evaluating string flag ${flagKey}:`, error);
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: this.mapEppoErrorToOpenFeature(error).message,
      };
    }
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context?: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    try {
      const { subjectKey, attributes } = this.contextToAttributes(context);

      const assignmentDetails = this.eppoClient.getNumericAssignmentDetails(
        flagKey,
        subjectKey,
        attributes,
        defaultValue,
      );

      return {
        value: assignmentDetails.variation,
        reason: StandardResolutionReasons.TARGETING_MATCH,
        variant: assignmentDetails.evaluationDetails?.variationKey || flagKey,
        flagMetadata: {
          flagKey,
          subjectKey,
          environmentName: assignmentDetails.evaluationDetails?.environmentName,
          configFetchedAt: assignmentDetails.evaluationDetails?.configFetchedAt,
        },
      };
    } catch (error) {
      this.logger?.error(`Error evaluating number flag ${flagKey}:`, error);
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: this.mapEppoErrorToOpenFeature(error).message,
      };
    }
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context?: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    try {
      const { subjectKey, attributes } = this.contextToAttributes(context);

      // Check if this is a bandit evaluation
      if (context && 'actions' in context) {
        // Handle bandit evaluation
        const actions = context.actions as string[];
        const banditResult = this.eppoClient.getBanditAction(
          flagKey,
          subjectKey,
          attributes,
          actions,
          defaultValue as any,
        );

        return {
          value: banditResult as any,
          reason: StandardResolutionReasons.TARGETING_MATCH,
          variant: flagKey,
          flagMetadata: {
            flagKey,
            subjectKey,
            banditEvaluation: true,
          },
        };
      }

      // Regular JSON evaluation
      const assignmentDetails = this.eppoClient.getJSONAssignmentDetails(
        flagKey,
        subjectKey,
        attributes,
        defaultValue as any,
      );

      return {
        value: assignmentDetails.variation as T,
        reason: StandardResolutionReasons.TARGETING_MATCH,
        variant: assignmentDetails.evaluationDetails?.variationKey || flagKey,
        flagMetadata: {
          flagKey,
          subjectKey,
          environmentName: assignmentDetails.evaluationDetails?.environmentName,
          configFetchedAt: assignmentDetails.evaluationDetails?.configFetchedAt,
        },
      };
    } catch (error) {
      this.logger?.error(`Error evaluating object flag ${flagKey}:`, error);
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: this.mapEppoErrorToOpenFeature(error).message,
      };
    }
  }

  /**
   * Initialize the provider
   */
  async initialize(context?: EvaluationContext): Promise<void> {
    try {
      this._status = ProviderStatus.READY;
      this.events.emit(ProviderEvents.Ready);
    } catch (error) {
      this._status = ProviderStatus.ERROR;
      this.events.emit(ProviderEvents.Error, error);
      throw error;
    }
  }

  /**
   * Called when the provider is no longer needed
   */
  async onClose(): Promise<void> {
    this._status = ProviderStatus.NOT_READY;
    // Clean up any resources if needed
  }

  /**
   * Called when the context changes globally
   */
  onContextChange?(_oldContext: EvaluationContext, _newContext: EvaluationContext): Promise<void>;
}
