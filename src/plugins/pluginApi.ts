/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Harness, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import * as fsex from 'fs-extra';
import * as _ from 'lodash';
import * as path from 'path';
import { Platform } from '../util/platform';
import { getInstallFolder } from '../util/settings';

export interface DronePluginSettings{
	title: string
	description: string
	required: boolean
	secret: boolean
	defaultValue: any,
	type: string
}

export interface DronePlugin {
	id: string
	name: string
	description: string
	image:string
	tags: string
	settings: DronePluginSettings[]
	example: string
	url: string
}

//TODO get the plugins.json path from settings
export async function searchPluginsByNameOrTags(...searchTerms): Promise<DronePlugin[]>{
  let matchedPlugins = new Array<DronePlugin>;
  const homePath = Platform.getUserHomePath();
  if (homePath){
    const pluginJsonPath = path.join(getInstallFolder(),'plugins','plugins.json');

    const dronePlugins: DronePlugin[] = await fsex.readJSON(pluginJsonPath);

    if (searchTerms && searchTerms.length > 0){
      matchedPlugins = _.filter(dronePlugins, (o) =>{
        let isMatched = false;
        searchTerms.forEach( t =>{
          const regExp = new RegExp('^.*' + t + '.*$','i');
          const tagMatches = _.some(o.tags, _.method('match',regExp));
          isMatched = isMatched || tagMatches || regExp.test(o.name);
        });
        return isMatched;
      });
    } else {
      return dronePlugins;
    }
  }
  
  return matchedPlugins;
}
