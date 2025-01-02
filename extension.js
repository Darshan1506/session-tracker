const vscode = require("vscode");
const { createRepository } = require("./helper/createRepository");
const {
  startActivityTracker,
  stopActivityTracker,
} = require("./helper/startActivityTracker");

async function getGitHubToken(context) {
  const token = await context.globalState.get("githubAccessToken");
  if (token) return token;

  try {
    const session = await vscode.authentication.getSession("github", ["repo"], {
      createIfNone: true,
    });
    if (session) {
      const accessToken = session.accessToken;
      await context.globalState.update("githubAccessToken", accessToken);
      vscode.window.showInformationMessage("GitHub authentication successful.");
      return accessToken;
    }
  } catch (error) {
    console.error("Authentication error:", error);
    vscode.window.showErrorMessage(
      "GitHub authentication failed: " + error.message
    );
  }

  return null;
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  let trackerActive = false;
  let trackerInterval = 15 * 60 * 1000;

  const disposable = vscode.commands.registerCommand(
    "code-trackin.start",
    async () => {
      if (trackerActive) {
        vscode.window.showInformationMessage(
          "Code tracker is already running."
        );
        return;
      }

      try {
        const token = await getGitHubToken(context);
        if (!token) {
          vscode.window.showErrorMessage(
            "GitHub authentication is required to start tracking."
          );
          return;
        }

        let repoUrl = await context.globalState.get("repoUrl");
        trackerInterval =
          (await context.globalState.get("trackerInterval")) || 15 * 60 * 1000;
        if (!repoUrl) {
          repoUrl = await createRepository(
            token,
            "code-tracking",
            "Daily activity tracker",
            true
          );
          if (repoUrl) {
            await context.globalState.update("repoUrl", repoUrl);
          }
        }

        if (repoUrl) {
          startActivityTracker(context, repoUrl, token, trackerInterval);
          trackerActive = true;
          vscode.window.showInformationMessage(
            "Code tracking started successfully."
          );
        } else {
          vscode.window.showErrorMessage(
            "Failed to initialize repository for tracking."
          );
        }
      } catch (error) {
        console.error("Error starting tracker:", error);
        vscode.window.showErrorMessage(
          "Failed to start code tracking: " + error.message
        );
      }
    }
  );

  const stopCommand = vscode.commands.registerCommand(
    "code-trackin.stop",
    () => {
      if (!trackerActive) {
        vscode.window.showInformationMessage("Code tracker is not running.");
        return;
      }

      stopActivityTracker();
      trackerActive = false;
    }
  );

  const setIntervalCommand = vscode.commands.registerCommand(
    "code-trackin.setInterval",
    async () => {
      const options = [
        { label: "15 Minutes", value: 15 * 1000 },
        { label: "30 Minutes", value: 30 * 1000 },
        { label: "1 Hour", value: 60 * 60 * 1000 },
        { label: "2 Hours", value: 2 * 60 * 60 * 1000 },
        { label: "4 Hours", value: 4 * 60 * 60 * 1000 },
      ];

      const selected = await vscode.window.showQuickPick(
        options.map((opt) => opt.label),
        { placeHolder: "Select code tracking interval" }
      );

      if (selected) {
        const interval = options.find((opt) => opt.label === selected)?.value;
        if (interval) {
          trackerInterval = interval;
          await context.globalState.update("trackerInterval", trackerInterval);
          vscode.window.showInformationMessage(
            `Tracking interval set to ${selected}.`
          );

          if (trackerActive) {
            stopActivityTracker();
            const token = await getGitHubToken(context);
            const repoUrl = await context.globalState.get("repoUrl");
            if (token && repoUrl) {
              startActivityTracker(context, repoUrl, token, trackerInterval);
            }
          }
        }
      }
    }
  );


  context.subscriptions.push(disposable, stopCommand, setIntervalCommand);
}

function deactivate() {
  // Cleanup code if needed
}

module.exports = {
  activate,
  deactivate,
};
