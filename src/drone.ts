/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Harness, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
  cli,
  CliCommand,
  cliCommandToString,
  CliExitData,
  createCliCommand,
} from './cli';
import * as path from 'path';
import { WindowUtil } from './util/windowUtils';
import { Terminal, window } from 'vscode';
import {
  DRONE_CLI_COMMAND,
  getToolLocationFromConfig,
  isRunOnGitCommit,
  isRunTrusted,
} from './util/settings';
import * as yaml from 'js-yaml';
import * as fsex from 'fs-extra';
import { GitHookUtil } from './util/gitHookUtils';
import { Errorable, failed } from './errorable';
import { NewInstaller as DroneCliInstaller } from './util/installDroneCli';
import { Platform } from './util/platform';
import * as _ from 'lodash';

export interface DroneCli {
  exec(includeSteps?: string[],excludeSteps?:string[]): Promise<void>;
  about(): Promise<void>;
  addDroneCliToPath(): Promise<Errorable<string>>;
  executeInTerminal(
    command: CliCommand,
    resourceName?: string,
    cwd?: string
  ): void;
  execute(
    command: CliCommand,
    cwd?: string,
    fail?: boolean
  ): Promise<CliExitData>;
  handleConfigChange(): Promise<void>;
  refreshContext(): Promise<void>;
  getContext(): DroneContext;
}

export interface DroneContext {
  droneFile: vscode.Uri;
  droneWorkspaceFolder: vscode.WorkspaceFolder;
  gitHookUtil: GitHookUtil;
}

//TODO cleanup
export async function initDroneContext(): Promise<DroneContext | undefined> {
  const droneFiles = await vscode.workspace.findFiles('**/.drone.yml');
  let droneFileUri = _.first(droneFiles);

  let droneWorkspaceFolder = _.first(vscode.workspace.workspaceFolders);

  if (!droneFileUri) {
    const droneFileCreateRequest = await vscode.window.showWarningMessage(
      'No Drone pipeline file exists, do want to create one ?',
      'Yes',
      'No'
    );

    if (droneFileCreateRequest === 'Yes') {
      droneFileUri = await createAndOpenDronePipelineFile(droneWorkspaceFolder);
    } else {
      const confirmRequest = await vscode.window.showWarningMessage(
        'Without Drone pipeline file, Drone features may not work correctly.',
        'Create Drone Pipeline',
        'OK'
      );
      if (confirmRequest === 'Create Drone Pipeline') {
        droneFileUri = await createAndOpenDronePipelineFile(
          droneWorkspaceFolder
        );
      } else {
        return {
          droneFile: null,
          droneWorkspaceFolder,
          gitHookUtil: null,
        };
      }
    }
  }

  droneWorkspaceFolder = vscode.workspace.getWorkspaceFolder(droneFileUri);

  const gitHookUtil = await GitHookUtil(
    vscode.workspace.asRelativePath(droneFileUri),
    droneWorkspaceFolder
  );

  return {
    droneFile: droneFileUri,
    droneWorkspaceFolder,
    gitHookUtil,
  };
}

async function createAndOpenDronePipelineFile(
  droneWorkspaceFolder: vscode.WorkspaceFolder
): Promise<vscode.Uri> {
  const droneFileUri = await createDroneFile(droneWorkspaceFolder);
  const doc = await vscode.workspace.openTextDocument(droneFileUri);
  await vscode.window.showTextDocument(doc, {
    preview: true,
    preserveFocus: true,
  });
  return droneFileUri;
}

export async function create(droneContext: DroneContext): Promise<DroneCli> {
  return new DroneCliImpl(droneContext);
}

class DroneCliImpl implements DroneCli {
  constructor(private context: DroneContext) {
    this.context = context;
  }

  getContext(): DroneContext{
    return this.context;
  }

  async refreshContext(): Promise<void> {
    this.context = await initDroneContext();
  }

