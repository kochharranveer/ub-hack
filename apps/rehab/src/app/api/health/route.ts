import { health } from "@platform/production/health";
export const dynamic="force-dynamic";
export function GET(){return health("rehab");}
