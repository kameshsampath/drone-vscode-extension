/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Harness, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as path from 'path';
import { which } from 'shelljs';
import { Errorable, failed, succeeded } from '../errorable';
import { Platform } from './platform';
import {
  addPathToConfig,
  DRONE_CLI_COMMAND,
  getInstallFolder,
  getToolLocation,
  toolPathBaseKey,
  toolPathOSKey,
} from './settings';
import {
  asVersionNumber,
  cacheAndGetLatestRelease,
  ToolVersionInfo,
} from './versionUtils';
import * as fsex from 'fs-extra';
import * as semver from 'semver';
import { cli, createCliCommand } from '../cli';
import { DownloadUtil } from './download';
import { Archive } from './archive';

export async function installOrUpgradeDroneCli(
  version: string | null
): Promise<void> {
  const whichLocation = which(DRONE_CLI_COMMAND);
  const toolLocations: string[] = [
    path.join(getToolLocation(), DRONE_CLI_COMMAND),
    whichLocation ? whichLocation.stdout : '',
  ];

  const result = await downloadAndInstallTool(toolLocations);
  if (result.succeeded) {
    const baseKey = toolPathBaseKey(DRONE_CLI_COMMAND);
    const osKey = toolPathOSKey(Platform.OS, DRONE_CLI_COMMAND);
    await addPathToConfig(baseKey, result.result);
    await addPathToConfig(osKey, result.result);
  }
}

async function downloadAndInstallTool(
  locations: string[]
): Promise<Errorable<string>> {
  const os = Platform.OS;
  const arch = Platform.ARCH;
  let toolExists = false;
  let versionInfo: ToolVersionInfo;
  let toolLocation: string = '';
  for (const location of locations) {
    if (await fsex.pathExists(location)) {
      toolExists = true;
      toolLocation = location;
      versionInfo = await getToolVersionInfo(location);
      break;
    }
  }

  if (toolExists) {
    const avblVersionNumber = asVersionNumber(versionInfo.availableVersion);
    const url = `https://github.com/harness/drone-cli/releases/download/${versionInfo.availableVersion}/drone_${os}_${arch}.tar.gz`;
    const isUpgradeNeeded = semver.lt(
      versionInfo.currentVersion,
      avblVersionNumber
    );
    if (isUpgradeNeeded) {
      const upgradeRequest = await vscode.window.showInformationMessage(
        `${DRONE_CLI_COMMAND}  upgrade available to ${versionInfo.availableVersion}, currently on ${versionInfo.currentVersion}`,
        'Install'
      );
      if (upgradeRequest === 'Install') {
        installTool(url, avblVersionNumber);
      }
    }
    return {
      succeeded: true,
      result: toolLocation,
    };
  } else {
    const versionResult = await getStableDroneVersion();
    if (succeeded(versionResult)) {
      const latestVersion = versionResult.result;
      const url = `https://github.com/harness/drone-cli/releases/download/${latestVersion}/drone_${os}_${arch}.tar.gz`;
      installTool(url, latestVersion);
      toolLocation = getToolLocation();
    } else {
      vscode.window.showErrorMessage(
        `Error downloading Drone CLI ${versionResult.error}`
      );
    }
    return {
      succeeded: true,
      result: path.join(toolLocation, DRONE_CLI_COMMAND),
    };
  }
}

async function installTool(url: string, version: string) {
  const toolLocation = getToolLocation();
  const toolArchiveFile = path.join(getInstallFolder(), 'drone-cli.tar.gz');
  await fsex.ensureDir(getInstallFolder());

  await vscode.window.withProgress(
    {
      cancellable: true,
      location: vscode.ProgressLocation.Notification,
      title: `Downloading Drone cli version ${version}`,
    },
    (progress: vscode.Progress<{ increment: number; message: string }>) =>
      DownloadUtil.downloadFile(url, toolArchiveFile, (dlProgress, increment) =>
        progress.report({ increment, message: `${dlProgress}%` })
      )
  );

  await Archive.unzip(toolArchiveFile, toolLocation, '');
  await fsex.remove(toolArchiveFile);
}

async function getStableDroneVersion(): Promise<Errorable<string>> {
  const toolsBaseFolder = getInstallFolder();
  const toolReleasesFile = path.join(
    toolsBaseFolder,
    'drone-cli-releases.json'
  );
  const releaseCacheFile = `${toolReleasesFile}`;
  const releaseResult = await cacheAndGetLatestRelease(
    'harness',
    'drone-cli',
    releaseCacheFile
  );

  if (failed(releaseResult)) {
    return { succeeded: false, error: releaseResult.error };
  }

  return { succeeded: true, result: releaseResult.result };
}

async function getToolVersionInfo(
  toolLocation: string
): Promise<ToolVersionInfo | undefined> {
  let currentVersion: string;
  let availableVersion: string;

  const version = new RegExp(
    /^drone\s*version\s*.*([0-9]+\.[0-9]+\.[0-9]+?[-\w]*).*$/
  );
  const sr = await cli.execute(createCliCommand(toolLocation, ' --version'));

  if (sr.error) {
    throw new Error(
      `Error checking for drone updates: ${sr ? sr.error : 'cannot run drone'}`
    );
  }

  const lines = sr.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const toolVersion: string = version.exec(lines[0])[1];
  if (toolVersion.length) {
    currentVersion = toolVersion;
  }

  const versionRes = await getStableDroneVersion();

  if (failed(versionRes)) {
    vscode.window.showErrorMessage(
      `Failed to determine drone cli version: ${versionRes.error}`
    );
    return;
  }

  if (currentVersion === null || availableVersion === null) {
    throw new Error(
      `Unable to get version from drone cli version check: ${lines}`
    );
  }

  return {
    currentVersion: currentVersion,
    availableVersion: versionRes.result,
  } as ToolVersionInfo;
}
