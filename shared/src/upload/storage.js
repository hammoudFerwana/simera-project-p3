const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

/**
 * Private local storage for the raw uploaded files. The folder is never
 * served statically; only the admin download endpoint reads from it.
 *
 * `storage_location` in uploaded_files holds the generated file name (not
 * the full path), so the folder can move without updating rows.
 *
 * @param {{ directory: string }} options absolute folder path
 */
function createLocalStorage({ directory }) {
  /** Resolves a stored location, refusing anything outside the folder. */
  function resolvePath(location) {
    const name = String(location || '');
    if (name === '' || path.basename(name) !== name) {
      throw new Error('Invalid storage location');
    }
    return path.join(directory, name);
  }

  return {
    /**
     * Saves the bytes unchanged under a random name.
     *
     * @param {Buffer} buffer
     * @param {string} extension e.g. '.pdf'
     * @returns {Promise<string>} the storage location
     */
    async save(buffer, extension) {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const location = `${crypto.randomUUID()}${extension}`;
      // 'wx' never overwrites an existing file.
      await fs.writeFile(resolvePath(location), buffer, {
        flag: 'wx',
        mode: 0o600
      });
      return location;
    },

    /** Deletes a saved file. A missing file is not an error. */
    async remove(location) {
      await fs.rm(resolvePath(location), { force: true });
    },

    resolvePath
  };
}

module.exports = { createLocalStorage };
