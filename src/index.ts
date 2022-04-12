/**
 * Configuration used for initializing the Eppo client
 * @public
 */
interface IClientConfig {
  accessToken: string;
}

export const myFun = (config: IClientConfig) => {
  console.log('ff');
};
