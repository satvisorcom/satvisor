/// <reference types="vite/client" />
/// <reference types="svelte" />

declare module '*.glsl?raw' {
  const value: string;
  export default value;
}

declare const __COMMIT_HASH__: string;
declare const __COMMIT_DATE__: string;
