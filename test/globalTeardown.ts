export default async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).apiServer.close();
};
