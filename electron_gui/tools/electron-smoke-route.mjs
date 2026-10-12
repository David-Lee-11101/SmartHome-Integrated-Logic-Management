export function routeElectronSmoke(executable, applicationArguments, platform = process.platform) {
  if (typeof executable !== "string" || executable.length === 0) throw new Error("Electron executable is required");
  if (!Array.isArray(applicationArguments) || applicationArguments.some(argument => typeof argument !== "string")) {
    throw new Error("Electron application arguments must be strings");
  }
  return platform === "linux"
    ? {command: "xvfb-run", args: ["-a", executable, ...applicationArguments]}
    : {command: executable, args: [...applicationArguments]};
}
