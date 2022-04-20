export default class PollingErrorObserver {
  public error: Error;

  notify(error: Error) {
    this.error = error;
  }
}
