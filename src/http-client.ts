import { HttpClient } from '@eppo/js-client-sdk-common';
import { AxiosInstance } from 'axios';
import { StatusCodes } from 'http-status-codes';

interface ISdkParams {
  apiKey: string;
  sdkVersion: string;
  sdkName: string;
}

export class HttpRequestError extends Error {
  constructor(public message: string, public status: number, public isRecoverable: boolean) {
    super(message);
  }
}

// Extends HttpClient from common to surface errors for polling
export default class EppoHttpClient extends HttpClient {
  public isUnauthorized = false;
  constructor(axiosInstance: AxiosInstance, sdkParams: ISdkParams) {
    super(axiosInstance, sdkParams);
  }

  async get<T>(resource: string): Promise<T | undefined> {
    try {
      return super.get(resource);
    } catch (error) {
      this._handleHttpError(error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _handleHttpError(error: any) {
    const status = error?.response?.status;
    this.isUnauthorized = status === StatusCodes.UNAUTHORIZED;
    const isRecoverable = isHttpErrorRecoverable(status);
    throw new HttpRequestError(error.message, status, isRecoverable);
  }
}

/**
 * Non-recoverable errors cause the polling to stop.
 */
function isHttpErrorRecoverable(status: number) {
  if (status >= 400 && status < 500) {
    return status === StatusCodes.TOO_MANY_REQUESTS || status === StatusCodes.REQUEST_TIMEOUT;
  }
  return true;
}
