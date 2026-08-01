export type PlatformCapabilities = {
  dragAndDrop: boolean;
  browserDownload: boolean;
  nativeFileDialog: boolean;
};

export const browserCapabilities: PlatformCapabilities = {
  dragAndDrop: true,
  browserDownload: true,
  nativeFileDialog: false,
};
