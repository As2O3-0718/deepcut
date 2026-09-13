// Public backend address only. Never put API keys in this file.
export const CLOUD_API='https://deepcut-api.2116184563.workers.dev';
export const isLocalAPI=['127.0.0.1','localhost'].includes(location.hostname);
export const hasGameAPI=isLocalAPI||location.protocol==='https:'&&!!CLOUD_API;
export function gameFetch(path,options){return fetch((isLocalAPI?'':CLOUD_API)+path,options)}
