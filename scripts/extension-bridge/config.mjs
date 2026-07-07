export const DEFAULT_WS_HOST = '127.0.0.1';
export const DEFAULT_WS_PORT = 7432;
export const DEFAULT_HTTP_HOST = '127.0.0.1';
export const DEFAULT_HTTP_PORT = 7433;
export const DEFAULT_COMMAND_TIMEOUT_MS = 30000;

export function resolveBridgeConfig(env = process.env) {
    return {
        wsHost: env.EXTENSION_BRIDGE_WS_HOST || DEFAULT_WS_HOST,
        wsPort: Number(env.EXTENSION_BRIDGE_WS_PORT || DEFAULT_WS_PORT),
        httpHost: env.EXTENSION_BRIDGE_HTTP_HOST || DEFAULT_HTTP_HOST,
        httpPort: Number(env.EXTENSION_BRIDGE_HTTP_PORT || DEFAULT_HTTP_PORT),
        commandTimeoutMs: Number(env.EXTENSION_BRIDGE_COMMAND_TIMEOUT_MS || DEFAULT_COMMAND_TIMEOUT_MS),
    };
}

export function wsUrl(config) {
    return `ws://${config.wsHost}:${config.wsPort}`;
}

export function httpBaseUrl(config) {
    return `http://${config.httpHost}:${config.httpPort}`;
}
