import * as fs from 'fs';
import * as path from 'path';

/**
 * Checks if the file system is read-only by attempting to write to a temporary file.
 * @param directory The directory to check for write access
 * @returns True if the file system is read-only, false otherwise
 */
export function isReadOnlyFs(directory: string): boolean {
  try {
    const testFilePath = path.join(directory, '.write_test_' + Date.now());
    fs.writeFileSync(testFilePath, 'test', { flag: 'w' });
    fs.unlinkSync(testFilePath);
    return false;
  } catch (error) {
    return true;
  }
}
