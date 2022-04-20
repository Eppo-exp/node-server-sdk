import { AxiosInstance } from 'axios';
import { StatusCodes } from 'http-status-codes';

interface ISdkQueryParams {
  apiKey: string;
  sdkVersion: string;
  sdkName: string;
}

class HttpRequestError extends Error {
  constructor(public message: string, public isRecoverable: boolean) {
    super(message);
  }
}

export class InvalidApiKeyError extends HttpRequestError {}

export default class HttpClient {
  constructor(private axiosInstance: AxiosInstance, private sdkQueryParams: ISdkQueryParams) {}

  async get<T>(resource: string): Promise<T> {
    try {
      const response = await this.axiosInstance.get<T>(resource, { params: this.sdkQueryParams });
      return response.data;
    } catch (error) {
      if (error.response.status === StatusCodes.UNAUTHORIZED) {
        throw new InvalidApiKeyError(
          'Authorization failed. Please check the client API key.',
          false,
        );
      }
      const isRecoverable = isHttpErrorRecoverable(error.response.status);
      throw new HttpRequestError(error.message, isRecoverable);
    }
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
