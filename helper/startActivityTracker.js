const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
const fsExtra = require("fs-extra");
const diff = require("diff");

let activityLog = {};
let extensionContext;

function getStoragePaths() {
    if (!extensionContext) {
        throw new Error("Extension context not initialized");
    }
    const globalStoragePath = extensionContext.globalStoragePath;
    
    const paths = {
        logsDir: path.join(globalStoragePath, 'logs'),
        tempDir: path.join(globalStoragePath, 'temp'),
        repoDir: path.join(globalStoragePath, 'repo')
    };

    Object.values(paths).forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    return paths;
}

const changeTracker = vscode.workspace.onDidChangeTextDocument((event) => {
    const document = event.document;
    if (document.isUntitled || document.uri.scheme !== "file") {
        return;
    }

    const filePath = document.uri.fsPath;
    if (!activityLog[filePath]) {
        activityLog[filePath] = { changes: 0 };
    }

    activityLog[filePath].changes++;
});

function calculateDiff(filePath) {
    const { tempDir } = getStoragePaths();
    const tempFilePath = path.join(tempDir, path.basename(filePath));
    
    try {
        const currentContent = fs.readFileSync(filePath, "utf-8");
        let added = 0, removed = 0;

        if (fs.existsSync(tempFilePath)) {
            const oldContent = fs.readFileSync(tempFilePath, "utf-8");
            const diffResult = diff.diffLines(oldContent, currentContent);

            diffResult.forEach((part) => {
                if (part.added) {
                    added += part.value
                        .split("\n")
                        .filter((line) => line.trim() !== "").length;
                } else if (part.removed) {
                    removed += part.value
                        .split("\n")
                        .filter((line) => line.trim() !== "").length;
                }
            });
        }

        fs.writeFileSync(tempFilePath, currentContent, "utf-8");
        return { added, removed };
    } catch (error) {
        console.error(`Error calculating diff for ${filePath}:`, error);
        return { added: 0, removed: 0 };
    }
}

function generateActivitySummary() {
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    const recentActivity = Object.entries(activityLog);

    if (recentActivity.length === 0) {
        return "No activity in the last 30 minutes.";
    }

    const summary = recentActivity.map(([filePath]) => {
        if (fs.existsSync(filePath)) {
            const { added, removed } = calculateDiff(filePath);
            const relativePath = vscode.workspace.asRelativePath(filePath);
            return `File: ${relativePath}, Changes: +${added} -${removed}`;
        }
        return `File: ${filePath} (deleted or not accessible)`;
    });

    return summary.join("\n");
}

function createDailyLogDir() {
    const { logsDir } = getStoragePaths();
    const today = new Date().toISOString().split("T")[0];
    const dailyDir = path.join(logsDir, today);
    if (!fs.existsSync(dailyDir)) {
        fs.mkdirSync(dailyDir, { recursive: true });
    }

    return dailyDir;
}

async function commitAndPush(repoUrl, token) {
    const { repoDir, logsDir } = getStoragePaths();
    const lockFilePath = path.join(repoDir, ".git", "index.lock");

    try {
        execSync(`git config --global credential.helper store`, { stdio: "ignore" });
        const repoUrlWithToken = repoUrl.replace('https://', `https://oauth2:${token}@`);

        if (fs.existsSync(lockFilePath)) {
            fs.unlinkSync(lockFilePath);
        }

        if (!fs.existsSync(path.join(repoDir, ".git"))) {
            execSync(`git init`, { cwd: repoDir, stdio: "ignore" });
            execSync(`git remote add origin "${repoUrlWithToken}"`, {
                cwd: repoDir,
                stdio: "ignore",
            });
        }

        fsExtra.copySync(logsDir, path.join(repoDir, "logs"), { overwrite: true });

        const status = execSync(`git status --porcelain`, { cwd: repoDir })
            .toString()
            .trim();
            
        if (!status) {
            console.log("No changes to commit.");
            return;
        }

        execSync(`git add .`, { cwd: repoDir, stdio: "ignore" });
        execSync(`git commit -m "Update activity logs - ${new Date().toISOString()}"`, 
            { cwd: repoDir, stdio: "ignore" });
        execSync(`git push --set-upstream origin master --force`, {
            cwd: repoDir,
            stdio: "ignore",
        });

        console.log("Logs committed and pushed successfully.");
    } catch (error) {
        console.error("Error during Git operations:", error);
        vscode.window.showErrorMessage(`Failed to push logs: ${error.message}`);
    }
}

function startActivityTracker(context, repoUrl, token, interval = 15 * 60 * 1000) {
    extensionContext = context;
    console.log(interval)
    if (global.trackerInterval) {
        clearInterval(global.trackerInterval);
    }

    const { logsDir, tempDir, repoDir } = getStoragePaths();

    global.trackerInterval = setInterval(async () => {
        try {
            const dailyDir = createDailyLogDir();
            const currentTime = new Date();
            const logFileName = `${currentTime
                .toISOString()
                .split("T")[1]
                .slice(0, 5)
                .replace(":", "-")}.txt`;
            const logFilePath = path.join(dailyDir, logFileName);
            
            const activitySummary = generateActivitySummary();
            fs.writeFileSync(logFilePath, activitySummary);
            console.log(logFileName);
            await commitAndPush(repoUrl, token);
            
            activityLog = {};
            
        } catch (error) {
            console.error("Error in activity tracker:", error);
            vscode.window.showErrorMessage(`Activity tracking error: ${error.message}`);
        }
    }, interval);

    context.subscriptions.push({
        dispose: () => {
            if (global.trackerInterval) {
                clearInterval(global.trackerInterval);
            }
            changeTracker.dispose();
        }
    });
}

function stopActivityTracker() {
    if (!global.trackerInterval) {
        vscode.window.showInformationMessage("Activity tracker is not running.");
        return;
    }

    clearInterval(global.trackerInterval);
    global.trackerInterval = null;
    vscode.window.showInformationMessage("Activity tracker stopped.");
}

module.exports = {
    startActivityTracker,
    stopActivityTracker
};