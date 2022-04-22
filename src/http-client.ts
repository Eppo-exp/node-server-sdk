import { AxiosInstance, AxiosResponse } from 'axios';
import { StatusCodes } from 'http-status-codes';

interface ISdkParams {
  apiKey: string;
  sdkVersion: string;
  sdkName: string;
}

// For use by POST and PUT requests
type IRequestBody<T> = { data: T } | ISdkParams;

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

  async post<T>(resource: string, data: T) {
    try {
      await this.axiosInstance.post<void, AxiosResponse<void>, IRequestBody<T>>(resource, {
        data,
        ...this.sdkParams,
      });
    } catch (error) {
      this.handleHttpError(error);
    }
  }
}

// Don't report the error if the backend is unavailable or the error cause is on the server side.
export function shouldReportHttpError(status?: number): boolean {
  return (
    status !== StatusCodes.TOO_MANY_REQUESTS &&
    status !== StatusCodes.SERVICE_UNAVAILABLE &&
    status !== StatusCodes.INTERNAL_SERVER_ERROR
  );
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
