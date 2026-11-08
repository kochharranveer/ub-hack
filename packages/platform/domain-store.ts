import { JsonStore } from "./json-store";
import { productionEnabled } from "./production/config";
import { PostgresStore,type Domain } from "./production/database";
export function domainStore<T>(domain:Domain,file:string,seed:()=>T){return productionEnabled()?new PostgresStore(domain,seed):new JsonStore(file,seed);}
