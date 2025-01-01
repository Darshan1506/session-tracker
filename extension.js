const vscode = require("vscode");
const { createRepository } = require("./helper/createRepository");
const { startActivityTracker, stopActivityTracker } = require("./helper/startActivityTracker");


async function getGitHubToken(context) {
    const token = await context.globalState.get("githubAccessToken");
    if (token) return token;

    try {
        const session = await vscode.authentication.getSession("github", ["repo"], { createIfNone: true });
        if (session) {
            const accessToken = session.accessToken;
            await context.globalState.update("githubAccessToken", accessToken);
            vscode.window.showInformationMessage("GitHub authentication successful.");
            return accessToken;
        }
    } catch (error) {
        console.error("Authentication error:", error);
        vscode.window.showErrorMessage("GitHub authentication failed: " + error.message);
    }

    return null;
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    let trackerActive = false;

    const disposable = vscode.commands.registerCommand("code-trackin.start", async () => {
        if (trackerActive) {
            vscode.window.showInformationMessage("Code tracker is already running.");
            return;
        }

        try {
            const token = await getGitHubToken(context);
            if (!token) {
                vscode.window.showErrorMessage("GitHub authentication is required to start tracking.");
                return;
            }

            let repoUrl = await context.globalState.get("repoUrl");

            if (!repoUrl) {
                repoUrl = await createRepository(token, "code-tracking", "Daily activity tracker", true);
                if (repoUrl) {
                    await context.globalState.update("repoUrl", repoUrl);
                }
            }

            if (repoUrl) {
                startActivityTracker(context, repoUrl, token);
                trackerActive = true;
                vscode.window.showInformationMessage("Code tracking started successfully.");
            } else {
                vscode.window.showErrorMessage("Failed to initialize repository for tracking.");
            }
        } catch (error) {
            console.error("Error starting tracker:", error);
            vscode.window.showErrorMessage("Failed to start code tracking: " + error.message);
        }
    });

    const stopCommand = vscode.commands.registerCommand("code-trackin.stop", () => {
        if (!trackerActive) {
            vscode.window.showInformationMessage("Code tracker is not running.");
            return;
        }

        stopActivityTracker();
        trackerActive = false;
    });

    context.subscriptions.push(disposable, stopCommand);
}

function deactivate() {
    // Cleanup code if needed
}

module.exports = {
    activate,
    deactivate,
};