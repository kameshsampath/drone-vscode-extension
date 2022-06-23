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
    vscode.commands.registerCommand('vscode-drone.about', () =>
      droneCli.about()
    ),

    vscode.commands.registerCommand('vscode-drone.run', () => droneCli.exec()),
  ];

  disposables.forEach((e) => context.subscriptions.push(e));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (affectsUs) {
      droneCli.handleConfigChange();
    }
  });
}

// this method is called when your extension is deactivated
// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
