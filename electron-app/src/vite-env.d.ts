/// <reference types="vite/client" />

/**
 * Why: tells TypeScript that .module.css imports return a record of
 * class names to scoped strings, so `styles.foo` type-checks correctly.
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
