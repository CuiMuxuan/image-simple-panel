import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));
const version = packageJson.version;
const appName = "image-simple-panel";
const releaseDir = path.join(rootDir, "release");
const packageDir = path.join(releaseDir, "ImageSimplePanel");
const exeName = "image-simple-panel.exe";

async function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(" ")}`);
  await execFileAsync(command, args, {
    cwd: rootDir,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 20,
    ...options
  });
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(source, target) {
  await fs.rm(target, { recursive: true, force: true });
  await fs.cp(source, target, { recursive: true });
}

async function pruneNodeModules(nodeModulesDir) {
  const removePatterns = [
    ".bin",
    "@types",
    "@vitejs",
    "concurrently",
    "tsx",
    "typescript",
    "vite",
    "react",
    "react-dom",
    "lucide-react"
  ];
  await Promise.all(removePatterns.map((name) => fs.rm(path.join(nodeModulesDir, name), { recursive: true, force: true })));

  const entries = await fs.readdir(nodeModulesDir, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(nodeModulesDir, entry.name);
    if (entry.name.startsWith(".")) {
      await fs.rm(fullPath, { recursive: true, force: true });
    }
  }));
}

async function buildSeaExecutable() {
  const seaConfigPath = path.join(releaseDir, "sea-config.json");
  const blobPath = path.join(releaseDir, "sea-prep.blob");
  const exePath = path.join(packageDir, exeName);
  const postjectCli = path.join(rootDir, "node_modules", "postject", "dist", "cli.js");
  const nodeExePath = process.execPath;

  await fs.writeFile(seaConfigPath, JSON.stringify({
    main: path.join(rootDir, "build", "sea-entry.cjs").replaceAll("\\", "/"),
    output: blobPath.replaceAll("\\", "/"),
    disableExperimentalSEAWarning: true
  }, null, 2));

  await run(process.execPath, ["--experimental-sea-config", seaConfigPath]);
  await fs.copyFile(nodeExePath, exePath);
  await run(process.execPath, [
    postjectCli,
    exePath,
    "NODE_SEA_BLOB",
    blobPath,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
  ]);
}

async function writeMetadata() {
  await fs.writeFile(path.join(packageDir, "VERSION.txt"), `${version}\n`, "utf8");
  await fs.writeFile(path.join(packageDir, "README.txt"), [
    "Simple Image Panel",
    "",
    "Double-click image-simple-panel.exe to start the local image generation panel.",
    "The application opens your default browser and stores data under:",
    "%LOCALAPPDATA%\\ImageSimplePanel",
    ""
  ].join("\r\n"), "utf8");
}

async function zipPortablePackage() {
  const zipPath = path.join(releaseDir, `${appName}-windows-x64.zip`);
  await fs.rm(zipPath, { force: true });
  await run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Compress-Archive -Path '${packageDir}\\*' -DestinationPath '${zipPath}' -Force`
  ]);
}

await fs.rm(releaseDir, { recursive: true, force: true });
await fs.mkdir(packageDir, { recursive: true });

await copyDir(path.join(rootDir, "dist"), path.join(packageDir, "dist"));
await copyDir(path.join(rootDir, "dist-desktop", "server"), path.join(packageDir, "server"));
await copyDir(path.join(rootDir, "node_modules"), path.join(packageDir, "node_modules"));
await pruneNodeModules(path.join(packageDir, "node_modules"));

await buildSeaExecutable();
await writeMetadata();
await zipPortablePackage();

const installerPath = path.join(releaseDir, `${appName}-windows-x64-setup.exe`);
const portablePath = path.join(releaseDir, `${appName}-windows-x64.zip`);

console.log("");
console.log("Windows release package prepared:");
console.log(`- ${portablePath}`);
if (await pathExists(installerPath)) {
  console.log(`- ${installerPath}`);
} else {
  console.log("- Installer not built yet. Run Inno Setup with release/setup.iss.");
}
