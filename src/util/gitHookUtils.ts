import * as vscode from 'vscode';
import { GitExtension, Repository } from '../types/git';

export interface GitHookUtil {
  addPostCommitHook(): Promise<void>;
  removePostCommitHook(): Promise<void>;
}

interface GitContext {
  readonly gitRootFolder: vscode.WorkspaceFolder;
  readonly gitRepository: Repository;
}

export async function GitHookUtil(
  gitRootFolder: vscode.WorkspaceFolder
): Promise<GitHookUtil> {
  const gitExtension =
    vscode.extensions.getExtension<GitExtension>('vscode.git').exports;
  const git = gitExtension.getAPI(1);

  //gitRepo will be null if the repository is not an existing git repo
  //i.e. no .git folder
  const gitRepo = await git.openRepository(gitRootFolder.uri);

  if (!gitRepo) {
    const initGitRepoRequest = await vscode.window.showInformationMessage(
      `No git repo available at workspace root ${gitRootFolder.uri.fsPath}, recommended to have git repository for doing continuous integration with Drone.`,
      'OK'
    );

    if (initGitRepoRequest === 'OK') {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Initializing git repository at "${gitRootFolder.uri.fsPath},"`,
          cancellable: false,
        },
        async (progress, token) => {
          await git.init(gitRootFolder.uri);
          progress.report({ increment: 100 });
          return;
        }
      );
    }
  }

  const gitContext: GitContext = {
    gitRootFolder,
    gitRepository: gitRepo,
  };
  return new GitHookUtilImpl(gitContext);
}

class GitHookUtilImpl implements GitHookUtil {
  constructor(private readonly context: GitContext) {
    this.context = context;
  }

  async addPostCommitHook(): Promise<void> {
    const gitRepoRoot = this.context.gitRepository.rootUri;
    console.log(`Add Post Commit Hook ${gitRepoRoot.path}`);
  }

  async removePostCommitHook(): Promise<void> {
    console.log('Remove Post Commit Hook');
  }
}