  async addDroneCliToPath(): Promise<Errorable<string>> {
    //Ensure Drone installed
    const droneCliInstaller = DroneCliInstaller();
    const installResult = await droneCliInstaller.installOrUpgradeDroneCli();
    if (failed(installResult)) {
      return installResult;
    } else {
      if (Platform.OS === 'darwin' || Platform.OS === 'linux') {
        const destPath = await vscode.window.showInputBox({
          title: 'Add drone cli to user PATH',
          prompt: 'Where to create the link for drone cli?',
          placeHolder: `${Platform.getUserHomePath()}/.local/bin`,
          value: `${Platform.getUserHomePath()}/.local/bin`,
        });

        if (destPath) {
          await fsex.ensureDir(destPath, { mode: 0o755 });
          const symlinkPath = path.join(destPath, DRONE_CLI_COMMAND);
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Adding 'drone' cli to ${symlinkPath}`,
              cancellable: false,
            },
            async (progress) => {
              const droneCli = getToolLocationFromConfig();
              await fsex.ensureSymlink(droneCli, symlinkPath);
              progress.report({ increment: 100 });
              return { succeeded: true, result: symlinkPath };
            }
          );
        }
      } else if (Platform.OS === 'windows') {
        //TODO
      }
    }
  }

  async handleConfigChange(): Promise<void> {
    const val = isRunOnGitCommit();
    if (val) {
      await this.context.gitHookUtil.addPostCommitHook();
    } else {
      await this.context.gitHookUtil.removePostCommitHook();
    }
    // handling any drone exec parameter changes
    if (val && (isRunTrusted() || !isRunTrusted())) {
      await this.context.gitHookUtil.updatePostCommitHook();
    }
  }

  async exec(includeSteps?: string[],excludeSteps?:string[]): Promise<void> {
    const cmdArgs: string[] = new Array<string>('exec');
    const droneFile = vscode.workspace.asRelativePath(this.context.droneFile);
    if (droneFile) {
      const cwd = this.context.droneWorkspaceFolder.uri.fsPath;
      cmdArgs.push(droneFile);
      if (isRunTrusted()) {
        cmdArgs.push('--trusted');
      }
      if (includeSteps){
        includeSteps.forEach(iStep => cmdArgs.push(`--include=${iStep}`));
      }
      if (excludeSteps){
        excludeSteps.forEach(eStep => cmdArgs.push(`--exclude=${eStep}`));
      }
      const pipelineName = await this.getPipelineName(
        path.join(cwd, droneFile)
      );

      //TODO run in terminal and other options ..
      const command = createCliCommand(DRONE_CLI_COMMAND, ...cmdArgs);
      await this.executeInTerminal(
        command,
        pipelineName,
        cwd,
        'Drone::Pipeline'
      );
    } else {
      vscode.window.showErrorMessage(
        'No drone pipeline file ".drone.yml" exists in the workspace'
      );
    }
  }

  async getPipelineName(droneFilePath: string): Promise<string | undefined> {
    const strYaml = await fsex.readFile(droneFilePath);
    const pipelineDoc = yaml.load(strYaml.toString());
    return pipelineDoc['name'];
  }

  async about(): Promise<void> {
    const cmd = createCliCommand('drone', '--version');
    const result = await this.execute(cmd);
    if (result.error) {
      window.showErrorMessage(`Error ${result.error} `);
    }

    window.showInformationMessage(`${result.stdout}`);
  }

  async execute(
    command: CliCommand,
    cwd?: string,
    fail = true
  ): Promise<CliExitData> {
    const toolLocation = getToolLocationFromConfig();
    if (toolLocation) {
      // eslint-disable-next-line require-atomic-updates
      command.cliCommand = command.cliCommand
        .replace('drone', `"${toolLocation}"`)
        .replace(new RegExp('&& drone', 'g'), `&& "${toolLocation}"`);
    }

    return cli
      .execute(command, cwd ? { cwd } : {})
      .then(async (result) =>
        result.error && fail ? Promise.reject(result.error) : result
      )
      .catch((err) =>
        fail
          ? Promise.reject(err)
          : Promise.resolve({ error: null, stdout: '', stderr: '' })
      );
  }

  async executeInTerminal(
    command: CliCommand,
    resourceName?: string,
    cwd: string = process.cwd(),
    name = 'Drone'
  ): Promise<void> {
    let toolLocation = getToolLocationFromConfig();
    if (toolLocation) {
      toolLocation = path.dirname(toolLocation);
    }
    let terminal: Terminal;
    if (resourceName) {
      terminal = WindowUtil.createTerminal(
        `${name}:${resourceName}`,
        cwd,
        toolLocation
      );
    } else {
      terminal = WindowUtil.createTerminal(name, cwd, toolLocation);
    }
    terminal.sendText(cliCommandToString(command), true);
    terminal.show();
  }
}

async function createDroneFile(
  rootFolder?: vscode.WorkspaceFolder
): Promise<vscode.Uri> {
  if (rootFolder) {
    const droneFile = vscode.Uri.file(
      path.join(rootFolder.uri.fsPath, '.drone.yml')
    );
    await fsex.writeFile(
      droneFile.fsPath,
      `kind: pipeline
type: docker
name: my-pipeline
platform:
  os: linux
  arch: ${Platform.ARCH}
steps:
  - name: step-name
    image: busybox
    commands:
    - echo 'Test World'
`
    );
    return droneFile;
  } else {
    vscode.window.showErrorMessage('No folder exists in workspace');
  }
}
