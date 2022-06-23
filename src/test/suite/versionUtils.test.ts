/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Harness, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
  asGithubTag,
  asVersionNumber,
  cacheAndGetLatestRelease,
} from '../../util/versionUtils';
import * as fsex from 'fs-extra';
import * as path from 'path';
import * as _ from 'lodash';
import { failed } from '../../errorable';

suite('VersionUtils Test Suite', () => {
  const cacheDir = fsex.mkdtempSync(path.join(__dirname, 'version_utils'));
  const releaseCacheFile = path.join(cacheDir, 'drone-cli-releases.json');
  const owner = 'harness';
  const repo = 'drone-cli';
  test('Create Cache If Not Present', async () => {
    const result = await cacheAndGetLatestRelease(
      owner,
      repo,
      releaseCacheFile
    );
    assert.equal(
      result.succeeded,
      true,
      'Expecting cache to succeed but failed'
    );
    assert.equal(
      fsex.pathExistsSync(releaseCacheFile),
      true,
      'Expecting the release cache JSON file to be created'
    );
  });

  test('Ensure Cache File Is Reused', async () => {
    const cachedResult = await cacheAndGetLatestRelease(
      owner,
      repo,
      releaseCacheFile
    );

    assert.equal(
      fsex.pathExistsSync(releaseCacheFile),
      true,
      'Expecting the release cache JSON file to be created'
    );

    assert.equal(
      failed(cachedResult),
      false,
      'Expecting Cache Result to succeed'
    );

    if (!failed(cachedResult)) {
      assert.equal(
        cachedResult.result,
        'v1.5.0',
        `Expecting latest release to be "v1.5.0" but got ${cachedResult.result}`
      );
    }
  });

  test('Check If Cache Has version 1.5.0 ', async () => {
    const versionArray = await fsex.readJSON(releaseCacheFile, {
      encoding: 'utf-8',
    });
    //console.log(`Releases: ${versionArray}`);
    assert.equal(
      _.includes(versionArray, 'v1.5.0'),
      true,
      'Expecting releases to have version v1.5.0'
    );
  });

  test('Check Get Version Number from GitHub Tag ', () => {
    const versionNumber = asVersionNumber('v1.5.0');
    assert.equal(
      '1.5.0',
      versionNumber,
      `Expected "1.5.0" but got ${versionNumber}`
    );
  });

  test('Check Get Version Number as GitHub Tag ', () => {
    const ghTag = asGithubTag('1.5.0');
    assert.equal('v1.5.0', ghTag, `Expected "v1.5.0" but got ${ghTag}`);
  });
});
