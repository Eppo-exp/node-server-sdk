import { EppoClient, IEppoClient } from '@eppo/js-client-sdk-common';

import ExperimentConfigurationRequestor from '../experiment-configuration-requestor';
import { IPoller } from '../poller';

class EppoNodeClient extends EppoClient implements IEppoClient {
  constructor(configurationRequestor: ExperimentConfigurationRequestor, private poller: IPoller) {
    super(configurationRequestor.configStore);
    this.poller = poller;
  }

  public stopPolling() {
    this.poller.stop();
  }
}

interface IEppoNodeClient extends EppoNodeClient {
  /**
   * Used to manually stop the polling of Eppo servers for testing.
   */
  stopPolling(): void;
}

export default EppoNodeClient;
export { IEppoNodeClient as IEppoClient };
