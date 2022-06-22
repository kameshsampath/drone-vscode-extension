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
import { DRONE_CLI_COMMAND, getToolLocationFromConfig } from './util/settings';
import * as yaml from 'js-yaml';
import * as fsex from 'fs-extra';

export interface DroneCli {
  exec(): Promise<void>;
  about(): Promise<void>;
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
}

export function create(): DroneCli {
  return new DroneCliImpl();
}

class DroneCliImpl implements DroneCli {
  async exec(): Promise<void> {
    let droneFile: string;
    let workspaceFolder: vscode.WorkspaceFolder;
    let droneFileUri: vscode.Uri;
    const cmdArgs: string[] = new Array<string>('exec');
    const droneFiles = await vscode.workspace.findFiles(
      '**/.drone.yml',
      '**/.drone.yaml'
    );
    if (droneFiles?.length == 1) {
      droneFileUri = droneFiles[0];
      droneFile = vscode.workspace.asRelativePath(droneFileUri);
    } else if (droneFiles?.length > 1) {
      //TODO show quick pick allowing user to choose the pipeline file
    }

    if (droneFile) {
      workspaceFolder = vscode.workspace.getWorkspaceFolder(droneFileUri);
      const cwd = workspaceFolder.uri.fsPath;
      cmdArgs.push(droneFile);
      const pipelineName = await this.getPipelineName(
        path.join(cwd, droneFile)
      );

      //TODO run in terminal and other options ..
      const command = createCliCommand(DRONE_CLI_COMMAND, ...cmdArgs);
      await this.executeInTerminal(
        command,
        pipelineName,
        cwd,
        `Drone::Pipeline`
      );
    } else {
      vscode.window.showErrorMessage(
        "No drone pipeline file '.drone.yml' exists in the workspace"
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
