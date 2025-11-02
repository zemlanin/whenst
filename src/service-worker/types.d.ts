/** https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation */
declare interface NetworkInformation extends EventTarget {
  /** https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData */
  readonly saveData: boolean;
}

declare interface WorkerNavigator {
  /** https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation */
  readonly connection?: NetworkInformation;
}
