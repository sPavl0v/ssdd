// Release targets (7.1, 7.3): Bun target → release file, npm package, wheel platform tag.
export interface Target {
  bun: string;
  file: string;
  os: "linux" | "darwin" | "win32";
  cpu: "x64" | "arm64";
  wheel: string;
}

export const TARGETS: Target[] = [
  { bun: "bun-linux-x64", file: "ssdd-linux-x64", os: "linux", cpu: "x64", wheel: "manylinux_2_17_x86_64" },
  { bun: "bun-linux-arm64", file: "ssdd-linux-arm64", os: "linux", cpu: "arm64", wheel: "manylinux_2_17_aarch64" },
  { bun: "bun-darwin-x64", file: "ssdd-darwin-x64", os: "darwin", cpu: "x64", wheel: "macosx_10_15_x86_64" },
  { bun: "bun-darwin-arm64", file: "ssdd-darwin-arm64", os: "darwin", cpu: "arm64", wheel: "macosx_11_0_arm64" },
  { bun: "bun-windows-x64", file: "ssdd-windows-x64.exe", os: "win32", cpu: "x64", wheel: "win_amd64" },
];

export const npmPackageName = (t: Target) => `ssdd-${t.os}-${t.cpu}`;
