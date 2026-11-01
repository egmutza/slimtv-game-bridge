import { type DeviceInfo, type SlimTVApi } from "../contract";
import { SHIM_MARK } from "../mark";
/** The page's window, including its globals (console, CustomEvent). */
export type ShimWindow = Window & typeof globalThis;
/** How the shim talks to native. Both directions carry JSON strings. */
export interface ShimTransport {
    /** Sends one JSON string to native. May throw; the shim catches it. */
    send(json: string): void;
    /** Starts delivering native messages. Called once, after "hello" is sent. */
    listen(onMessage: (data: unknown) => void): void;
}
export { SHIM_MARK };
/**
 * Installs window.SlimTV on `win` and starts talking to native through `transport`.
 * Returns the installed object, or null when window.SlimTV already existed. In that case nothing
 * is touched; an object this shim didn't create is reported as an error (CONTRACT.md "Name clash").
 */
export declare function createShim(win: ShimWindow, transport: ShimTransport | null, device: DeviceInfo): SlimTVApi | null;
