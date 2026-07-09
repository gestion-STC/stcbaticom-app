// Déclarations de types pour « ringover-sdk » (le paquet n'en fournit pas).
// SDK officiel Ringover : embarque le téléphone Ringover en iframe + événements d'appel.
// Doc : https://github.com/ringover/ringover-sdk
declare module "ringover-sdk" {
  interface Position {
    top?: string | null
    bottom?: string | null
    left?: string | null
    right?: string | null
  }

  interface RingoverOptions {
    type?: "fixed" | "relative" | "absolute"
    size?: "big" | "medium" | "small" | "auto"
    container?: string | null
    position?: Position
    border?: boolean
    animation?: boolean
    backgroundColor?: string
    trayicon?: boolean
    trayposition?: Position
  }

  // Données d'un événement d'appel (ringingCall / answeredCall / hangupCall).
  interface CallEventData {
    direction: "in" | "out"
    from_number: string
    to_number: string
    internal: boolean
    call_id: string
    ringDuration: number
    callDuration: number
  }

  interface RingoverEvent<T = unknown> {
    action: string
    data: T
  }

  export default class RingoverSDK {
    constructor(options?: RingoverOptions)
    generate(): HTMLIFrameElement | boolean
    destroy(): boolean
    checkStatus(force?: boolean): boolean
    show(): boolean
    hide(): boolean
    toggle(force?: boolean | null): boolean
    isDisplay(): boolean
    logout(): boolean
    reload(): boolean
    getCurrentPage(): string | boolean
    changePage(page: string): boolean
    dial(numberE164: string, fromNumberE164?: string | null): boolean
    sendSMS(to: string, content: string, from?: string | null): boolean
    openCallLog(callId: string): boolean
    on(event: "ringingCall" | "answeredCall" | "hangupCall", cb: (e: RingoverEvent<CallEventData>) => void): boolean
    on(event: "dialerReady" | "login" | "logout", cb: (e: RingoverEvent<{ userId: number }>) => void): boolean
    on(event: "changePage", cb: (e: RingoverEvent<{ page: string }>) => void): boolean
    on(event: string, cb: (e: RingoverEvent) => void): boolean
    off(): boolean
  }
}
