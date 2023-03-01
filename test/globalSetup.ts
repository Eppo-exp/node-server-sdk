import * as fs from 'fs';

import { Storage } from '@google-cloud/storage';

import { TEST_DATA_DIR, ASSIGNMENT_TEST_DATA_DIR } from './testHelpers';

const storage = new Storage();
const bucket = storage.bucket('sdk-test-data');

async function downloadTestDataFiles() {
  const [files] = await bucket.getFiles();

  await downloadFiles(files);
}

const downloadFile = async (file) => {
  const destination = `${TEST_DATA_DIR}${file.name}`;
  await file.download({ destination });
};

const downloadFiles = async (files) => {
  await Promise.all(
    files.map(async (file) => {
      if (file.name.endsWith('/')) {
        const [subfiles] = await bucket.getFiles({ prefix: file.name });
        await downloadFiles(subfiles);
      } else {
        await downloadFile(file);
      }
    }),
  );
};

export default async () => {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR);
    fs.mkdirSync(ASSIGNMENT_TEST_DATA_DIR);
    await downloadTestDataFiles();
  }
};
