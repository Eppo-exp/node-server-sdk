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

export default class HttpClient {
  public isUnauthorized = false;
  constructor(private axiosInstance: AxiosInstance, private sdkParams: ISdkParams) {}

  async get<T>(resource: string): Promise<T> {
    try {
      const response = await this.axiosInstance.get<T>(resource, { params: this.sdkParams });
      return response.data;
    } catch (error) {
      this.handleHttpError(error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleHttpError(error: any) {
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
