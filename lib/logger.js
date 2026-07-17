'use strict';

const TAG = 'moto-buds-plus';

export function info(...args) {
    console.log(`[${TAG}] ${args.join(' ')}`);
}

export function error(e, msg = '') {
    const text = `${msg} ${e instanceof Error ? `${e.message}\n${e.stack}` : String(e)}`.trim();
    console.error(`[${TAG}] ${text}`);
}