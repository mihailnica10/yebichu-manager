declare module "@novnc/novnc" {
  interface RFBOptions {
    credentials?: { password?: string; username?: string; target?: string };
    repeaterID?: string;
    shared?: boolean;
  }

  class RFB {
    constructor(target: HTMLElement, url: string, options?: RFBOptions);
    disconnect(): void;
    sendCredentials(creds: { password?: string; username?: string; target?: string }): void;
    sendCtrlAltDel(): void;
    requestResize(): void;
    viewOnly: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    desktopName: string;
    addEventListener(type: string, handler: (e: CustomEvent) => void): void;
    removeEventListener(type: string, handler: (e: CustomEvent) => void): void;
  }

  export default RFB;
}
