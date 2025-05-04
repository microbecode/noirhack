// digitalbazaar__did-method-web.d.ts
declare module '@digitalbazaar/did-method-web' {
  // We don't know the exact types, so we can use 'any' for now
  // In a real scenario, you might inspect the library or its docs
  // to provide more specific types for better intellisense.
  export function getResolver(): { web: (didUrl: string, options?: any) => Promise<any> };
} 