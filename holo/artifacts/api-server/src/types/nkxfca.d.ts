declare module "@neoaz07/nkxfca" {
  interface LoginOptions {
    online?: boolean;
    selfListen?: boolean;
    listenEvents?: boolean;
    autoMarkDelivery?: boolean;
    autoMarkRead?: boolean;
    autoReconnect?: boolean;
    simulateTyping?: boolean;
    randomUserAgent?: boolean;
    persona?: "desktop" | "android";
    maxConcurrentRequests?: number;
    maxRequestsPerMinute?: number;
    requestCooldownMs?: number;
    errorCacheTtlMs?: number;
    logging?: boolean;
  }

  interface NkxfcaAPI {
    listenMqtt(callback: (err: any, event: any) => void): void;
    sendMessage(
      msg: string | object,
      threadID: string,
      callback?: (err: any, info: any) => void,
      replyMessageID?: string
    ): void;
    sendMessageMqtt(
      msg: string | object,
      threadID: string,
      callback?: (err: any, info: any) => void
    ): void;
    getAppState(): object;
    getCurrentUserID(): string;
    getThreadInfo(threadID: string, callback: (err: any, data: any) => void): void;
    getThreadList(limit: number, timestamp: number | null, tags: string[], callback: (err: any, data: any) => void): void;
    removeUserFromGroup(userID: string, threadID: string, callback?: (err: any) => void): void;
    addUserToGroup(userID: string, threadID: string, callback?: (err: any, data: any) => void): void;
    gcname(newName: string, threadID: string, callback?: (err: any, data: any) => void): void;
    nickname(nickname: string, threadID: string, participantID: string, callback?: (err: any, data: any) => void): void;
    changeNickname(nickname: string, threadID: string, participantID: string, callback?: (err: any, data: any) => void): void;
    setMessageReaction(reaction: string, messageID: string, callback?: (err: any) => void, forceCustom?: boolean): void;
    setMessageReactionMqtt(reaction: string, messageID: string, threadID: string, callback?: (err: any) => void): void;
    getHealthStatus(): object;
    logout(): void;
    stopListening(): void;
    e2ee?: {
      enable(): void;
      getPublicKey(): string;
      setPeerKey(threadID: string, peerPublicKeyBase64: string): void;
    };
  }

  interface LoginCredentials {
    appState?: object | Array<{ key?: string; name?: string; value: string }>;
    email?: string;
    password?: string;
  }

  function login(
    credentials: LoginCredentials,
    options: LoginOptions,
    callback: (err: any, api: NkxfcaAPI) => void
  ): void;

  function login(
    credentials: LoginCredentials,
    options?: LoginOptions
  ): Promise<NkxfcaAPI>;
}
