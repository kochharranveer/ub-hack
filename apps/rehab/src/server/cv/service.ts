// Panda-owned boundary. Yuvraj's service runs unchanged behind this adapter.
import { cvService } from "../../../../../packages/yuvraj-integration/service";
export { cvService, type CvStoreData, type CvStore } from "../../../../../packages/yuvraj-integration/service";
export const cv=cvService();
