/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Harness, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import * as yaml from 'js-yaml';
import * as _ from 'lodash';


export function loadDoc(yamlFileContent: string): unknown[] {
  return yaml.loadAll(yamlFileContent);
}

export function loadAndGetSteps(yamlFileContent: string): string[]{
  const yamlDocs = loadDoc(yamlFileContent);
  const allSteps = [];
  yamlDocs.forEach(yamlDoc => {
    const steps = _.get(yamlDoc,'steps');
    allSteps.push(...steps);
  });
  //console.log(_.map(allSteps,'name'));
  return _.map(allSteps,'name');
}

export function getStepNames(steps: unknown[]): string[]{
  return _.map(steps,'name');
}

export function getStepImages(steps: unknown[]): string[]{
  return _.map(steps,'image');
}
    
