/**
 * tests/audit/services-registry.ts
 *
 * Dynamically parses ALL_SERVICES from src/components/ServicesHub.tsx
 * to ensure 100% coverage across all 128 services without hardcoding.
 */

import fs from 'fs';
import path from 'path';

export interface ServiceItem {
  id: string;
  name: string;
  cat: string;
}

export function getAllServices(): ServiceItem[] {
  const filePath = path.resolve(process.cwd(), 'src/components/ServicesHub.tsx');
  const content = fs.readFileSync(filePath, 'utf8');

  const startIdx = content.indexOf('const ALL_SERVICES');
  const endIdx = content.indexOf('];', startIdx);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Could not locate ALL_SERVICES in ServicesHub.tsx');
  }

  const block = content.substring(startIdx, endIdx);
  const regex = /\{\s*id:\s*['"]([^'"]+)['"],\s*name:\s*['"]([^'"]+)['"][^}]+cat:\s*['"]([^'"]+)['"]/g;
  const services: ServiceItem[] = [];
  let m: RegExpExecArray | null;

  while ((m = regex.exec(block)) !== null) {
    services.push({
      id: m[1],
      name: m[2],
      cat: m[3]
    });
  }

  return services;
}
