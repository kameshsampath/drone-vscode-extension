/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Harness, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as _ from 'lodash';
import { loadAndGetSteps } from '../util/pipelineYamlUtils';
import { DroneCli } from '../drone';
import * as fsex from 'fs-extra';

export async function runStep(droneCli: DroneCli): Promise<void>{
  const editor = vscode.window.activeTextEditor;

  if (editor){
    const document = editor.document;
    try {
      const pipelineSteps = loadAndGetSteps(document.getText());
      const step = document.getText(editor.selection);
      const toRunSteps = _.intersection(pipelineSteps,[step]);
      if (toRunSteps){
        droneCli.exec(toRunSteps);
      }
    } catch (e:any){
      vscode.window.showErrorMessage(`Error running pipeline steps ${e}`);
    }
  }
}

export async function runSteps(droneCli: DroneCli): Promise<void>{
  const editor = vscode.window.activeTextEditor;
  let pipelineYAML:string;
  try {
    if (editor){
      const document = editor.document;
      pipelineYAML = document.getText();
    
    } else {
      //make sure we get the right context
      if (!droneCli.getContext().droneFile){
        await droneCli.refreshContext();
      }
      pipelineYAML = (await fsex.readFile(droneCli.getContext().droneFile.fsPath)).toString();
    }

    const pipelineSteps = loadAndGetSteps(pipelineYAML);
    const selectedSteps = await vscode.window.showQuickPick(pipelineSteps,{
      canPickMany: true,
      title:'Select Pipeline Steps to Run',
      ignoreFocusOut: true
    });
    console.log(`Step Result:${selectedSteps}`);
    if (selectedSteps && selectedSteps.length > 0) {
      const toRunSteps = _.intersection(pipelineSteps,selectedSteps);
      if (toRunSteps){
        droneCli.exec(toRunSteps);
      }
    } else {
      vscode.window.showInformationMessage('No steps selected to run');
    }
  } catch (e:any){
    vscode.window.showErrorMessage(`Error running pipeline steps ${e}`);
  }
}
