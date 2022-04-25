import * as fs from 'fs';

import { Storage } from '@google-cloud/storage';

const TEST_DATA_DIR = './test/assignmentTestData/';

const storage = new Storage();

async function downloadTestDataFiles() {
  const [files] = await storage.bucket('sdk-test-data').getFiles({
    prefix: 'assignment/test-case',
  });
  return Promise.all(
    files.map((file, index) => {
      return file.download({ destination: `${TEST_DATA_DIR}test-case-${index}.json` });
    }),
  );
}

export default async () => {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR);
    await downloadTestDataFiles();
  }
};
