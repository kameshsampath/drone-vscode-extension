/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Harness, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { create as DroneCli } from './drone';
import { installOrUpgradeDroneCli } from './util/installDroneCli';
import { affectsUs } from './util/settings';

export let contextGlobalState: vscode.ExtensionContext;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  contextGlobalState = context;

  await installOrUpgradeDroneCli(null);

  const droneCli = await DroneCli();

  const disposables = [
    vscode.commands.registerCommand('vscode-drone.about', (context) =>
      droneCli.about()
    ),

    vscode.commands.registerCommand('vscode-drone.run', (context) =>
      droneCli.exec()
    ),
  ];

  disposables.forEach((e) => context.subscriptions.push(e));

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (affectsUs) {
      droneCli.handleConfigChange();
    }
  });
}

// this method is called when your extension is deactivated
// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function execute<T>(
  command: (...args: T[]) => Promise<any> | void,
  ...params: T[]
): any | undefined {
  try {
    const res = command.call(null, ...params);
    return res && res.then
      ? res
          .then((result: string) => {
            displayResult(result);
          })
          .catch((err: Error) => {
            vscode.window.showErrorMessage(
              err.message ? err.message : err.toString()
            );
          })
      : undefined;
  } catch (err: any) {
    vscode.window.showErrorMessage(err);
  }
}

function displayResult(result?: string): void {
  if (result && typeof result === 'string') {
    vscode.window.showInformationMessage(result);
  }
}
