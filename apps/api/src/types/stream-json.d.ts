declare module "stream-json" {
  export function parser(): NodeJS.ReadWriteStream;
}

declare module "stream-json/streamers/StreamArray.js" {
  export function streamArray(): NodeJS.ReadWriteStream;
}

declare module "stream-json/filters/Pick.js" {
  export function pick(options: { filter: string }): NodeJS.ReadWriteStream;
}
